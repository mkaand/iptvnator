import { getPlaybackMediaExtensionFromUrl } from '@iptvnator/playback/util';

/**
 * Optional format hint for an extensionless/PHP URL. Never records URLs,
 * request headers or response bodies. A failed/blocked probe leaves the
 * original player routing untouched.
 */
export type AmbiguousStreamFormat = 'hls' | 'mpegts' | null;

export function declaredAmbiguousStreamFormat(
    url: string,
    contentType: string | null
): AmbiguousStreamFormat {
    const extension = getPlaybackMediaExtensionFromUrl(url);
    if (extension === 'm3u8' || extension === 'm3u') return 'hls';
    if (extension === 'ts') return 'mpegts';
    const mime = (contentType ?? '').split(';', 1)[0].trim().toLowerCase();
    if (mime === 'application/vnd.apple.mpegurl' ||
        mime === 'application/x-mpegurl' ||
        mime === 'audio/mpegurl' ||
        mime === 'audio/x-mpegurl') return 'hls';
    if (mime === 'video/mp2t' || mime === 'video/mpeg2-ts') return 'mpegts';
    return null;
}

export function isAmbiguousStreamUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        // Explicit format declarations are authoritative even on PHP routes.
        const format = (parsed.searchParams.get('format') ??
            parsed.searchParams.get('type') ?? '').toLowerCase();
        if (['hls', 'm3u8', 'mpegts', 'mp2t', 'ts'].includes(format)) return false;
        const extension = getPlaybackMediaExtensionFromUrl(url);
        // Script endpoints commonly serve HLS or TS regardless of .php.
        return !extension || extension === 'php' || extension === 'asp' ||
            extension === 'aspx' || extension === 'cgi';
    } catch {
        return false;
    }
}

function cancelProbeBody(response: Response): void {
    const cancellation = response.body?.cancel();
    if (cancellation) {
        void cancellation.catch(() => undefined);
    }
}

/**
 * Probe an ambiguous HTTP stream without consuming media. HEAD is preferred.
 * Some resolver endpoints reject HEAD with 405, so exactly that status gets
 * one bounded Range GET. The fallback body is cancelled immediately after
 * headers are inspected so live MPEG-TS servers that ignore Range cannot keep
 * the probe connection open. Other HTTP/network failures fail closed.
 */
export async function probeAmbiguousStreamFormat(
    url: string,
    timeoutMs = 1800,
): Promise<AmbiguousStreamFormat> {
    if (!isAmbiguousStreamUrl(url) || typeof fetch !== 'function') return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headResponse = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            credentials: 'omit',
            cache: 'no-store',
        });
        if (headResponse.status !== 405) {
            if (!headResponse.ok) return null;
            return declaredAmbiguousStreamFormat(
                headResponse.url || url,
                headResponse.headers.get('content-type')
            );
        }

        const rangeResponse = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
            signal: controller.signal,
            credentials: 'omit',
            cache: 'no-store',
        });
        try {
            if (!rangeResponse.ok) return null;
            return declaredAmbiguousStreamFormat(
                rangeResponse.url || url,
                rangeResponse.headers.get('content-type')
            );
        } finally {
            cancelProbeBody(rangeResponse);
        }
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
