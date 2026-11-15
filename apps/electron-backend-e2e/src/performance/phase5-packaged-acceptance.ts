import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

import {
    importM3uPlaylistFromNativeDialog,
    m3uFixturePath,
    type LaunchedElectronApp,
} from '../electron-test-fixtures';

const workspaceRoot = resolve(__dirname, '../../../..');
const executablePath = join(
    workspaceRoot,
    'dist',
    'packages',
    'win-unpacked',
    'IPTVnator.exe'
);
const profileRoot = join(
    workspaceRoot,
    'dist',
    'performance',
    'phase5-isolated-profile'
);

type ModeResult = {
    databaseDirectoryPresent: boolean;
    importedChannelCount: number;
    killSwitch: boolean;
    mode: 'broad' | 'current';
    repeatedSearches: number;
    resultCounts: number[];
    userData: string;
};

async function runMode(mode: ModeResult['mode']): Promise<ModeResult> {
    const dataDir = join(profileRoot, `acceptance-${mode}-final`);
    const killSwitch = mode === 'current';
    const application = await electron.launch({
        args: ['--ignore-gpu-blocklist'],
        executablePath,
        env: {
            ...process.env,
            ELECTRON_IS_DEV: '0',
            IPTVNATOR_ALLOW_PRIVATE_NETWORK_URLS: '1',
            IPTVNATOR_DISABLE_M3U_BROAD_PREFILTER: killSwitch ? '1' : '0',
            IPTVNATOR_E2E_DATA_DIR: dataDir,
            NODE_ENV: 'test',
        },
    });
    try {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
        const page =
            application.windows().find((window) => !window.url().startsWith('devtools://')) ??
            (await application.firstWindow({ timeout: 30_000 }));
        await page.locator('.workspace-shell').waitFor({
            state: 'visible',
            timeout: 30_000,
        });
        const runtime = await application.evaluate(({ app }) => ({
            killSwitch:
                process.env['IPTVNATOR_DISABLE_M3U_BROAD_PREFILTER'] === '1',
            profileRoot: process.env['IPTVNATOR_E2E_DATA_DIR'],
            userData: app.getPath('userData'),
        }));
        const expectedUserData = join(dataDir, 'user-data');
        if (runtime.profileRoot !== dataDir || runtime.userData !== expectedUserData) {
            throw new Error(
                `phase5-profile-isolation-failed: ${JSON.stringify({ dataDir, runtime })}`
            );
        }
        if (runtime.killSwitch !== killSwitch) {
            throw new Error('phase5-kill-switch-state-mismatch');
        }

        const launched: LaunchedElectronApp = {
            electronApp: application,
            mainWindow: page,
        };
        await importM3uPlaylistFromNativeDialog(launched, m3uFixturePath);
        await page.waitForURL(/\/workspace\/playlists\//, { timeout: 30_000 });
        const channelItems = page.locator('[data-test-id="channel-item"]');
        const browseAll = page.getByText(/Browse All Content \(4\)/).first();
        if (await browseAll.isVisible().catch(() => false)) {
            await browseAll.click();
        }
        await channelItems.first().waitFor({ state: 'visible', timeout: 30_000 }).catch(
            async (failure: unknown) => {
                console.error(
                    JSON.stringify({
                        body: (await page.locator('body').innerText()).slice(0, 2_000),
                        dataDir,
                        url: page.url(),
                    })
                );
                throw failure;
            }
        );
        const importedChannelCount = await channelItems.count();
        if (importedChannelCount !== 4) {
            throw new Error(`phase5-import-count-mismatch:${importedChannelCount}`);
        }

        const queries = ['positive', 'sport', 'happykids', 'not-present'];
        const resultCounts: number[] = [];
        for (let index = 0; index < 20; index += 1) {
            const query = queries[index % queries.length];
            resultCounts.push(
                await page.evaluate(async (term) => {
                    const results = await window.electron.dbGlobalSearch(
                        term,
                        ['live'],
                        true,
                        ['m3u']
                    );
                    return results.length;
                }, query)
            );
        }
        if (!resultCounts.some((count) => count > 0)) {
            throw new Error('phase5-search-returned-no-results');
        }

        return {
            databaseDirectoryPresent: existsSync(join(dataDir, 'databases')),
            importedChannelCount,
            killSwitch,
            mode,
            repeatedSearches: resultCounts.length,
            resultCounts,
            userData: runtime.userData,
        };
    } finally {
        await application.close();
    }
}

async function main(): Promise<void> {
    if (!existsSync(executablePath)) {
        throw new Error(`phase5-packaged-executable-missing:${executablePath}`);
    }
    if (!existsSync(m3uFixturePath)) {
        throw new Error(`phase5-m3u-fixture-missing:${m3uFixturePath}`);
    }
    const requestedMode = process.argv[2];
    if (requestedMode !== 'broad' && requestedMode !== 'current') {
        throw new Error('phase5-mode-must-be-broad-or-current');
    }
    const run = await runMode(requestedMode);
    console.log(
        JSON.stringify(
            {
                executablePath,
                profileRoot,
                result: 'PASS',
                runs: [run],
            },
            null,
            2
        )
    );
}

void main().catch((failure: unknown) => {
    console.error(failure);
    process.exitCode = 1;
});
