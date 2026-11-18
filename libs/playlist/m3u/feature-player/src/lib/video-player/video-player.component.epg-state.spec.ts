import { AsyncPipe } from '@angular/common';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { StorageMap } from '@ngx-pwa/local-storage';
import { TranslatePipe } from '@ngx-translate/core';
import { EpgService } from '@iptvnator/epg/data-access';
import {
    ChannelActions,
    getChannelEpgAliasKey,
    replaceExactEpgNameAliases,
} from '@iptvnator/m3u-state';
import { PlaylistContextFacade } from '@iptvnator/playlist/shared/util';
import {
    LIVE_EPG_PANEL_STATE_STORAGE_KEY,
    PORTAL_EXTERNAL_PLAYBACK,
    WorkspaceHeaderContextService,
} from '@iptvnator/portal/shared/util';
import {
    DataService,
    PlaylistsService,
    RuntimeCapabilitiesService,
    SettingsStore,
} from '@iptvnator/services';
import {
    EpgProgram,
    Settings,
    VideoPlayer,
} from '@iptvnator/shared/interfaces';
import { MockPipe } from 'ng-mocks';
import { of } from 'rxjs';
import type { VideoPlayerComponent as VideoPlayerComponentInstance } from './video-player.component';
import {
    activeEpgProgram,
    activePlaybackUrl,
    channelsLoading,
    currentEpgProgram,
    currentEpgProgram$,
    dataServiceMock,
    epgPrograms$,
    epgServiceMock,
    epgUrlSetting,
    epgViewMode,
    externalSession,
    player,
    playlistId,
    playlistsServiceMock,
    routerMock,
    sampleChannel,
    showCaptions,
    storeMock,
    stripCountryPrefix,
    syncStoreState,
    translateServiceProvider,
} from './video-player.spec-harness';
import {
    StubAudioPlayerComponent,
    StubChannelListLoadingStateComponent,
    StubEpgGuideComponent,
    StubEpgGuideNowPlayingComponent,
    StubEpgTimelineComponent,
    StubM3uContentNavigationComponent,
    StubPortalEmptyStateComponent,
    StubResizableDirective,
    StubSidebarComponent,
    StubWebPlayerViewComponent,
} from './video-player.spec-stubs';

jest.unstable_mockModule('video.js', () => ({ default: jest.fn() }));
jest.unstable_mockModule('@yangkghjh/videojs-aspect-ratio-panel', () => ({}));
jest.unstable_mockModule('videojs-contrib-quality-levels', () => ({}));
jest.unstable_mockModule('videojs-quality-selector-hls', () => ({}));

describe('VideoPlayerComponent EPG state', () => {
    let VideoPlayerComponent: typeof import('./video-player.component').VideoPlayerComponent;
    let fixture: ComponentFixture<VideoPlayerComponentInstance>;
    let component: VideoPlayerComponentInstance;
    const originalElectron = window.electron;

    beforeAll(async () => {
        ({ VideoPlayerComponent } = await import('./video-player.component'));
    });

    beforeEach(async () => {
        window.electron = {
            platform: 'darwin',
            updateRemoteControlStatus: jest.fn(),
            onChannelChange: jest.fn(() => jest.fn()),
            onRemoteControlCommand: jest.fn(() => jest.fn()),
            getEpgProgramsForChannels: jest.fn().mockResolvedValue({}),
            getEpgProgramCoverage: jest.fn().mockResolvedValue([]),
        } as unknown as typeof window.electron;

        syncStoreState(null);
        playlistId.set('playlist-1');
        localStorage.removeItem('m3u-sidebar-width');
        localStorage.removeItem(LIVE_EPG_PANEL_STATE_STORAGE_KEY);
        player.set(VideoPlayer.VideoJs);
        showCaptions.set(false);
        stripCountryPrefix.set(false);
        activePlaybackUrl.set(null);
        channelsLoading.set(false);
        currentEpgProgram.set(null);
        activeEpgProgram.set(null);
        externalSession.set(null);
        currentEpgProgram$.next(null);
        epgPrograms$.next([]);
        routerMock.currentNavigation.mockReturnValue(null);
        routerMock.navigate.mockClear();
        storeMock.dispatch.mockClear();
        dataServiceMock.sendIpcEvent.mockClear();

        await TestBed.configureTestingModule({
            imports: [VideoPlayerComponent],
            schemas: [NO_ERRORS_SCHEMA],
            providers: [
                {
                    provide: ActivatedRoute,
                    useValue: {
                        params: of({ id: playlistId(), view: 'all' }),
                        queryParams: of({}),
                        snapshot: { queryParams: {} },
                    },
                },
                { provide: Router, useValue: routerMock },
                { provide: Store, useValue: storeMock },
                translateServiceProvider,
                { provide: DataService, useValue: dataServiceMock },
                {
                    provide: RuntimeCapabilitiesService,
                    useValue: {
                        get supportsEpg() {
                            return Boolean(window.electron);
                        },
                        get isElectron() {
                            return Boolean(window.electron);
                        },
                        get supportsRemoteControl() {
                            const bridge:
                                Partial<typeof window.electron> | undefined =
                                window.electron;
                            return (
                                [
                                    'updateRemoteControlStatus',
                                    'onChannelChange',
                                    'onRemoteControlCommand',
                                ] as const
                            ).every(
                                (method) =>
                                    typeof bridge?.[method] === 'function'
                            );
                        },
                    },
                },
                { provide: PlaylistsService, useValue: playlistsServiceMock },
                { provide: EpgService, useValue: epgServiceMock },
                {
                    provide: PlaylistContextFacade,
                    useValue: { resolvedPlaylistId: playlistId },
                },
                {
                    provide: SettingsStore,
                    useValue: {
                        player,
                        showCaptions,
                        stripCountryPrefix,
                        resolvedEpgViewMode: epgViewMode,
                        resolvedEpgOffsetMinutes: signal(0),
                        epgUrl: epgUrlSetting,
                    },
                },
                {
                    provide: StorageMap,
                    useValue: {
                        get: jest.fn(() =>
                            of({
                                player: player(),
                                showCaptions: showCaptions(),
                            } as Partial<Settings>)
                        ),
                    },
                },
                {
                    provide: PORTAL_EXTERNAL_PLAYBACK,
                    useValue: { activeSession: externalSession },
                },
            ],
        })
            .overrideComponent(VideoPlayerComponent, {
                set: {
                    imports: [
                        AsyncPipe,
                        StubAudioPlayerComponent,
                        StubChannelListLoadingStateComponent,
                        StubEpgGuideComponent,
                        StubEpgGuideNowPlayingComponent,
                        StubEpgTimelineComponent,
                        StubPortalEmptyStateComponent,
                        StubResizableDirective,
                        StubSidebarComponent,
                        StubM3uContentNavigationComponent,
                        StubWebPlayerViewComponent,
                        MockPipe(
                            TranslatePipe,
                            (value: string | null | undefined) => value ?? ''
                        ),
                    ],
                },
            })
            .compileComponents();

        fixture = TestBed.createComponent(VideoPlayerComponent);
        component = fixture.componentInstance;
        TestBed.inject(WorkspaceHeaderContextService);
    });

    afterEach(() => {
        fixture?.destroy();
        localStorage.removeItem(LIVE_EPG_PANEL_STATE_STORAGE_KEY);
        window.electron = originalElectron;
        replaceExactEpgNameAliases(new Map());
    });

    it('reloads the current programme after an async XMLTV alias arrives, without selecting or restarting a channel', () => {
        replaceExactEpgNameAliases(new Map());
        syncStoreState(sampleChannel);
        fixture.detectChanges();
        epgServiceMock.getChannelPrograms.mockClear();
        storeMock.dispatch.mockClear();
        replaceExactEpgNameAliases(
            new Map([
                [getChannelEpgAliasKey(sampleChannel), 'playlist.bbc.earth'],
            ])
        );
        fixture.detectChanges();
        expect(epgServiceMock.getChannelPrograms).toHaveBeenCalledWith(
            'playlist.bbc.earth'
        );
        expect(storeMock.dispatch).not.toHaveBeenCalledWith(
            ChannelActions.setActiveChannel({ channel: sampleChannel })
        );
        epgServiceMock.getChannelPrograms.mockClear();
        replaceExactEpgNameAliases(
            new Map([
                [getChannelEpgAliasKey(sampleChannel), 'playlist.bbc.earth'],
            ])
        );
        fixture.detectChanges();
        expect(epgServiceMock.getChannelPrograms).not.toHaveBeenCalled();
        replaceExactEpgNameAliases(new Map());
        syncStoreState(null);
        fixture.detectChanges();
    });

    describe('EPG needs-setup empty state', () => {
        beforeEach(() => {
            epgUrlSetting.set([]);
            epgPrograms$.next([]);
        });

        afterEach(() => {
            epgUrlSetting.set([]);
            epgPrograms$.next([]);
        });

        it('claims needs-setup only while no EPG source exists anywhere', () => {
            expect(component.liveEpgEmptyReason()).toBe('m3u-needs-setup');
            epgUrlSetting.set(['https://example.org/guide.xml']);
            expect(component.liveEpgEmptyReason()).toBe('none');
        });

        it('never overrides a channel that actually has programmes', () => {
            epgPrograms$.next([buildProgram('Morning Bulletin')]);
            expect(component.liveEpgEmptyReason()).toBe('none');
        });

        it('deep links the empty-state button to the EPG settings page', () => {
            component.openEpgSettings();
            expect(routerMock.navigate).toHaveBeenCalledWith([
                '/workspace/settings',
                'epg',
            ]);
        });
    });
});

function buildProgram(title: string): EpgProgram {
    return {
        start: '2026-04-05T11:30:00.000Z',
        stop: '2026-04-05T12:30:00.000Z',
        channel: 'sample-tvg-id',
        title,
        desc: null,
        category: null,
        startTimestamp: 1775388600,
        stopTimestamp: 1775392200,
    };
}
