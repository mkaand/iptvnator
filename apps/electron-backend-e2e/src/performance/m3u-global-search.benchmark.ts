import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

import type DatabaseType from 'better-sqlite3';

type RawChannel = {
    id: string;
    url: string;
    name: string;
    group: { title: string };
    tvg: {
        id: string;
        name: string;
        url: string;
        logo: string;
        rec: string;
    };
    epgParams?: unknown;
    timeshift?: unknown;
    catchup?: unknown;
    http: { referrer: string; 'user-agent': string; origin: string };
    radio: string;
};

type Measurement = {
    wallMs: number;
    cpuMs: number;
    heapDeltaBytes: number;
};

type Sample = Measurement & { matches?: number };

const SIZES = [10_000, 50_000, 100_000] as const;
const QUERIES = ['needlefirst', 'needlemiddle', 'needlelast', 'needlemissing'];
const MEASUREMENTS = 5;

function runUnderElectron(): never {
    const require = createRequire(import.meta.url);
    const electron = require('electron') as string;
    const child = spawnSync(
        electron,
        [
            '--expose-gc',
            '--import',
            'tsx',
            import.meta.filename,
            '--electron-child',
        ],
        {
            cwd: process.cwd(),
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );
    process.stdout.write(child.stdout);
    process.stderr.write(child.stderr);
    process.exit(child.status ?? 1);
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeChannel(value: unknown): RawChannel | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as Partial<RawChannel>;
    const url = normalizeText(source.url);
    const name = normalizeText(source.name);
    if (!url || !name) return null;
    return {
        id: normalizeText(source.id) || url,
        url,
        name,
        group: { title: normalizeText(source.group?.title) },
        tvg: {
            id: normalizeText(source.tvg?.id),
            name: normalizeText(source.tvg?.name),
            url: normalizeText(source.tvg?.url),
            logo: normalizeText(source.tvg?.logo),
            rec: normalizeText(source.tvg?.rec),
        },
        epgParams: source.epgParams,
        timeshift: source.timeshift,
        catchup: source.catchup,
        http: {
            referrer: normalizeText(source.http?.referrer),
            'user-agent': normalizeText(source.http?.['user-agent']),
            origin: normalizeText(source.http?.origin),
        },
        radio: normalizeText(source.radio),
    };
}

function summarize(samples: Sample[]) {
    const metric = (key: keyof Measurement) => {
        const values = samples
            .map((sample) => sample[key])
            .sort((a, b) => a - b);
        return {
            mean: round(
                values.reduce((sum, value) => sum + value, 0) / values.length
            ),
            median: round(values[Math.floor(values.length / 2)]),
            min: round(values[0]),
            max: round(values.at(-1) ?? 0),
        };
    };
    return {
        wallMs: metric('wallMs'),
        cpuMs: metric('cpuMs'),
        heapDeltaBytes: metric('heapDeltaBytes'),
        matches: samples.at(-1)?.matches,
    };
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

function measure<T>(work: () => T): { measurement: Measurement; value: T } {
    (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const started = performance.now();
    const value = work();
    const wallMs = performance.now() - started;
    const cpu = process.cpuUsage(cpuBefore);
    const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
    return {
        measurement: {
            wallMs: round(wallMs),
            cpuMs: round((cpu.user + cpu.system) / 1000),
            heapDeltaBytes,
        },
        value,
    };
}

function buildPayload(size: number): string {
    const middle = Math.floor(size / 2);
    const items = Array.from({ length: size }, (_, index): RawChannel => {
        const marker =
            index === 0
                ? 'needlefirst'
                : index === middle
                  ? 'needlemiddle'
                  : index === size - 1
                    ? 'needlelast'
                    : `channel-${index}`;
        return {
            id: `id-${index}`,
            url: `https://synthetic.invalid/${index}`,
            name: `Synthetic ${marker}`,
            group: { title: `Group ${index % 100}` },
            tvg: {
                id: `epg-${index}`,
                name: '',
                url: '',
                logo: '',
                rec: '',
            },
            http: { referrer: '', 'user-agent': '', origin: '' },
            radio: '',
        };
    });
    return JSON.stringify({ playlist: { items }, hiddenGroupTitles: [] });
}

async function main(): Promise<void> {
    const [{ default: Database }, search, content] = await Promise.all([
        import('better-sqlite3') as Promise<{ default: typeof DatabaseType }>,
        // Test-only benchmark must exercise the production scorer directly.
        // eslint-disable-next-line @nx/enforce-module-boundaries
        import('../../../electron-backend/src/app/database/operations/content-search.util'),
        // Test-only behavior check must exercise the production M3U search directly.
        // eslint-disable-next-line @nx/enforce-module-boundaries
        import('../../../electron-backend/src/app/database/operations/content.operations'),
    ]);
    const score = search.scoreSearchTextMatch;
    const patternsFor = search.buildM3uPayloadTextFieldPatterns;
    const output: unknown[] = [];

    for (const size of SIZES) {
        const payload = buildPayload(size);
        const database = new Database(':memory:');
        database.exec(
            'CREATE TABLE playlists (id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT)'
        );
        database
            .prepare(
                'INSERT INTO playlists (id, type, payload) VALUES (?, ?, ?)'
            )
            .run(`synthetic-${size}`, 'm3u-text', payload);

        for (const query of QUERIES) {
            const patterns = patternsFor(query, 'contains');
            const where = patterns
                .map(() => "payload LIKE ? ESCAPE '\\'")
                .join(' OR ');
            const statement = database.prepare(
                `SELECT payload FROM playlists WHERE type IN ('m3u-file', 'm3u-text', 'm3u-url') AND payload IS NOT NULL AND (${where}) LIMIT 5000`
            );
            const sqlSamples: Sample[] = [];
            const parseSamples: Sample[] = [];
            const baselineSamples: Sample[] = [];
            const singlePassSamples: Sample[] = [];
            let prototypeResultIds: string[] = [];

            const runSql = () =>
                statement.all(...patterns) as Array<{ payload: string }>;
            runSql();
            JSON.parse(payload);

            for (let iteration = 0; iteration < MEASUREMENTS; iteration += 1) {
                const sqlRun = measure(runSql);
                sqlSamples.push({
                    ...sqlRun.measurement,
                    matches: sqlRun.value.length,
                });

                const parsedRun = measure(
                    () =>
                        JSON.parse(payload) as {
                            playlist: { items: unknown[] };
                        }
                );
                parseSamples.push(parsedRun.measurement);
                const items = parsedRun.value.playlist.items;

                const baseline = measure(() => {
                    const normalized = items
                        .map(normalizeChannel)
                        .filter((item): item is RawChannel => item !== null);
                    const results: Array<{ id: string; score: number }> = [];
                    for (const channel of normalized) {
                        const scores = [
                            score(channel.name, query),
                            score(channel.tvg.name, query),
                            score(channel.group.title, query),
                        ].filter((value): value is number => value !== null);
                        if (scores.length) {
                            results.push({
                                id: channel.id,
                                score: Math.min(...scores),
                            });
                        }
                    }
                    return results;
                });
                baselineSamples.push({
                    ...baseline.measurement,
                    matches: baseline.value.length,
                });

                const singlePass = measure(() => {
                    const results: Array<{ id: string; score: number }> = [];
                    for (const item of items) {
                        const channel = normalizeChannel(item);
                        if (!channel) continue;
                        const scores = [
                            score(channel.name, query),
                            score(channel.tvg.name, query),
                            score(channel.group.title, query),
                        ].filter((value): value is number => value !== null);
                        if (scores.length) {
                            results.push({
                                id: channel.id,
                                score: Math.min(...scores),
                            });
                        }
                    }
                    return results;
                });
                singlePassSamples.push({
                    ...singlePass.measurement,
                    matches: singlePass.value.length,
                });
                prototypeResultIds = singlePass.value.map(
                    (result) => result.id
                );

                if (
                    JSON.stringify(baseline.value) !==
                    JSON.stringify(singlePass.value)
                ) {
                    throw new Error(`Behavior mismatch for ${size}/${query}`);
                }
            }

            const productionResultIds = content
                .buildM3uGlobalSearchResults(
                    [
                        {
                            id: `synthetic-${size}`,
                            name: 'Synthetic',
                            payload,
                        },
                    ],
                    query,
                    false,
                    { limit: 500, offset: 0 }
                )
                .map((result) => result.channel_id);
            if (
                JSON.stringify(productionResultIds) !==
                JSON.stringify(prototypeResultIds)
            ) {
                throw new Error(
                    `Production behavior mismatch for ${size}/${query}`
                );
            }

            output.push({
                size,
                query,
                payloadBytes: Buffer.byteLength(payload),
                sqlPrefilter: summarize(sqlSamples),
                jsonParse: summarize(parseSamples),
                baselineNormalizeThenScore: summarize(baselineSamples),
                singlePassNormalizeAndScore: summarize(singlePassSamples),
                productionTotalMedianMs:
                    sqlSamples.at(-1)?.matches === 0
                        ? summarize(sqlSamples).wallMs.median
                        : round(
                              summarize(sqlSamples).wallMs.median +
                                  summarize(parseSamples).wallMs.median +
                                  summarize(baselineSamples).wallMs.median
                          ),
                behaviorEquivalentToProduction: true,
            });
        }
        database.close();
    }

    console.log(
        JSON.stringify({ measurements: MEASUREMENTS, results: output }, null, 2)
    );
}

if (!process.argv.includes('--electron-child') && !process.versions.electron) {
    runUnderElectron();
}

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
