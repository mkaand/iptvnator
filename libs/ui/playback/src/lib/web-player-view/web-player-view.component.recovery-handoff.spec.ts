import { ClipboardModule } from '@angular/cdk/clipboard';
import { signal } from '@angular/core';
import {
    ComponentFixture,
    DeferBlockBehavior,
    TestBed,
} from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
import { StorageMap } from '@ngx-pwa/local-storage';
import { TranslateModule } from '@ngx-translate/core';
import {
    PlaybackDiagnosticCode,
    PlaybackDiagnosticSource,
    type PlaybackDiagnostic,
} from '@iptvnator/playback/util';
import { PORTAL_EXTERNAL_PLAYBACK } from '@iptvnator/portal/shared/util';
import { RuntimeCapabilitiesService, SettingsStore } from '@iptvnator/services';
import {
    type ExternalPlayerSession,
    type ResolvedPortalPlayback,
    STORE_KEY,
    VideoPlayer,
} from '@iptvnator/shared/interfaces';
import { VodSourceRowComponent } from '@iptvnator/ui/components';
import { of } from 'rxjs';
import { PlaybackDiagnosticPanelComponent } from '../playback-diagnostic-panel/playback-diagnostic-panel.component';
import { ElectronStreamHeadersService } from './electron-stream-headers.service';
import type { WebPlayerViewComponent as WebPlayerViewComponentInstance } from './web-player-view.component';
import {
    StubArtPlayerComponent,
    StubEmbeddedMpvPlayerComponent,
    StubFullscreenChannelPanelComponent,
    StubHtmlVideoPlayerComponent,
    StubVjsPlayerComponent,
} from './web-player-view.spec-stubs';

jest.unstable_mockModule('video.js', () => ({ default: jest.fn() }));
jest.unstable_mockModule('@yangkghjh/videojs-aspect-ratio-panel', () => ({}));
jest.unstable_mockModule('videojs-contrib-quality-levels', () => ({}));
jest.unstable_mockModule('videojs-quality-selector-hls', () => ({}));

describe('WebPlayerViewComponent recovery handoff', () => {
    let WebPlayerViewComponent: typeof import('./web-player-view.component').WebPlayerViewComponent;
    let fixture: ComponentFixture<WebPlayerViewComponentInstance>;
    let component: WebPlayerViewComponentInstance;
    let holdHeaderHandoff: boolean;
    let headerResolvers: Array<(stillCurrent: boolean) => void>;
    const storedSettings = { player: VideoPlayer.VideoJs };
    const streamHeaders = {
        apply: jest.fn(() =>
            holdHeaderHandoff
                ? new Promise<boolean>((resolve) => {
                      headerResolvers.push(resolve);
                  })
                : null
        ),
        clear: jest.fn(),
    };

    beforeAll(async () => {
        ({ WebPlayerViewComponent } =
            await import('./web-player-view.component'));
    });

    beforeEach(async () => {
        holdHeaderHandoff = false;
        headerResolvers = [];
        streamHeaders.apply.mockClear();
        streamHeaders.clear.mockClear();
        const activeExternalSession = signal<ExternalPlayerSession | null>(
            null
        );

        await TestBed.configureTestingModule({
            deferBlockBehavior: DeferBlockBehavior.Playthrough,
            imports: [WebPlayerViewComponent, TranslateModule.forRoot()],
            providers: [
                {
                    provide: StorageMap,
                    useValue: {
                        get: jest.fn((key: string) =>
                            of(
                                key === STORE_KEY.Settings
                                    ? storedSettings
                                    : undefined
                            )
                        ),
                    },
                },
                {
                    provide: RuntimeCapabilitiesService,
                    useValue: { supportsManagedExternalPlayers: true },
                },
                {
                    provide: ElectronStreamHeadersService,
                    useValue: streamHeaders,
                },
                {
                    provide: SettingsStore,
                    useValue: {
                        showCaptions: () => false,
                        webPlayerSharedControls: () => false,
                    },
                },
                {
                    provide: PORTAL_EXTERNAL_PLAYBACK,
                    useValue: {
                        activeSession: activeExternalSession,
                        visibleSession: activeExternalSession,
                        dismissActiveSession: jest.fn(),
                        closeSession: jest.fn(),
                    },
                },
            ],
        })
            .overrideComponent(WebPlayerViewComponent, {
                set: {
                    imports: [
                        ClipboardModule,
                        MatButtonModule,
                        MatIconModule,
                        MatTooltipModule,
                        PlaybackDiagnosticPanelComponent,
                        StubArtPlayerComponent,
                        StubEmbeddedMpvPlayerComponent,
                        StubFullscreenChannelPanelComponent,
                        StubHtmlVideoPlayerComponent,
                        StubVjsPlayerComponent,
                        TranslateModule,
                        VodSourceRowComponent,
                    ],
                },
            })
            .compileComponents();

        fixture = TestBed.createComponent(WebPlayerViewComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput(
            'streamUrl',
            'https://example.com/live.m3u8'
        );
        fixture.componentRef.setInput('title', 'Recovery stream');
        fixture.componentRef.setInput('playbackSessionKey', 'content-a');
    });

    afterEach(() => fixture.destroy());

    it('keeps a replaced-source diagnostic detached across every handoff outcome', async () => {
        await render();
        vjs().playbackIssue.emit(mediaIssue());
        fixture.detectChanges();
        holdHeaderHandoff = true;

        setPlayback({ streamUrl: 'https://example.com/alternate.m3u8' });
        fixture.detectChanges();
        expect(query('playback-diagnostic-banner')).toBeNull();
        setPlayback({ streamUrl: 'https://example.com/current.m3u8' });
        fixture.detectChanges();
        expect(headerResolvers).toHaveLength(2);
        expect(query('playback-diagnostic-banner')).toBeNull();

        headerResolvers[0](true);
        await fixture.whenStable();
        fixture.detectChanges();
        expect(query('playback-diagnostic-banner')).toBeNull();

        headerResolvers[1](false);
        await fixture.whenStable();
        fixture.detectChanges();
        expect(query('playback-diagnostic-banner')).toBeNull();

        setPlayback({ streamUrl: 'https://example.com/final.m3u8' });
        fixture.detectChanges();
        headerResolvers[2](true);
        await fixture.whenStable();
        expect(component.visiblePlaybackDiagnostic()).toBeNull();
        expect(component.vjsOptions()).toEqual(
            expect.objectContaining({
                sources: [
                    expect.objectContaining({
                        src: 'https://example.com/final.m3u8',
                    }),
                ],
            })
        );
    });

    async function render(): Promise<void> {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    }

    function setPlayback(overrides: Partial<ResolvedPortalPlayback>): void {
        fixture.componentRef.setInput('playback', {
            streamUrl: 'https://example.com/live.m3u8',
            title: 'Recovery stream',
            isLive: false,
            ...overrides,
        });
    }

    function vjs(): StubVjsPlayerComponent {
        return fixture.debugElement.query(By.directive(StubVjsPlayerComponent))
            .componentInstance as StubVjsPlayerComponent;
    }

    function query(testId: string): HTMLElement | null {
        return fixture.nativeElement.querySelector(
            `[data-test-id="${testId}"]`
        );
    }

    function mediaIssue(): PlaybackDiagnostic {
        return {
            code: PlaybackDiagnosticCode.MediaDecodeError,
            source: PlaybackDiagnosticSource.Vhs,
            sourceUrl: 'https://example.com/live.m3u8',
            container: 'm3u8',
            mimeType: 'application/x-mpegURL',
            player: 'videojs',
            audioCodecs: [],
            videoCodecs: [],
        };
    }
});
