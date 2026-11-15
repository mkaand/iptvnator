import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

import type DatabaseType from 'better-sqlite3';

type SearchModule =
    typeof import('../../../electron-backend/src/app/database/operations/content-search.util');
type ContentModule =
    typeof import('../../../electron-backend/src/app/database/operations/content.operations');

type Channel = {
    id: string;
    url: string;
    name: string;
    group: { title: string };
    tvg: {
        name: string;
        id?: string;
        url?: string;
        logo?: string;
        rec?: string;
    };
    http?: { referrer?: string; 'user-agent'?: string; origin?: string };
    radio?: string;
};

type PlaylistRow = { id: string; name: string; payload: string };
type Measurement = { wallMs: number; cpuMs: number; heapDeltaBytes: number };
type Sample = Measurement & { rows: number };
type Predicate = { sql: string; params: string[]; patternCount: number };
type Alternative =
    'A-current' | 'B-compact-only' | 'C-broad-superset' | 'D-fts5-trigram';

const SIZES = [10_000, 50_000, 100_000] as const;
const QUERIES = [
    'needlefirst',
    'needlemiddle',
    'needlelast',
    'needlemissing',
] as const;
const ALTERNATIVES: Alternative[] = [
    'A-current',
    'B-compact-only',
    'C-broad-superset',
    'D-fts5-trigram',
];
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
        rows: samples.at(-1)?.rows ?? 0,
    };
}

function channel(
    index: number,
    name: string,
    tvgName = '',
    group = 'General'
): Channel {
    return {
        id: `id-${index}`,
        url: `https://synthetic.invalid/${index}`,
        name,
        group: { title: group },
        tvg: { id: `epg-${index}`, name: tvgName, url: '', logo: '', rec: '' },
        http: { referrer: '', 'user-agent': '', origin: '' },
        radio: '',
    };
}

function buildProfile(size: number): { row: PlaylistRow; channels: Channel[] } {
    const middle = Math.floor(size / 2);
    const channels = Array.from({ length: size }, (_, index) => {
        const marker =
            index === 0
                ? 'needlefirst'
                : index === middle
                  ? 'needlemiddle'
                  : index === size - 1
                    ? 'needlelast'
                    : `channel-${index}`;
        return channel(
            index,
            `Synthetic ${marker}`,
            '',
            `Group ${index % 100}`
        );
    });
    return {
        row: {
            id: `synthetic-${size}`,
            name: `Synthetic ${size}`,
            payload: JSON.stringify({
                playlist: { items: channels },
                hiddenGroupTitles: [],
            }),
        },
        channels,
    };
}

function joinOr(parts: Predicate[]): Predicate {
    return {
        sql: `(${parts.map((part) => part.sql).join(' OR ')})`,
        params: parts.flatMap((part) => part.params),
        patternCount: parts.reduce((sum, part) => sum + part.patternCount, 0),
    };
}

function joinAnd(parts: Predicate[]): Predicate {
    return {
        sql: `(${parts.map((part) => part.sql).join(' AND ')})`,
        params: parts.flatMap((part) => part.params),
        patternCount: parts.reduce((sum, part) => sum + part.patternCount, 0),
    };
}

function likePredicate(patterns: string[]): Predicate {
    return {
        sql: `(${patterns.map(() => "payload LIKE ? ESCAPE '\\'").join(' OR ')})`,
        params: patterns,
        patternCount: patterns.length,
    };
}

function compactPatterns(patterns: string[]): string[] {
    return patterns.filter(
        (pattern) =>
            pattern.includes('%"name":"') || pattern.includes('%"title":"')
    );
}

function broadPatterns(search: SearchModule, token: string): string[] {
    return search.buildLikePatterns(token, 'contains');
}

function buildPredicate(
    search: SearchModule,
    searchTerm: string,
    alternative: Exclude<Alternative, 'D-fts5-trigram'>
): Predicate {
    let groupIndex = 0;
    const plans = search.getSearchWordPlans(searchTerm).map((plan) => {
        const tokenConditions = plan.tokenGroups.map((tokens) => {
            const mode =
                groupIndex === 0 && search.isShortSearchTokenGroup(tokens)
                    ? 'prefix'
                    : 'contains';
            groupIndex += 1;
            const patterns = tokens.flatMap((token) => {
                if (alternative === 'C-broad-superset') {
                    return broadPatterns(search, token);
                }
                const current = search.buildM3uPayloadTextFieldPatterns(
                    token,
                    mode
                );
                return alternative === 'B-compact-only'
                    ? compactPatterns(current)
                    : current;
            });
            return likePredicate(patterns);
        });
        const tokenArm = joinAnd(tokenConditions);
        if (plan.compound === null) return tokenArm;
        const compoundCurrent = search.buildM3uPayloadCompoundPatterns(
            plan.compound
        );
        const compoundPatterns =
            alternative === 'C-broad-superset'
                ? search.buildCompoundLikePatterns(plan.compound)
                : alternative === 'B-compact-only'
                  ? compactPatterns(compoundCurrent)
                  : compoundCurrent;
        return joinOr([tokenArm, likePredicate(compoundPatterns)]);
    });
    return joinAnd(plans);
}

function selectSql(predicate: Predicate): string {
    return `SELECT id, name, payload FROM playlists WHERE type IN ('m3u-file', 'm3u-text', 'm3u-url') AND payload IS NOT NULL AND ${predicate.sql} ORDER BY name LIMIT 5000`;
}

function ftsQuery(search: SearchModule, term: string): string | null {
    const tokens = search
        .normalizeSearchMatchText(term)
        .split(' ')
        .filter(Boolean);
    if (tokens.length === 0 || tokens.some((token) => token.length < 3))
        return null;
    return tokens
        .map((token) => `"${token.replace(/"/g, '""')}"`)
        .join(' AND ');
}

function createFts(
    database: DatabaseType.Database,
    search: SearchModule,
    rows: PlaylistRow[],
    channelsByPlaylist: Map<string, Channel[]>
): Measurement {
    database.exec(
        "CREATE VIRTUAL TABLE m3u_search_fts USING fts5(playlist_id UNINDEXED, searchable, tokenize='trigram')"
    );
    const insert = database.prepare(
        'INSERT INTO m3u_search_fts (playlist_id, searchable) VALUES (?, ?)'
    );
    const transaction = database.transaction(() => {
        for (const row of rows) {
            for (const item of channelsByPlaylist.get(row.id) ?? []) {
                insert.run(
                    row.id,
                    search.normalizeSearchMatchText(
                        `${item.name} ${item.tvg.name} ${item.group.title}`
                    )
                );
            }
        }
    });
    return measure(transaction).measurement;
}

function ftsStatement(
    database: DatabaseType.Database,
    search: SearchModule,
    term: string,
    broadFallback: { sql: string; params: string[] }
): {
    statement: DatabaseType.Statement;
    sql: string;
    params: string[];
    fallback: boolean;
} {
    const query = ftsQuery(search, term);
    if (!query) {
        return {
            statement: database.prepare(broadFallback.sql),
            sql: broadFallback.sql,
            params: broadFallback.params,
            fallback: true,
        };
    }
    const sql = `SELECT p.id, p.name, p.payload FROM m3u_search_fts JOIN playlists p ON p.id = m3u_search_fts.playlist_id WHERE m3u_search_fts MATCH ? GROUP BY p.id ORDER BY p.name LIMIT 5000`;
    return {
        statement: database.prepare(sql),
        sql,
        params: [query],
        fallback: false,
    };
}

function resultSignature(
    content: ContentModule,
    rows: PlaylistRow[],
    query: string
) {
    return content
        .buildM3uGlobalSearchResults(rows, query, false, {
            limit: 500,
            offset: 0,
        })
        .map((result) => ({
            id: result.id,
            channelId: result.channel_id,
            title: result.title,
            playlistId: result.playlist_id,
            score: Math.min(
                ...[
                    result.channel.name,
                    result.channel.tvg.name,
                    result.channel.group.title,
                ]
                    .map((value) => content.scoreSearchTextMatch(value, query))
                    .filter((value): value is number => value !== null)
            ),
        }));
}

function semanticRows(): {
    rows: PlaylistRow[];
    channels: Map<string, Channel[]>;
} {
    const compact = [
        channel(1, 'İnşaat TV'),
        channel(2, 'IŞIK ŞĞ 4K UHD'),
        channel(3, 'News World HD'),
        channel(4, 'A&E FHD'),
        channel(5, '100% Hits'),
        channel(6, 'Under_score TV'),
        channel(7, 'Back\\Slash Channel'),
        channel(8, 'Same Name'),
        channel(9, 'Same Name'),
        channel(10, 'Fallback Label', 'Turkish Spor Şampiyon'),
        channel(11, 'Fallback Group', '', 'Çocuk & Aile'),
        channel(12, 'Late Position Needle'),
    ];
    const pretty = [
        channel(101, 'Pretty Only Channel'),
        channel(102, 'İZMİR Haber'),
        channel(103, 'Punctuation: Rock & Roll'),
    ];
    const rows = [
        {
            id: 'compact',
            name: 'Compact',
            payload: JSON.stringify({ playlist: { items: compact } }),
        },
        {
            id: 'pretty',
            name: 'Pretty',
            payload: JSON.stringify({ playlist: { items: pretty } }, null, 2),
        },
    ];
    return {
        rows,
        channels: new Map([
            ['compact', compact],
            ['pretty', pretty],
        ]),
    };
}

function runSemanticSuite(
    Database: typeof DatabaseType,
    search: SearchModule,
    content: ContentModule
) {
    const { rows, channels } = semanticRows();
    const database = new Database(':memory:');
    database.exec(
        'CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, payload TEXT)'
    );
    const insert = database.prepare(
        'INSERT INTO playlists (id, name, type, payload) VALUES (?, ?, ?, ?)'
    );
    for (const row of rows)
        insert.run(row.id, row.name, 'm3u-text', row.payload);
    createFts(database, search, rows, channels);
    const queries = [
        'inş',
        'İnş',
        'ışık',
        'ŞĞ',
        'news world',
        'A&E HD',
        'A&E',
        '100%',
        'under_',
        'back\\slash',
        'same name',
        'turkish spor',
        'çocuk aile',
        'UHD',
        'pretty only',
        'İZMİR',
        'rock roll',
        'not present anywhere',
        'late position',
    ];
    const outcomes = Object.fromEntries(
        ALTERNATIVES.map((alternative) => [alternative, true])
    );
    const failures: Array<{
        alternative: Alternative;
        query: string;
        expected: unknown;
        actual: unknown;
    }> = [];

    for (const query of queries) {
        const expected = resultSignature(content, rows, query);
        for (const alternative of ALTERNATIVES) {
            let statement: DatabaseType.Statement;
            let params: string[];
            if (alternative === 'D-fts5-trigram') {
                const broad = buildPredicate(search, query, 'C-broad-superset');
                const fts = ftsStatement(database, search, query, {
                    sql: selectSql(broad),
                    params: broad.params,
                });
                statement = fts.statement;
                params = fts.params;
            } else {
                const predicate = buildPredicate(search, query, alternative);
                statement = database.prepare(selectSql(predicate));
                params = predicate.params;
            }
            const candidates = statement.all(...params) as PlaylistRow[];
            const actual = resultSignature(content, candidates, query);
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                outcomes[alternative] = false;
                failures.push({ alternative, query, expected, actual });
            }
        }
    }
    database.close();
    return { queryCount: queries.length, outcomes, failures };
}

async function main(): Promise<void> {
    const [{ default: Database }, search, content] = await Promise.all([
        import('better-sqlite3') as Promise<{ default: typeof DatabaseType }>,
        // Test-only benchmark exercises the production text contract directly.
        // eslint-disable-next-line @nx/enforce-module-boundaries
        import('../../../electron-backend/src/app/database/operations/content-search.util'),
        // Test-only equivalence check exercises production result ordering directly.
        // eslint-disable-next-line @nx/enforce-module-boundaries
        import('../../../electron-backend/src/app/database/operations/content.operations'),
    ]);

    const capabilityDatabase = new Database(':memory:');
    const compileOptions = capabilityDatabase.pragma(
        'compile_options'
    ) as unknown;
    const sqliteVersion = capabilityDatabase
        .prepare('select sqlite_version() version')
        .get();
    capabilityDatabase.close();
    const semantic = runSemanticSuite(Database, search, content);
    const results: unknown[] = [];

    for (const size of SIZES) {
        const { row, channels } = buildProfile(size);
        const database = new Database(':memory:');
        database.exec(
            'CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, payload TEXT)'
        );
        database
            .prepare(
                'INSERT INTO playlists (id, name, type, payload) VALUES (?, ?, ?, ?)'
            )
            .run(row.id, row.name, 'm3u-text', row.payload);
        const bytesBeforeFts = database.serialize().byteLength;
        const ftsBuild = createFts(
            database,
            search,
            [row],
            new Map([[row.id, channels]])
        );
        const bytesAfterFts = database.serialize().byteLength;
        const sizeResult: Record<string, unknown> = {
            size,
            payloadBytes: Buffer.byteLength(row.payload),
            ftsBuild,
            databaseBytesBeforeFts: bytesBeforeFts,
            databaseBytesAfterFts: bytesAfterFts,
            ftsByteIncrease: bytesAfterFts - bytesBeforeFts,
            queries: {},
        };

        for (const query of QUERIES) {
            const prepared = new Map<
                Alternative,
                {
                    statement: DatabaseType.Statement;
                    sql: string;
                    params: string[];
                    patternCount: number;
                    fallback?: boolean;
                    prepareMs: number;
                }
            >();
            for (const alternative of ALTERNATIVES) {
                const started = performance.now();
                if (alternative === 'D-fts5-trigram') {
                    const broad = buildPredicate(
                        search,
                        query,
                        'C-broad-superset'
                    );
                    const fts = ftsStatement(database, search, query, {
                        sql: selectSql(broad),
                        params: broad.params,
                    });
                    prepared.set(alternative, {
                        statement: fts.statement,
                        sql: fts.sql,
                        params: fts.params,
                        patternCount: fts.fallback ? broad.patternCount : 1,
                        fallback: fts.fallback,
                        prepareMs: round(performance.now() - started),
                    });
                } else {
                    const predicate = buildPredicate(
                        search,
                        query,
                        alternative
                    );
                    const sql = selectSql(predicate);
                    prepared.set(alternative, {
                        statement: database.prepare(sql),
                        sql,
                        params: predicate.params,
                        patternCount: predicate.patternCount,
                        prepareMs: round(performance.now() - started),
                    });
                }
            }

            const samples = new Map(
                ALTERNATIVES.map((alternative) => [alternative, [] as Sample[]])
            );
            for (const entry of prepared.values())
                entry.statement.all(...entry.params);
            for (let iteration = 0; iteration < MEASUREMENTS; iteration += 1) {
                const order =
                    iteration % 2 === 0
                        ? ALTERNATIVES
                        : [...ALTERNATIVES].reverse();
                for (const alternative of order) {
                    const entry = prepared.get(alternative);
                    if (!entry) throw new Error(`Missing ${alternative}`);
                    const run = measure(
                        () =>
                            entry.statement.all(
                                ...entry.params
                            ) as PlaylistRow[]
                    );
                    samples.get(alternative)?.push({
                        ...run.measurement,
                        rows: run.value.length,
                    });
                }
            }

            const baselineMedian = summarize(samples.get('A-current') ?? [])
                .wallMs.median;
            const queryResult: Record<string, unknown> = {};
            for (const alternative of ALTERNATIVES) {
                const summary = summarize(samples.get(alternative) ?? []);
                const entry = prepared.get(alternative);
                queryResult[alternative] = {
                    ...summary,
                    prepareMs: entry?.prepareMs,
                    patternCount: entry?.patternCount,
                    fallback: entry?.fallback ?? false,
                    medianChangePercent: round(
                        ((summary.wallMs.median - baselineMedian) /
                            baselineMedian) *
                            100
                    ),
                    queryPlan: entry
                        ? database
                              .prepare(`EXPLAIN QUERY PLAN ${entry.sql}`)
                              .all(...entry.params)
                        : [],
                };
            }
            (sizeResult['queries'] as Record<string, unknown>)[query] =
                queryResult;
        }

        const noMatch = buildPredicate(search, 'needlemissing', 'A-current');
        const individualLikePatterns = noMatch.params.map((pattern) => {
            const statement = database.prepare(
                `SELECT count(*) count FROM playlists WHERE type IN ('m3u-file', 'm3u-text', 'm3u-url') AND payload IS NOT NULL AND payload LIKE ? ESCAPE '\\'`
            );
            statement.get(pattern);
            const samples: Sample[] = [];
            for (let iteration = 0; iteration < MEASUREMENTS; iteration += 1) {
                const run = measure(
                    () => statement.get(pattern) as { count: number }
                );
                samples.push({ ...run.measurement, rows: run.value.count });
            }
            return { pattern, ...summarize(samples) };
        });
        sizeResult['noMatchIndividualLikePatterns'] = individualLikePatterns;

        const refresh = measure(() => {
            database.exec('DELETE FROM m3u_search_fts');
            const insert = database.prepare(
                'INSERT INTO m3u_search_fts (playlist_id, searchable) VALUES (?, ?)'
            );
            database.transaction(() => {
                for (const item of channels) {
                    insert.run(
                        row.id,
                        search.normalizeSearchMatchText(
                            `${item.name} ${item.tvg.name} ${item.group.title}`
                        )
                    );
                }
            })();
        });
        sizeResult['ftsFullRefresh'] = refresh.measurement;
        results.push(sizeResult);
        database.close();
    }

    const capabilities = {
        sqliteVersion,
        compileOptions,
        fts5TrigramCreated: true,
        statementRuntimeScanCounters:
            'NOT AVAILABLE in better-sqlite3 public API',
    };
    console.log(
        JSON.stringify(
            { measurements: MEASUREMENTS, capabilities, semantic, results },
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
