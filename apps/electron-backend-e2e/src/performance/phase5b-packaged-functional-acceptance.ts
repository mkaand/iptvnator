import {
    spawn,
    type ChildProcessByStdio,
} from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';

import { _electron as electron, expect, request, selectors, type ElectronApplication, type Page } from '@playwright/test';

import {
    addXtreamPortal,
    buildM3uContent,
    channelItemByTitle,
    clickCategoryByNameExact,
    clickFirstGridListCard,
    contentCardByTitle,
    createMutableTextServer,
    defaultXtreamPassword,
    defaultXtreamUsername,
    importM3uPlaylistFromUrl,
    openPlaylistFavorites,
    openPlaylistRecent,
    openSettings,
    openSettingsSection,
    openSources,
    openWorkspaceSection,
    resetMockServers,
    sourceRowByTitle,
    switchUnifiedCollectionContent,
    waitForM3uCatalog,
    waitForXtreamWorkspaceReady,
    xtreamMockServer,
} from '../electron-test-fixtures';
import {
    fetchXtreamLiveFixture,
    fetchXtreamSeriesFixture,
    fetchXtreamVodFixture,
    getXtreamTitle,
    pickDistinctTitles,
} from '../portal-mock-fixtures';
import { routePlayableStreams, startAndConfirmPlayback } from '../playable-stream-fixture';
import {
    captureElectronProcess,
    closeElectronApplicationAndConfirmExit,
} from '../electron-process-lifecycle';

const workspaceRoot = resolve(__dirname, '../../../..');
const executablePath = join(workspaceRoot, 'dist', 'packages', 'win-unpacked', 'IPTVnator.exe');
const profileRoot = join(workspaceRoot, 'dist', 'performance', 'phase5-isolated-profile');
const logo = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%230078d4%22/%3E%3C/svg%3E';

selectors.setTestIdAttribute('data-test-id');

type Mode = 'broad' | 'current';
type App = { application: ElectronApplication; page: Page };
type Check = { name: string; result: 'PASS' | 'FAIL' | 'NOT TESTED'; detail?: string };
type SearchCase = {
    options: { limit: number; offset: number };
    query: string;
};
type SearchResultIdentity = {
    contentType: string;
    groupTitle: string;
    playlistName: string;
    posterUrl: string;
    sourceType: string;
    stableChannelIdentity: string;
    title: string;
};
type SearchSnapshot = {
    case: SearchCase;
    results: SearchResultIdentity[];
};
type ModeResult = {
    checks: Check[];
    dataDir: string;
    searches: SearchSnapshot[];
    warnings: string[];
};
type OwnedMockProcess = {
    child: ChildProcessByStdio<null, Readable, Readable>;
    stderrTail: () => string;
    stdoutTail: () => string;
};

const mockPort = 3211;
const searchCases: SearchCase[] = [
    { query: 'Phase5B', options: { limit: 50, offset: 0 } },
    { query: 'News', options: { limit: 50, offset: 0 } },
    { query: 'Sports', options: { limit: 50, offset: 0 } },
    { query: 'not-present', options: { limit: 50, offset: 0 } },
    { query: 'Phase5B', options: { limit: 1, offset: 0 } },
    { query: 'Phase5B', options: { limit: 1, offset: 1 } },
];

function xmltvDate(date: Date): string {
    const p = (value: number) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())} +0000`;
}

function currentXmltv(): string {
    const now = Date.now();
    return `<?xml version="1.0" encoding="UTF-8"?>
<tv><channel id="phase5b-news"><display-name>Phase5B News</display-name><icon src="${logo}"/></channel>
<programme start="${xmltvDate(new Date(now - 3_600_000))}" stop="${xmltvDate(new Date(now + 3_600_000))}" channel="phase5b-news"><title>Phase5B Current Bulletin</title><desc>Packaged acceptance EPG.</desc></programme></tv>`;
}

function boundedTail(stream: Readable, maximumLength = 16_384): () => string {
    let tail = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
        tail = `${tail}${chunk}`.slice(-maximumLength);
    });
    return () => tail;
}

async function assertMockPortAvailable(): Promise<void> {
    const probe = createServer();
    await new Promise<void>((resolvePromise, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
            probe.removeListener('listening', onListening);
            reject(
                error.code === 'EADDRINUSE'
                    ? new Error(`xtream-mock-port-${mockPort}-already-in-use`)
                    : error
            );
        };
        const onListening = () => {
            probe.removeListener('error', onError);
            probe.close((error) => (error ? reject(error) : resolvePromise()));
        };
        probe.once('error', onError);
        probe.once('listening', onListening);
        probe.listen(mockPort, '127.0.0.1');
    });
}

async function startMock(): Promise<OwnedMockProcess> {
    await assertMockPortAvailable();
    const child = spawn(process.execPath, [
        join(workspaceRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        '--tsconfig', join(workspaceRoot, 'tsconfig.base.json'),
        join(workspaceRoot, 'apps', 'xtream-mock-server', 'src', 'main.ts'),
    ], {
        cwd: workspaceRoot,
        env: {
            ...process.env,
            HOST: '127.0.0.1',
            NODE_ENV: 'development',
            PORT: String(mockPort),
            XTREAM_MOCK_PORT: String(mockPort),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    if (!child.pid) throw new Error('xtream-mock-child-pid-unavailable');
    const stdoutTail = boundedTail(child.stdout);
    const stderrTail = boundedTail(child.stderr);
    const owned = { child, stderrTail, stdoutTail };
    try {
        const expectedStartup = `[xtream-mock] Listening on http://127.0.0.1:${mockPort}`;
        let startupTimeout: NodeJS.Timeout | undefined;
        let resolveStartup: (() => void) | undefined;
        const inspectStartup = () => {
            if (stdoutTail().includes(expectedStartup)) resolveStartup?.();
        };
        const startup = new Promise<void>((resolvePromise) => {
            resolveStartup = resolvePromise;
            child.stdout.on('data', inspectStartup);
            inspectStartup();
        });
        try {
            await Promise.race([
                startup,
                once(child, 'exit').then(([code, signal]) => {
                    throw new Error(
                        `xtream-mock-exited-before-ready:${JSON.stringify({ code, signal, stderr: stderrTail() })}`
                    );
                }),
                new Promise<never>((_resolve, reject) => {
                    startupTimeout = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `xtream-mock-start-timeout:${JSON.stringify({ pid: child.pid, stderr: stderrTail(), stdout: stdoutTail() })}`
                                )
                            ),
                        30_000
                    );
                }),
            ]);
        } finally {
            child.stdout.removeListener('data', inspectStartup);
            if (startupTimeout) clearTimeout(startupTimeout);
        }
        const response = await fetch(`${xtreamMockServer}/health`);
        const health = (await response.json()) as {
            port?: number;
            server?: string;
            status?: string;
        };
        if (
            !response.ok ||
            health.status !== 'ok' ||
            health.server !== 'xtream-mock-server' ||
            health.port !== mockPort ||
            child.exitCode !== null
        ) {
            throw new Error(
                `xtream-mock-ownership-unconfirmed:${JSON.stringify({ health, pid: child.pid })}`
            );
        }
        return owned;
    } catch (failure) {
        try {
            await stopMock(owned);
        } catch (cleanupFailure) {
            throw new AggregateError(
                [failure, cleanupFailure],
                'xtream mock startup and cleanup both failed',
                { cause: failure }
            );
        }
        throw failure;
    }
}

async function waitForExit(
    child: ChildProcessByStdio<null, Readable, Readable>,
    timeoutMs: number
): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    let timeout: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            once(child, 'exit').then(() => true),
            new Promise<boolean>((resolvePromise) => {
                timeout = setTimeout(() => resolvePromise(false), timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

async function stopMock(mock: OwnedMockProcess): Promise<void> {
    if (mock.child.exitCode === null && mock.child.signalCode === null) {
        mock.child.kill('SIGTERM');
    }
    if (!(await waitForExit(mock.child, 10_000))) {
        mock.child.kill('SIGKILL');
    }
    if (!(await waitForExit(mock.child, 5_000))) {
        throw new Error(
            `xtream-mock-exit-unconfirmed:${JSON.stringify({ pid: mock.child.pid, stderr: mock.stderrTail(), stdout: mock.stdoutTail() })}`
        );
    }
    await assertMockPortAvailable();
}

async function launch(mode: Mode, dataDir: string): Promise<App> {
    const application = await electron.launch({
        executablePath,
        args: ['--ignore-gpu-blocklist'],
        env: {
            ...process.env,
            ELECTRON_IS_DEV: '0',
            IPTVNATOR_ALLOW_PRIVATE_NETWORK_URLS: '1',
            IPTVNATOR_DISABLE_M3U_BROAD_PREFILTER: mode === 'current' ? '1' : '0',
            IPTVNATOR_E2E_DATA_DIR: dataDir,
            NODE_ENV: 'test',
        },
    });
    captureElectronProcess(application);
    try {
        const deadline = Date.now() + 45_000;
        let page: Page | undefined;
        while (!page && Date.now() < deadline) {
            page = application.windows().find((window) => !window.url().startsWith('devtools://'));
            if (!page) await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
        }
        if (!page) {
            const child = application.process();
            throw new Error(
                `packaged-window-not-observed-within-45s:${JSON.stringify({ exitCode: child.exitCode, pid: child.pid, signalCode: child.signalCode, windows: application.windows().map((window) => window.url()) })}`
            );
        }
        page.setDefaultTimeout(20_000);
        page.setDefaultNavigationTimeout(30_000);
        await page.locator('.workspace-shell').waitFor({ state: 'visible', timeout: 30_000 });
        const runtime = await application.evaluate(({ app }) => ({
            dataDir: process.env['IPTVNATOR_E2E_DATA_DIR'],
            killSwitch: process.env['IPTVNATOR_DISABLE_M3U_BROAD_PREFILTER'],
            userData: app.getPath('userData'),
        }));
        const expected = join(dataDir, 'user-data');
        if (runtime.dataDir !== dataDir || runtime.userData !== expected || runtime.killSwitch !== (mode === 'current' ? '1' : '0')) {
            throw new Error(`phase5b-isolation-failed:${JSON.stringify({ expected, runtime })}`);
        }
        await routePlayableStreams(page);
        return { application, page };
    } catch (failure) {
        try {
            await closeElectronApplicationAndConfirmExit(application, {
                closeTimeoutMs: 10_000,
                exitTimeoutMs: 5_000,
            });
        } catch (cleanupFailure) {
            throw new AggregateError(
                [failure, cleanupFailure],
                'packaged launch and cleanup both failed',
                { cause: failure }
            );
        }
        throw failure;
    }
}

async function close(app: App | undefined): Promise<void> {
    if (!app) return;
    await closeElectronApplicationAndConfirmExit(app.application, {
        closeTimeoutMs: 10_000,
        exitTimeoutMs: 5_000,
    });
}

async function toggleFavorite(page: Page, title: string, expected: 'star' | 'star_border'): Promise<void> {
    const item = channelItemByTitle(page, title).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    await item.hover();
    await item.locator('.favorite-button').first().click();
    if (expected === 'star_border' && /global-favorites/.test(page.url())) {
        await expect(item).toHaveCount(0);
    } else {
        await expect(item.locator('.favorite-button mat-icon').first()).toHaveText(expected);
    }
}

async function playDetail(page: Page): Promise<void> {
    const button = page.locator('button.play-btn').first();
    await expect(button).toBeVisible({ timeout: 20_000 });
    await button.click();
}

async function playSeries(page: Page): Promise<void> {
    const season = page.locator('.season-card').first();
    const episode = page.locator('.episode-card, .episode-list-item').first();
    await expect.poll(async () => await season.count() + await episode.count(), { timeout: 20_000 }).toBeGreaterThan(0);
    if (await season.count()) await season.click();
    await expect(episode).toBeVisible({ timeout: 20_000 });
    await episode.click();
}

async function captureSearchSnapshots(page: Page): Promise<SearchSnapshot[]> {
    const snapshots: SearchSnapshot[] = [];
    for (const searchCase of searchCases) {
        const results = await page.evaluate(async ({ options, query }) => {
            const rows = await window.electron.dbGlobalSearch(
                query,
                ['live'],
                true,
                ['m3u'],
                options
            );
            return rows.map((row) => {
                const item = row as unknown as Record<string, unknown>;
                return {
                    contentType: String(item['content_type'] ?? ''),
                    groupTitle: String(item['group_title'] ?? ''),
                    playlistName: String(item['playlist_name'] ?? ''),
                    posterUrl: String(item['poster_url'] ?? ''),
                    sourceType: String(item['source_type'] ?? ''),
                    stableChannelIdentity: String(item['stream_url'] ?? ''),
                    title: String(item['title'] ?? ''),
                };
            });
        }, searchCase);
        snapshots.push({ case: searchCase, results });
    }
    return snapshots;
}

function assertSearchEquivalent(
    broad: SearchSnapshot[],
    legacy: SearchSnapshot[]
): void {
    const broadJson = JSON.stringify(broad);
    const legacyJson = JSON.stringify(legacy);
    if (broadJson !== legacyJson) {
        throw new Error(
            `broad-legacy-search-mismatch:${JSON.stringify({ broad, legacy })}`
        );
    }
}

async function run(mode: Mode): Promise<ModeResult> {
    const suffix = new Date().toISOString().replace(/[:.]/g, '-');
    const dataDir = join(profileRoot, `phase5b-${mode}-functional-${suffix}`);
    if (existsSync(dataDir)) throw new Error(`refusing-existing-profile:${dataDir}`);
    const checks: Check[] = [];
    const warnings: string[] = [];
    const epgServer = await createMutableTextServer(currentXmltv(), { contentType: 'application/xml; charset=utf-8', resourcePath: '/phase5b.xml' });
    const playlist = buildM3uContent([
        { name: 'Phase5B News', tvgId: 'phase5b-news', tvgName: 'Phase5B News', logo, groupTitle: 'Live', url: 'https://streams.example.test/phase5b-news.m3u8' },
        { name: 'Phase5B Sports', tvgId: 'phase5b-sports', logo, groupTitle: 'Live', url: 'https://streams.example.test/phase5b-sports.m3u8' },
    ]).replace('#EXTM3U', `#EXTM3U x-tvg-url="${epgServer.resourceUrl}"`);
    const playlistServer = await createMutableTextServer(playlist, { contentType: 'application/x-mpegurl; charset=utf-8', resourcePath: '/phase5b.m3u' });
    const api = await request.newContext();
    let app: App | undefined;
    let modeResult: ModeResult | undefined;
    let runFailure: unknown;
    try {
        const step = (name: string) => console.error(`[phase5b:${mode}] ${name}`);
        step('resetting mock and reading fixtures');
        await resetMockServers(api, ['xtream']);
        const credentials = { username: defaultXtreamUsername, password: defaultXtreamPassword };
        const live = await fetchXtreamLiveFixture(api, credentials);
        const vod = await fetchXtreamVodFixture(api, credentials);
        const series = await fetchXtreamSeriesFixture(api, credentials);
        const [liveTitle] = pickDistinctTitles(live.items, getXtreamTitle);

        step('launching packaged app');
        try {
            app = await launch(mode, dataDir);
        } catch (firstLaunchFailure) {
            const warning = `packaged launch required one clean retry: ${firstLaunchFailure instanceof Error ? firstLaunchFailure.message : String(firstLaunchFailure)}`;
            warnings.push(warning);
            step(warning);
            app = await launch(mode, dataDir);
        }
        const page = app.page;
        checks.push({ name: 'isolated profile', result: 'PASS', detail: join(dataDir, 'user-data') });
        await importM3uPlaylistFromUrl(page, playlistServer.resourceUrl);
        await expect(page.locator('.epg-progress-panel .import-item.status-complete')).toHaveCount(1, { timeout: 30_000 });
        await waitForM3uCatalog(page);
        await openWorkspaceSection(page, 'All channels');
        const news = channelItemByTitle(page, 'Phase5B News').first();
        await expect(news).toBeVisible({ timeout: 20_000 });
        await expect(news.locator('img').first()).toHaveAttribute('src', /data:image\/svg\+xml/);
        await expect(news.locator('.epg-title')).toContainText('Phase5B Current Bulletin', { timeout: 30_000 });
        checks.push({ name: 'M3U import, logo and live EPG', result: 'PASS' });
        step('m3u epg passed');

        await toggleFavorite(page, 'Phase5B News', 'star');
        await openPlaylistFavorites(page);
        const favoriteNews = channelItemByTitle(page, 'Phase5B News');
        await expect(favoriteNews).toHaveCount(1);
        await expect(favoriteNews.locator('img').first()).toHaveAttribute(
            'src',
            /data:image\/svg\+xml/
        );
        await expect(favoriteNews.locator('.epg-title')).toContainText('Phase5B Current Bulletin');
        await toggleFavorite(page, 'Phase5B News', 'star_border');
        await expect(channelItemByTitle(page, 'Phase5B News')).toHaveCount(0);
        await openWorkspaceSection(page, 'All channels');
        await toggleFavorite(page, 'Phase5B News', 'star');
        checks.push({ name: 'Favorites add/open/remove/re-add identity and EPG', result: 'PASS' });
        step('favorites passed');

        await startAndConfirmPlayback(page, () => channelItemByTitle(page, 'Phase5B News').first().click());
        await expect(page.locator('app-epg-timeline, app-epg-list-view')).toContainText('Phase5B Current Bulletin');
        const player = page.locator('app-web-player-view').first();
        const video = player.locator('video').first();
        await expect(video).toBeVisible({ timeout: 20_000 });
        await player.hover();
        const controls = player.locator('app-player-controls');
        await expect(controls).toBeVisible({ timeout: 20_000 });
        const playControl = controls.getByTestId('player-controls-play');
        await expect(playControl).toBeVisible();
        await playControl.click();
        await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
        await playControl.click();
        await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
        let volumeControl = controls.locator(
            '.player-controls__slider--volume:visible'
        ).first();
        if (!(await volumeControl.isVisible().catch(() => false))) {
            await controls
                .getByRole('button', { name: /^(Mute|Unmute)$/ })
                .click();
            volumeControl = controls.locator(
                '.player-controls__slider--volume:visible'
            ).first();
        }
        await expect(volumeControl).toBeVisible();
        await volumeControl.fill('0.35');
        await expect
            .poll(() =>
                video.evaluate((element: HTMLVideoElement) => element.volume)
            )
            .toBeCloseTo(0.35, 2);
        const fullscreen = page.getByRole('button', { name: 'Enter fullscreen', exact: true }).first();
        if (await fullscreen.isVisible().catch(() => false)) {
            await fullscreen.click();
            await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true }).first()).toBeVisible();
            await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).first().click();
        } else throw new Error('fullscreen-control-not-visible');
        await startAndConfirmPlayback(page, () => channelItemByTitle(page, 'Phase5B Sports').first().click(), 0.5);
        await openSources(page);
        await expect(page.locator('video')).toHaveCount(0);
        await sourceRowByTitle(page, 'phase5b').first().click();
        await waitForM3uCatalog(page);
        await startAndConfirmPlayback(page, () => channelItemByTitle(page, 'Phase5B News').first().click(), 0.5);
        checks.push({ name: 'HTML5 playback UI pause/play/volume/channel/fullscreen/replay', result: 'PASS' });
        checks.push({ name: 'Live inline player navigation-away close', result: 'PASS', detail: 'This UI has no dedicated Close player button; standalone close control remains NOT TESTED.' });
        step('live playback passed');

        await openPlaylistRecent(page);
        await expect(channelItemByTitle(page, 'Phase5B News')).toHaveCount(1);
        await channelItemByTitle(page, 'Phase5B News').first().click();
        checks.push({ name: 'M3U Recently Viewed and reopen', result: 'PASS' });
        step('m3u recent passed');

        step('opening settings');
        await openSettings(page);
        await openSettingsSection(page, 'epg');
        step('toggling epg auto refresh');
        const autoRefreshHost = page.getByTestId('epg-auto-refresh-toggle');
        const autoRefresh = autoRefreshHost.locator('[role="switch"]');
        if (await autoRefresh.getAttribute('aria-checked') !== 'true') await autoRefresh.click();
        await expect(autoRefresh).toHaveAttribute('aria-checked', 'true');
        step('setting startup and interval');
        await page.getByTestId('epg-refresh-on-startup').check();
        await page.getByTestId('epg-refresh-interval').getByText('18h', { exact: true }).click();
        step('saving epg settings');
        const saveButton = page.getByTestId('save-settings');
        await saveButton.evaluate((button: HTMLButtonElement) => button.click());
        await saveButton.waitFor({ state: 'hidden', timeout: 20_000 });
        await page.waitForTimeout(300);
        checks.push({ name: 'EPG auto-refresh setting save', result: 'PASS' });
        checks.push({ name: 'EPG scheduled refresh execution', result: 'NOT TESTED', detail: 'No clock/service trigger was forced.' });
        step('epg settings passed');

        await openSources(page);
        await addXtreamPortal(page, { name: 'Phase5B Xtream' });
        await waitForXtreamWorkspaceReady(page);
        step('xtream workspace ready');
        await openWorkspaceSection(page, 'Live TV');
        await clickCategoryByNameExact(page, live.categoryName);
        await startAndConfirmPlayback(page, () => channelItemByTitle(page, liveTitle).first().click());
        await page.getByRole('link', { name: 'Movies', exact: true }).click();
        await clickCategoryByNameExact(page, vod.categoryName);
        const movieTitle = await clickFirstGridListCard(page);
        await expect(page.locator('app-content-hero')).toContainText(movieTitle);
        await expect(page.locator('app-content-hero img, app-vod-details img').first()).toBeVisible();
        await startAndConfirmPlayback(page, () => playDetail(page));
        await page.getByTestId('workspace-header-back').click();
        await page.getByRole('link', { name: 'Series', exact: true }).click();
        await clickCategoryByNameExact(page, series.categoryName);
        const seriesTitle = await clickFirstGridListCard(page);
        await expect(page.locator('app-content-hero')).toContainText(seriesTitle);
        await startAndConfirmPlayback(page, () => playSeries(page));
        checks.push({ name: 'Xtream Movies poster/detail/playback', result: 'PASS', detail: movieTitle });
        checks.push({ name: 'Xtream Series detail/season/episode/playback', result: 'PASS', detail: seriesTitle });
        step('xtream movie and series passed');

        await openPlaylistRecent(page);
        await expect(channelItemByTitle(page, liveTitle)).toHaveCount(1);
        await switchUnifiedCollectionContent(page, 'Movies');
        await expect(contentCardByTitle(page, movieTitle)).toHaveCount(1);
        await contentCardByTitle(page, movieTitle).first().click();
        await expect(page.locator('app-content-hero')).toContainText(movieTitle);
        await page.getByTestId('workspace-header-back').click();
        await switchUnifiedCollectionContent(page, 'Series');
        await expect(contentCardByTitle(page, seriesTitle)).toHaveCount(1);
        checks.push({ name: 'Xtream live/movie/series Recently Viewed and reopen', result: 'PASS' });
        step('xtream recent passed');

        const searches = await captureSearchSnapshots(page);
        if (searches[0]?.results.length !== 2) {
            throw new Error(
                `global-search-fixture-result-mismatch:${JSON.stringify(searches[0])}`
            );
        }

        step('restarting packaged app');
        await close(app); app = undefined;
        app = await launch(mode, dataDir);
        await openSources(app.page);
        await sourceRowByTitle(app.page, 'phase5b.m3u').first().click();
        await waitForM3uCatalog(app.page);
        await openPlaylistFavorites(app.page);
        const persistedFavorite = channelItemByTitle(app.page, 'Phase5B News');
        await expect(persistedFavorite).toHaveCount(1);
        await expect(persistedFavorite.locator('img').first()).toHaveAttribute(
            'src',
            /data:image\/svg\+xml/
        );
        await openPlaylistRecent(app.page);
        await expect(channelItemByTitle(app.page, 'Phase5B News')).toHaveCount(1);
        await openSettings(app.page);
        await openSettingsSection(app.page, 'epg');
        await expect(app.page.getByTestId('epg-auto-refresh-toggle').locator('[role="switch"]')).toHaveAttribute('aria-checked', 'true');
        await expect(app.page.getByTestId('epg-refresh-on-startup')).toBeChecked();
        await expect(app.page.getByTestId('epg-refresh-interval').getByRole('radio', { name: '18h' })).toBeChecked();
        await openSources(app.page);
        await sourceRowByTitle(app.page, 'Phase5B Xtream').first().click();
        await waitForXtreamWorkspaceReady(app.page);
        await openPlaylistRecent(app.page);
        await switchUnifiedCollectionContent(app.page, 'Movies');
        await expect(contentCardByTitle(app.page, movieTitle)).toHaveCount(1);
        await switchUnifiedCollectionContent(app.page, 'Series');
        await expect(contentCardByTitle(app.page, seriesTitle)).toHaveCount(1);
        checks.push({ name: 'Favorites, EPG settings and all recent types persist after restart', result: 'PASS' });
        step('restart persistence passed');
        checks.push({ name: 'Optional MPV runtime', result: 'NOT TESTED', detail: 'Packaged runtime does not include the optional vendored MPV runtime.' });
        modeResult = { checks, dataDir, searches, warnings };
    } catch (failure) {
        const diagnostics = app ? await app.page.locator('body').innerText().catch(() => '') : '';
        const detail = `${failure instanceof Error ? failure.message : String(failure)}\nURL=${app?.page.url() ?? 'closed'}\nBODY=${diagnostics.slice(0, 3000)}`;
        checks.push({ name: 'uncompleted mandatory flow', result: 'FAIL', detail });
        runFailure = Object.assign(
            failure instanceof Error ? failure : new Error(String(failure)),
            { phase5b: { checks, dataDir, warnings } }
        );
    }
    const cleanupResults = await Promise.allSettled([
        close(app),
        api.dispose(),
        playlistServer.close(),
        epgServer.close(),
    ]);
    const cleanupFailures = cleanupResults.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : []
    );
    if (cleanupFailures.length > 0) {
        const combined = new AggregateError(
            [...(runFailure ? [runFailure] : []), ...cleanupFailures],
            'phase5b run cleanup failed',
            { cause: runFailure }
        );
        Object.assign(combined, { phase5b: { checks, dataDir, warnings } });
        throw combined;
    }
    if (runFailure) throw runFailure;
    if (!modeResult) throw new Error('phase5b-mode-result-missing');
    return modeResult;
}

async function runWithOwnedMock(mode: Mode): Promise<ModeResult> {
    const mock = await startMock();
    let modeResult: ModeResult | undefined;
    let runFailure: unknown;
    try {
        modeResult = await run(mode);
    } catch (failure) {
        runFailure = failure;
    }
    try {
        await stopMock(mock);
    } catch (cleanupFailure) {
        throw new AggregateError(
            [...(runFailure ? [runFailure] : []), cleanupFailure],
            `phase5b ${mode} mock cleanup failed`,
            { cause: runFailure }
        );
    }
    if (runFailure) throw runFailure;
    if (!modeResult) throw new Error(`phase5b-${mode}-result-missing`);
    return modeResult;
}

async function main(): Promise<void> {
    if (process.argv[2] !== 'compare') throw new Error('mode-must-be-compare');
    if (!existsSync(executablePath)) throw new Error(`missing-exe:${executablePath}`);
    const broad = await runWithOwnedMock('broad');
    const legacy = await runWithOwnedMock('current');
    assertSearchEquivalent(broad.searches, legacy.searches);
    const result =
        broad.warnings.length === 0 && legacy.warnings.length === 0
            ? 'PASS'
            : 'PARTIAL';
    console.log(
        JSON.stringify(
            {
                executablePath,
                result,
                scores: 'NOT COMPARABLE: the packaged bridge does not expose search scores',
                searchEquivalence: broad.searches,
                runs: { broad, legacy },
            },
            null,
            2
        )
    );
}

void main().catch((failure: unknown) => {
    console.error(JSON.stringify({ error: failure instanceof Error ? failure.message : String(failure), phase5b: (failure as { phase5b?: unknown })?.phase5b }, null, 2));
    process.exitCode = 1;
});
