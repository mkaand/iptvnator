import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

import type DatabaseType from 'better-sqlite3';

type SearchModule = typeof import('../../../electron-backend/src/app/database/operations/content-search.util');
type ContentModule = typeof import('../../../electron-backend/src/app/database/operations/content.operations');
type PlaylistRow = { id: string; name: string; payload: string };
type Predicate = { sql: string; params: string[] };
type Measurement = {
    wallMs: number;
    cpuMs: number;
    heapDeltaBytes: number;
};
type Sample = Measurement & {
    candidateRows: number;
    fallback: boolean;
    resultCount: number;
};

const MEASUREMENTS = 5;
const CANDIDATE_LIMIT = 5000;

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

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

function measure<T>(work: () => T): { measurement: Measurement; value: T } {
    (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const started = performance.now();
    const value = work();
    const cpu = process.cpuUsage(cpuBefore);
    return {
        measurement: {
            wallMs: round(performance.now() - started),
            cpuMs: round((cpu.user + cpu.system) / 1000),
            heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
        },
        value,
    };
}

function summarize(samples: Sample[]) {
    const metric = (key: keyof Measurement) => {
        const values = samples
            .map((sample) => sample[key])
            .sort((first, second) => first - second);
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
        candidateRows: samples.at(-1)?.candidateRows ?? 0,
        fallback: samples.some((sample) => sample.fallback),
        resultCount: samples.at(-1)?.resultCount ?? 0,
    };
}

function join(parts: Predicate[], operator: 'AND' | 'OR'): Predicate {
    return {
        sql: `(${parts.map((part) => part.sql).join(` ${operator} `)})`,
        params: parts.flatMap((part) => part.params),
    };
}

function likePredicate(patterns: string[]): Predicate {
    return {
        sql: `(${patterns.map(() => "payload LIKE ? ESCAPE '\\'").join(' OR ')})`,
        params: patterns,
    };
}

function buildPredicate(
    search: SearchModule,
    searchTerm: string,
    broad: boolean
): Predicate {
    let groupIndex = 0;
    const plans = search.getSearchWordPlans(searchTerm).map((plan) => {
        const tokens = plan.tokenGroups.map((variants) => {
            const mode =
                groupIndex === 0 && search.isShortSearchTokenGroup(variants)
                    ? 'prefix'
                    : 'contains';
            groupIndex += 1;
            return likePredicate(
                variants.flatMap((variant) =>
                    broad
                        ? search.buildLikePatterns(variant, 'contains')
                        : search.buildM3uPayloadTextFieldPatterns(variant, mode)
                )
            );
        });
        const tokenArm = join(tokens, 'AND');
        if (plan.compound === null) return tokenArm;
        const compound = likePredicate(
            broad
                ? search.buildCompoundLikePatterns(plan.compound)
                : search.buildM3uPayloadCompoundPatterns(plan.compound)
        );
        return join([tokenArm, compound], 'OR');
    });
    return join(plans, 'AND');
}

function selectSql(predicate: Predicate, limited = true): string {
    return `SELECT id, name, payload FROM playlists WHERE type IN ('m3u-file', 'm3u-text', 'm3u-url') AND payload IS NOT NULL AND ${predicate.sql} ORDER BY name${limited ? ` LIMIT ${CANDIDATE_LIMIT}` : ''}`;
}

function channel(
    id: string,
    name: string,
    metadata: Partial<{
        group: string;
        tvgName: string;
        url: string;
        logo: string;
        referrer: string;
    }> = {}
) {
    return {
        id,
        url: metadata.url ?? `https://synthetic.invalid/${id}`,
        name,
        group: { title: metadata.group ?? 'General' },
        tvg: {
            id: `epg-${id}`,
            name: metadata.tvgName ?? '',
            url: '',
            logo: metadata.logo ?? '',
            rec: '',
        },
        http: {
            referrer: metadata.referrer ?? '',
            'user-agent': '',
            origin: '',
        },
        radio: '',
    };
}

function playlist(
    index: number,
    channels: ReturnType<typeof channel>[],
    hiddenGroupTitles: string[] = []
): PlaylistRow {
    return {
        id: `playlist-${index.toString().padStart(6, '0')}`,
        name: `Playlist ${index.toString().padStart(6, '0')}`,
        payload: JSON.stringify({
            playlist: { items: channels },
            hiddenGroupTitles,
        }),
    };
}

function insertRows(database: DatabaseType.Database, rows: PlaylistRow[]) {
    const insert = database.prepare(
        'INSERT INTO playlists (id, name, type, payload) VALUES (?, ?, ?, ?)'
    );
    database.transaction(() => {
        for (const row of rows) {
            insert.run(row.id, row.name, 'm3u-text', row.payload);
        }
    })();
}

function resultSignature(
    content: ContentModule,
    rows: PlaylistRow[],
    query: string,
    excludeHidden = false,
    limit = 500,
    offset = 0
) {
    return content
        .buildM3uGlobalSearchResults(rows, query, excludeHidden, {
            limit,
            offset,
        })
        .map((result) => ({
            id: result.id,
            playlistId: result.playlist_id,
            channelId: result.channel_id,
            title: result.title,
            score: Math.min(
                ...[
                    result.channel.name,
                    result.channel.tvg.name,
                    result.channel.group.title,
                ]
                    .map((value) =>
                        content.scoreSearchTextMatch(value, query)
                    )
                    .filter((value): value is number => value !== null)
            ),
        }));
}

function benchmarkCase(
    Database: typeof DatabaseType,
    search: SearchModule,
    content: ContentModule,
    rows: PlaylistRow[],
    query: string,
    options: {
        name: string;
        excludeHidden?: boolean;
        limit?: number;
        offset?: number;
    }
) {
    const database = new Database(':memory:');
    database.exec(
        'CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, payload TEXT)'
    );
    insertRows(database, rows);
    const currentPredicate = buildPredicate(search, query, false);
    const broadPredicate = buildPredicate(search, query, true);
    const current = database.prepare(selectSql(currentPredicate));
    const broad = database.prepare(selectSql(broadPredicate));
    const expected = resultSignature(
        content,
        rows,
        query,
        options.excludeHidden,
        options.limit,
        options.offset
    );

    const selectCurrent = () => {
        const candidates = current.all(
            ...currentPredicate.params
        ) as PlaylistRow[];
        return { candidates, fallback: false };
    };
    const selectBroadSafe = () => {
        let candidates = broad.all(...broadPredicate.params) as PlaylistRow[];
        const fallback = candidates.length >= CANDIDATE_LIMIT;
        if (fallback) {
            candidates = current.all(
                ...currentPredicate.params
            ) as PlaylistRow[];
        }
        return { candidates, fallback };
    };
    const runSearch = (
        selectCandidates: () => {
            candidates: PlaylistRow[];
            fallback: boolean;
        }
    ) => {
        const selected = selectCandidates();
        return {
            ...selected,
            results: resultSignature(
                content,
                selected.candidates,
                query,
                options.excludeHidden,
                options.limit,
                options.offset
            ),
        };
    };
    const runCurrent = () => runSearch(selectCurrent);
    const runBroadSafe = () => runSearch(selectBroadSafe);

    for (const [strategy, run] of [
        ['current', runCurrent],
        ['broad-safe', runBroadSafe],
    ] as const) {
        const warmup = run();
        if (JSON.stringify(warmup.results) !== JSON.stringify(expected)) {
            throw new Error(`${options.name}/${strategy}: warmup mismatch`);
        }
    }

    const sqlSamples = new Map<string, Sample[]>([
        ['current', []],
        ['broad-safe', []],
    ]);
    const totalSamples = new Map<string, Sample[]>([
        ['current', []],
        ['broad-safe', []],
    ]);
    for (let iteration = 0; iteration < MEASUREMENTS; iteration += 1) {
        const order =
            iteration % 2 === 0
                ? ([
                      ['current', runCurrent],
                      ['broad-safe', runBroadSafe],
                  ] as const)
                : ([
                      ['broad-safe', runBroadSafe],
                      ['current', runCurrent],
                  ] as const);
        for (const [strategy, run] of order) {
            const selectCandidates =
                strategy === 'current' ? selectCurrent : selectBroadSafe;
            const sqlMeasured = measure(selectCandidates);
            sqlSamples.get(strategy)?.push({
                ...sqlMeasured.measurement,
                candidateRows: sqlMeasured.value.candidates.length,
                fallback: sqlMeasured.value.fallback,
                resultCount: expected.length,
            });
            const measured = measure(run);
            if (
                JSON.stringify(measured.value.results) !==
                JSON.stringify(expected)
            ) {
                throw new Error(`${options.name}/${strategy}: result mismatch`);
            }
            totalSamples.get(strategy)?.push({
                ...measured.measurement,
                candidateRows: measured.value.candidates.length,
                fallback: measured.value.fallback,
                resultCount: measured.value.results.length,
            });
        }
    }
    const currentSql = summarize(sqlSamples.get('current') ?? []);
    const broadSql = summarize(sqlSamples.get('broad-safe') ?? []);
    const currentTotal = summarize(totalSamples.get('current') ?? []);
    const broadTotal = summarize(totalSamples.get('broad-safe') ?? []);
    database.close();
    return {
        name: options.name,
        playlistCount: rows.length,
        payloadBytes: rows.reduce(
            (sum, row) => sum + Buffer.byteLength(row.payload),
            0
        ),
        query,
        expectedResults: expected.length,
        current: {
            sql: currentSql,
            total: currentTotal,
        },
        broadSafe: {
            sql: broadSql,
            total: broadTotal,
            sqlMedianChangePercent: round(
                ((broadSql.wallMs.median - currentSql.wallMs.median) /
                    currentSql.wallMs.median) *
                    100
            ),
            totalMedianChangePercent: round(
                ((broadTotal.wallMs.median - currentTotal.wallMs.median) /
                    currentTotal.wallMs.median) *
                    100
            ),
        },
        equivalent: true,
    };
}

function buildNormalProfile(count: number): PlaylistRow[] {
    return Array.from({ length: count }, (_, playlistIndex) =>
        playlist(
            playlistIndex,
            Array.from(
                { length: 40 + (playlistIndex % 4) * 20 },
                (_, channelIndex) =>
                    channel(
                        `${playlistIndex}-${channelIndex}`,
                        channelIndex === 7 && playlistIndex % 3 === 0
                            ? `Target News ${playlistIndex}`
                            : `Synthetic ${playlistIndex}-${channelIndex}`
                    )
            )
        )
    );
}

function buildDecoyProfile(): PlaylistRow[] {
    return Array.from({ length: 20 }, (_, index) => {
        const isReal = index === 4 || index === 17;
        return playlist(index, [
            channel(
                `decoy-${index}`,
                isReal ? `Targetword Live ${index}` : `Ordinary ${index}`,
                {
                    url: `https://targetword.invalid/${index}`,
                    logo: `https://images.invalid/targetword-${index}.png`,
                    referrer: 'https://targetword.invalid/referrer',
                }
            ),
        ]);
    });
}

function buildCandidateLimitProfile(count: number): PlaylistRow[] {
    return Array.from({ length: count }, (_, index) =>
        playlist(index, [
            channel(
                `limit-${index}`,
                index === count - 1 ? 'Boundarytarget Live' : `Noise ${index}`,
                { url: `https://boundarytarget.invalid/${index}` }
            ),
        ])
    );
}

function buildLargeProfile(size: number): PlaylistRow[] {
    return [
        playlist(
            0,
            Array.from({ length: size }, (_, index) => {
                const marker =
                    index === 0
                        ? 'needlefirst'
                        : index === size - 1
                          ? 'needlelast'
                          : `channel-${index}`;
                return channel(`large-${index}`, `Synthetic ${marker}`);
            })
        ),
    ];
}

async function main(): Promise<void> {
    const [{ default: Database }, search, content] = await Promise.all([
        import('better-sqlite3') as Promise<{ default: typeof DatabaseType }>,
        // Test-only benchmark exercises the production search contract.
        // eslint-disable-next-line @nx/enforce-module-boundaries
        import('../../../electron-backend/src/app/database/operations/content-search.util'),
        // Test-only benchmark compares production scoring and pagination.
        // eslint-disable-next-line @nx/enforce-module-boundaries
        import('../../../electron-backend/src/app/database/operations/content.operations'),
    ]);

    const normal = [1, 5, 10, 20].flatMap((count) => {
        const rows = buildNormalProfile(count);
        return [
            benchmarkCase(Database, search, content, rows, 'target news', {
                name: `normal-${count}-positive`,
                limit: 25,
                offset: 1,
            }),
            benchmarkCase(Database, search, content, rows, 'absent phrase', {
                name: `normal-${count}-negative`,
            }),
        ];
    });
    const decoyRows = buildDecoyProfile();
    const decoy = benchmarkCase(
        Database,
        search,
        content,
        decoyRows,
        'targetword',
        { name: 'metadata-decoy-mixed' }
    );
    const candidateLimits = [4999, 5000, 5001, 5100].map((count) =>
        benchmarkCase(
            Database,
            search,
            content,
            buildCandidateLimitProfile(count),
            'boundarytarget',
            { name: `candidate-limit-${count}` }
        )
    );
    const largeRows = buildLargeProfile(100_000);
    const large = [
        ['100k-no-match', 'needlemissing'],
        ['100k-early-match', 'needlefirst'],
        ['100k-late-match', 'needlelast'],
    ].map(([name, query]) =>
        benchmarkCase(Database, search, content, largeRows, query, { name })
    );

    console.log(
        JSON.stringify(
            {
                measurements: MEASUREMENTS,
                candidateLimit: CANDIDATE_LIMIT,
                acceptance: {
                    noResultLoss: true,
                    fallbackRule:
                        'rerun current field-aware prefilter when broad candidates reach 5000',
                },
                normal,
                decoy,
                candidateLimits,
                large,
            },
            null,
            2
        )
    );
}

if (!process.argv.includes('--electron-child') && !process.versions.electron) {
    runUnderElectron();
}

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
