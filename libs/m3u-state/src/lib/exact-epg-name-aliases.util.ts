import type { Channel, EpgMatchOrder, XmltvChannelIdentity } from '@iptvnator/shared/interfaces';
import {
    DEFAULT_EPG_MATCH_ORDER,
    createXmltvIdentityIndex,
    resolveOrderedXmltvId,
} from '@iptvnator/shared/interfaces';
import { channelScopedEpgAliasKey, resolveRawChannelEpgLookupKey } from './channel-epg-lookup.util';

export interface ExactEpgChannel extends XmltvChannelIdentity {}

/**
 * Pick the first *successful* XMLTV lookup in the configured field order.
 * Existing manual mappings always win. For repeated exact XMLTV display
 * names the first entry in the imported guide channel list wins, matching
 * First Exact preference. This is a transient renderer lookup map:
 * neither M3U entries nor the imported guide are modified.
 */
export function buildExactEpgNameAliases(
    playlistChannels: readonly Channel[],
    epgChannels: readonly ExactEpgChannel[],
    manualMappings: Readonly<Record<string, string>> = {},
    order: readonly EpgMatchOrder[number][] = DEFAULT_EPG_MATCH_ORDER,
): Map<string, string> {
    const index = createXmltvIdentityIndex(epgChannels);
    const proposed = new Map<string, string | null>();
    // Keep per-channel matches only to handle raw keys reused for different
    // stations, e.g. a provider giving BBC EARTH and BEINSPORTS the same ID.
    // Normal playlists retain one lightweight raw-key mapping per guide ID.
    const resolvedChannels: Array<{ channel: Channel; key: string; match: string }> = [];

    for (const channel of playlistChannels) {
        const key = resolveRawChannelEpgLookupKey(channel);
        if (!key || Object.prototype.hasOwnProperty.call(manualMappings, key)) {
            continue;
        }

        const matched = resolveOrderedXmltvId(
            {
                channelName: channel.name,
                tvgName: channel.tvg?.name,
                tvgId: channel.tvg?.id,
            },
            index.ids,
            index.names,
            order,
        );
        if (!matched) continue;

        resolvedChannels.push({ channel, key, match: matched });
        if (!proposed.has(key)) {
            proposed.set(key, matched);
        } else if (proposed.get(key) !== matched) {
            // Do not apply one station's EPG to all channels sharing its key.
            proposed.set(key, null);
        }
    }

    const aliases = new Map<string, string>();
    for (const [key, match] of proposed) {
        if (match && match !== key) aliases.set(key, match);
    }
    for (const { channel, key, match } of resolvedChannels) {
        if (proposed.get(key) === null && match !== key) {
            aliases.set(channelScopedEpgAliasKey(channel), match);
        }
    }
    return aliases;
}
