import {
    declaredAmbiguousStreamFormat,
    isAmbiguousStreamUrl,
    probeAmbiguousStreamFormat,
} from './ambiguous-stream-format.util';

describe('ambiguous stream routing', () => {
    it('never probes explicit HLS, TS, query-declared or non-http streams', () => {
        expect(isAmbiguousStreamUrl('https://example.invalid/a.m3u8')).toBe(false);
        expect(isAmbiguousStreamUrl('https://example.invalid/a.ts')).toBe(false);
        expect(isAmbiguousStreamUrl('https://example.invalid/play.php?format=hls')).toBe(false);
        expect(isAmbiguousStreamUrl('file:///tmp/video')).toBe(false);
        expect(isAmbiguousStreamUrl('https://example.invalid/play.php?session=1')).toBe(true);
        expect(isAmbiguousStreamUrl('https://example.invalid/play.php')).toBe(true);
    });

    it('recognizes only declared MIME types, without assuming PHP means TS', () => {
        expect(declaredAmbiguousStreamFormat('https://example.invalid/play.php',
            'application/vnd.apple.mpegurl; charset=utf-8')).toBe('hls');
        expect(declaredAmbiguousStreamFormat('https://example.invalid/play.php',
            'video/mp2t')).toBe('mpegts');
        expect(declaredAmbiguousStreamFormat('https://example.invalid/play.php',
            'text/html')).toBeNull();
    });

    it('uses one HEAD without body, credentials or leaking URL on success', async () => {
        const oldFetch = globalThis.fetch;
        const mocked = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            url: 'https://example.invalid/live/stream.m3u8',
            headers: { get: () => 'application/octet-stream' },
        });
        globalThis.fetch = mocked as typeof fetch;
        try {
            expect(await probeAmbiguousStreamFormat('https://example.invalid/live.php')).toBe('hls');
            expect(mocked).toHaveBeenCalledTimes(1);
            expect(mocked.mock.calls[0][1]).toEqual(expect.objectContaining({
                method: 'HEAD',
                credentials: 'omit',
            }));
        } finally {
            globalThis.fetch = oldFetch;
        }
    });

    it('falls back once from HEAD 405 to a bounded Range GET and detects HLS', async () => {
        const oldFetch = globalThis.fetch;
        const cancel = jest.fn().mockResolvedValue(undefined);
        const mocked = jest.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 405,
                url: 'https://example.invalid/live.php',
                headers: { get: () => null },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                url: 'https://cdn.example.invalid/live/stream.m3u8',
                headers: { get: () => 'application/vnd.apple.mpegurl' },
                body: { cancel },
            });
        globalThis.fetch = mocked as typeof fetch;
        try {
            expect(await probeAmbiguousStreamFormat('https://example.invalid/live.php')).toBe('hls');
            expect(mocked).toHaveBeenCalledTimes(2);
            expect(mocked.mock.calls[1][1]).toEqual(expect.objectContaining({
                method: 'GET',
                headers: { Range: 'bytes=0-0' },
                credentials: 'omit',
            }));
            expect(cancel).toHaveBeenCalledTimes(1);
        } finally {
            globalThis.fetch = oldFetch;
        }
    });

    it.each([403, 404])(
        'does not issue a fallback GET when HEAD returns %s',
        async (status) => {
            const oldFetch = globalThis.fetch;
            const mocked = jest.fn().mockResolvedValue({
                ok: false,
                status,
                url: 'https://example.invalid/live.php',
                headers: { get: () => null },
            });
            globalThis.fetch = mocked as typeof fetch;
            try {
                expect(await probeAmbiguousStreamFormat('https://example.invalid/live.php')).toBeNull();
                expect(mocked).toHaveBeenCalledTimes(1);
            } finally {
                globalThis.fetch = oldFetch;
            }
        }
    );

    it('cancels a Range fallback body when a live MPEG-TS server ignores the range', async () => {
        const oldFetch = globalThis.fetch;
        const cancel = jest.fn().mockResolvedValue(undefined);
        const mocked = jest.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 405,
                url: 'https://example.invalid/live.php',
                headers: { get: () => null },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                url: 'https://example.invalid/live.php',
                headers: { get: () => 'video/mp2t' },
                body: { cancel },
            });
        globalThis.fetch = mocked as typeof fetch;
        try {
            expect(await probeAmbiguousStreamFormat('https://example.invalid/live.php')).toBe('mpegts');
            expect(cancel).toHaveBeenCalledTimes(1);
        } finally {
            globalThis.fetch = oldFetch;
        }
    });
});
