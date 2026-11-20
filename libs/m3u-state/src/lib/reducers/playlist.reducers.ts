import { on } from '@ngrx/store';
import { Channel } from '@iptvnator/shared/interfaces';
import { resolvePlaylistEpgSourceState } from '@iptvnator/shared/m3u-utils';
import { PlaylistActions } from '../actions';
import { playlistsAdapter } from '../playlists.state';
import { PlaylistState } from '../state';

export const playlistReducers = [
    on(PlaylistActions.loadPlaylists, (state): PlaylistState => ({
        ...state,
        playlists: {
            ...state.playlists,
            allPlaylistsLoaded: false,
            loadFailed: false,
        },
    })),
    on(PlaylistActions.loadPlaylistsFailure, (state): PlaylistState => ({
        ...state,
        playlists: { ...state.playlists, loadFailed: true },
    })),
    on(PlaylistActions.loadPlaylistsSuccess, (state, action): PlaylistState => {
        return {
            ...state,
            playlists: playlistsAdapter.addMany(action.playlists, {
                ...state.playlists,
                allPlaylistsLoaded: true,
                loadFailed: false,
            }),
        };
    }),
    on(
        PlaylistActions.playlistRemovalCommitted,
        (state, action): PlaylistState => {
            const playlists = playlistsAdapter.removeOne(
                action.playlistId,
                state.playlists
            );
            return {
                ...state,
                playlists: {
                    ...playlists,
                    selectedId:
                        state.playlists.selectedId === action.playlistId
                            ? ''
                            : playlists.selectedId,
                },
            };
        }
    ),
    on(PlaylistActions.updatePlaylist, (state, action): PlaylistState => {
        const refreshedPlaylist = action.playlist;
        const isActivePlaylist =
            state.playlists.selectedId === action.playlistId;
        const currentPlaylist = state.playlists.entities[action.playlistId];
        const epgSourceState = resolvePlaylistEpgSourceState({
            detectedEpgUrls:
                refreshedPlaylist.detectedEpgUrls ??
                currentPlaylist?.detectedEpgUrls,
            enabledEpgUrls: refreshedPlaylist.epgUrls ?? currentPlaylist?.epgUrls,
            manualEpgUrls:
                refreshedPlaylist.manualEpgUrls ?? currentPlaylist?.manualEpgUrls,
            disabledEpgUrls:
                refreshedPlaylist.disabledEpgUrls ??
                currentPlaylist?.disabledEpgUrls,
        });
        return {
            ...state,
            channels: isActivePlaylist
                ? (refreshedPlaylist.playlist.items as Channel[])
                : state.channels,
            channelsLoading: isActivePlaylist ? false : state.channelsLoading,
            playlists: playlistsAdapter.updateOne(
                {
                    id: action.playlistId,
                    changes: {
                        ...refreshedPlaylist,
                        _id: action.playlistId,
                        // A pending Xtream refresh cannot undo a user rename.
                        ...(currentPlaylist?.serverUrl && {
                            title: currentPlaylist.title,
                        }),
                        updateDate: Date.now(),
                        count: refreshedPlaylist.playlist.items.length,
                        userAgent:
                            refreshedPlaylist.userAgent ??
                            currentPlaylist?.userAgent,
                        favorites: currentPlaylist?.favorites ?? [],
                        m3uContentOverrides: currentPlaylist?.m3uContentOverrides ?? {},
                        epgUrls: epgSourceState.epgUrls,
                        detectedEpgUrls: epgSourceState.detectedEpgUrls,
                        manualEpgUrls: epgSourceState.manualEpgUrls,
                        disabledEpgUrls: epgSourceState.disabledEpgUrls,
                        autoRefresh:
                            currentPlaylist?.autoRefresh ??
                            refreshedPlaylist.autoRefresh,
                    },
                },
                state.playlists
            ),
        };
    }),
    on(PlaylistActions.addPlaylist, (state, action): PlaylistState => {
        return {
            ...state,
            playlists: playlistsAdapter.addOne(
                action.playlist,
                state.playlists
            ),
        };
    }),
    on(PlaylistActions.addManyPlaylists, (state, action): PlaylistState => {
        return {
            ...state,
            playlists: playlistsAdapter.addMany(
                action.playlists,
                state.playlists
            ),
        };
    }),
    on(PlaylistActions.setActivePlaylist, (state, action): PlaylistState => {
        return {
            ...state,
            playlists: {
                ...state.playlists,
                selectedId: action.playlistId,
            },
        };
    }),
    on(
        PlaylistActions.updatePlaylistPositions,
        (state, action): PlaylistState => {
            return {
                ...state,
                playlists: playlistsAdapter.updateMany(
                    action.positionUpdates,
                    state.playlists
                ),
            };
        }
    ),
    on(PlaylistActions.updatePlaylistMeta, (state, action): PlaylistState => {
        const p = action.playlist;
        return {
            ...state,
            playlists: playlistsAdapter.updateOne(
                {
                    id: p._id,
                    changes: {
                        ...(p.title != null ? { title: p.title } : {}),
                        ...(p.autoRefresh != null
                            ? { autoRefresh: p.autoRefresh }
                            : {}),
                        ...(p.userAgent != null
                            ? { userAgent: p.userAgent }
                            : {}),
                        ...(p.referrer !== undefined
                            ? { referrer: p.referrer }
                            : {}),
                        ...(p.origin !== undefined ? { origin: p.origin } : {}),
                        ...(p.serverUrl != null
                            ? { serverUrl: p.serverUrl }
                            : {}),
                        ...(p.username != null ? { username: p.username } : {}),
                        ...(p.password != null ? { password: p.password } : {}),
                        ...(p.macAddress != null
                            ? { macAddress: p.macAddress }
                            : {}),
                        ...(p.portalUrl != null
                            ? { portalUrl: p.portalUrl }
                            : {}),
                        ...(p.isFullStalkerPortal !== undefined
                            ? {
                                  isFullStalkerPortal: p.isFullStalkerPortal,
                              }
                            : {}),
                        ...(p.stalkerSerialNumber !== undefined
                            ? {
                                  stalkerSerialNumber: p.stalkerSerialNumber,
                              }
                            : {}),
                        ...(p.stalkerDeviceId1 !== undefined
                            ? { stalkerDeviceId1: p.stalkerDeviceId1 }
                            : {}),
                        ...(p.stalkerDeviceId2 !== undefined
                            ? { stalkerDeviceId2: p.stalkerDeviceId2 }
                            : {}),
                        ...(p.stalkerSignature1 !== undefined
                            ? { stalkerSignature1: p.stalkerSignature1 }
                            : {}),
                        ...(p.stalkerSignature2 !== undefined
                            ? { stalkerSignature2: p.stalkerSignature2 }
                            : {}),
                        ...(p.stalkerSessionPatch !== undefined
                            ? {
                                  stalkerToken:
                                      p.stalkerSessionPatch?.stalkerToken,
                                  stalkerSessionIdentity:
                                      p.stalkerSessionPatch
                                          ?.stalkerSessionIdentity,
                                  stalkerWatchdogTimeout:
                                      p.stalkerSessionPatch
                                          ?.stalkerWatchdogTimeout,
                                  stalkerTimeslot:
                                      p.stalkerSessionPatch?.stalkerTimeslot,
                                  stalkerAccountInfo:
                                      p.stalkerSessionPatch?.stalkerAccountInfo,
                              }
                            : {}),
                        ...(p.favorites != null
                            ? { favorites: p.favorites }
                            : {}),
                        ...(p.recentlyViewed != null
                            ? { recentlyViewed: p.recentlyViewed }
                            : {}),
                        ...(p.hiddenGroupTitles != null
                            ? { hiddenGroupTitles: p.hiddenGroupTitles }
                            : {}),
                        ...(p.m3uContentOverrides !== undefined
                            ? { m3uContentOverrides: p.m3uContentOverrides }
                            : {}),
                        ...(p.epgUrls != null ? { epgUrls: p.epgUrls } : {}),
                        ...(p.detectedEpgUrls != null
                            ? { detectedEpgUrls: p.detectedEpgUrls }
                            : {}),
                        ...(p.manualEpgUrls != null
                            ? { manualEpgUrls: p.manualEpgUrls }
                            : {}),
                        ...(p.disabledEpgUrls != null
                            ? { disabledEpgUrls: p.disabledEpgUrls }
                            : {}),
                        ...(p.updateDate !== undefined
                            ? { updateDate: p.updateDate }
                            : {}),
                    },
                },
                state.playlists
            ),
        };
    }),
    on(PlaylistActions.updateManyPlaylists, (state, action): PlaylistState => {
        return {
            ...state,
            playlists: playlistsAdapter.updateMany(
                action.playlists.map((updatedPlaylist) => ({
                    id: updatedPlaylist._id,
                    changes: {
                        ...updatedPlaylist,
                        updateDate: Date.now(),
                    },
                })),
                state.playlists
            ),
        };
    }),
    on(PlaylistActions.removeAllPlaylists, (state): PlaylistState => {
        const playlists = playlistsAdapter.removeAll(state.playlists);
        return {
            ...state,
            playlists: {
                ...playlists,
                selectedId: '',
            },
        };
    }),
    on(
        PlaylistActions.handleAddingPlaylistByUrl,
        (state, action): PlaylistState => {
            if (action.isTemporary) {
                return {
                    ...state,
                    channelsLoading: false,
                    channels: action.playlist.playlist.items as Channel[],
                };
            } else {
                return {
                    ...state,
                    playlists: playlistsAdapter.addOne(
                        action.playlist,
                        state.playlists
                    ),
                };
            }
        }
    ),
];
