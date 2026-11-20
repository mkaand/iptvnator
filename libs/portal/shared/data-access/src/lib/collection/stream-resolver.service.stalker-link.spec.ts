import { TestBed } from '@angular/core/testing';
import { EpgRuntimeBridgeService } from '@iptvnator/epg/data-access';
import { StalkerSessionService } from '@iptvnator/portal/stalker/data-access';
import { UnifiedCollectionItem } from '@iptvnator/portal/shared/util';
import {
    XtreamApiService,
    XtreamUrlService,
} from '@iptvnator/portal/xtream/data-access';
import {
    DataService,
    PlaylistsService,
    SettingsStore,
} from '@iptvnator/services';
import { Playlist } from '@iptvnator/shared/interfaces';
import { of } from 'rxjs';
import { StreamResolverService } from './stream-resolver.service';

describe('StreamResolverService Stalker link responses', () => {
    let service: StreamResolverService;
    let playlistsService: { getPlaylistById: jest.Mock };
    let dataService: { sendIpcEvent: jest.Mock };

    beforeEach(() => {
        playlistsService = { getPlaylistById: jest.fn() };
        dataService = { sendIpcEvent: jest.fn() };

        TestBed.configureTestingModule({
            providers: [
                StreamResolverService,
                { provide: PlaylistsService, useValue: playlistsService },
                {
                    provide: XtreamApiService,
                    useValue: {
                        getShortEpg: jest.fn(),
                        getFullEpg: jest.fn(),
                    },
                },
                {
                    provide: XtreamUrlService,
                    useValue: { constructLiveUrl: jest.fn() },
                },
                { provide: DataService, useValue: dataService },
                {
                    provide: SettingsStore,
                    useValue: { resolvedEpgOffsetMinutes: () => 0 },
                },
                {
                    provide: EpgRuntimeBridgeService,
                    useValue: {
                        getChannelPrograms: jest.fn(),
                        getEpgMapping: jest.fn().mockResolvedValue(null),
                        getEpgMappingsBatch: jest.fn().mockResolvedValue(null),
                        supportsProgramLookup: true,
                    },
                },
                {
                    provide: StalkerSessionService,
                    useValue: {
                        getCachedToken: jest.fn(() => null),
                        ensureToken: jest
                            .fn()
                            .mockResolvedValue({ token: null }),
                        makeAuthenticatedRequest: jest.fn(),
                    },
                },
            ],
        });

        service = TestBed.inject(StreamResolverService);
    });

    it('mints a link for a flagged Stalker favorite', async () => {
        playlistsService.getPlaylistById.mockReturnValue(
            of({
                _id: 'stalker-1',
                portalUrl: 'https://stalker.example.com/portal.php',
                macAddress: '00:11:22:33:44:55',
                isFullStalkerPortal: false,
            } satisfies Partial<Playlist>)
        );
        dataService.sendIpcEvent.mockResolvedValue({
            js: { cmd: 'ffmpeg http://cdn.example.com/tmp/90.m3u8?tok=1' },
        });

        const playback = await service.resolvePlayback({
            uid: 'stalker::stalker-1::90',
            name: 'Balanced Channel',
            contentType: 'live',
            sourceType: 'stalker',
            playlistId: 'stalker-1',
            playlistName: 'Stalker',
            stalkerId: '90',
            stalkerCmd: 'ffrt3 http://cdn.example.com/live/90.m3u8',
            stalkerItem: {
                id: '90',
                cmd: 'ffrt3 http://cdn.example.com/live/90.m3u8',
                use_load_balancing: '1',
            },
        } as UnifiedCollectionItem);

        expect(dataService.sendIpcEvent).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({ action: 'create_link' }),
            })
        );
        expect(playback.streamUrl).toBe(
            'http://cdn.example.com/tmp/90.m3u8?tok=1'
        );
    });

    it('appends query-only Stalker create_link responses to the original cmd URL', async () => {
        playlistsService.getPlaylistById.mockReturnValue(
            of({
                _id: 'stalker-1',
                portalUrl: 'https://stalker.example.com/portal.php',
                macAddress: '00:11:22:33:44:55',
                isFullStalkerPortal: false,
            } satisfies Partial<Playlist>)
        );
        dataService.sendIpcEvent.mockResolvedValue({
            js: { cmd: '?token=xyz' },
        });

        const playback = await service.resolvePlayback({
            uid: 'stalker::stalker-1::89',
            name: 'Token Channel',
            contentType: 'live',
            sourceType: 'stalker',
            playlistId: 'stalker-1',
            playlistName: 'Stalker',
            stalkerId: '89',
            stalkerCmd: 'auto http://cdn.example.com/live/89.m3u8',
        } satisfies UnifiedCollectionItem);

        expect(playback.streamUrl).toBe(
            'http://cdn.example.com/live/89.m3u8?token=xyz'
        );
    });
});
