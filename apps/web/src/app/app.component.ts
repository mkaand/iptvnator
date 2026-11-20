import {
    Component,
    DestroyRef,
    effect,
    inject,
    OnInit,
    signal,
    ChangeDetectionStrategy,
} from '@angular/core';
import { LazySnackBar } from '@iptvnator/services/lazy-snack-bar';
import { Router, RouterOutlet } from '@angular/router';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import {
    EpgRuntimeBridgeService,
    EpgProgressService,
    EpgService,
} from '@iptvnator/epg/data-access';
import {
    WorkspaceShellContextDrawerService,
    WORKSPACE_SHELL_ACTIONS,
} from '@iptvnator/workspace/shell/util';
import { EpgProgressPanelComponent } from '@iptvnator/ui/epg/progress-panel';
// File-level entry: the @iptvnator/ui/components barrel would put the whole
// library (channel lists, EPG, forms, date-fns) on the initial path.
import { WindowControlsComponent } from '@iptvnator/ui/components/window-controls';
import { PlaylistActions, selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import { take } from 'rxjs';
import {
    DataService,
    ParentalLockService,
    RuntimeCapabilitiesService,
    SettingsStore,
    EpgSourceSettingsService,
} from '@iptvnator/services';
import {
    AUTO_UPDATE_PLAYLISTS,
    ElectronBridgeAppUpdateStatus,
    Language,
    Settings,
    STORE_KEY,
    Theme,
} from '@iptvnator/shared/interfaces';
import { AppDateLocaleService } from './app-date-locales';
import { EpgAutoRefreshService } from './services/epg-auto-refresh.service';
import { SettingsService } from './services/settings.service';
import { ParentalLockEnforcementService } from './services/parental-lock-enforcement.service';
import { PlaybackKeepAwakeService } from './services/playback-keep-awake.service';
import { PlaylistOpenRequestService } from './services/playlist-open-request.service';
import { AppUpdateNotificationPanelComponent } from './app-update-notification-panel.component';
import { AppStartupStatusComponent } from './app-startup-status.component';
import { syncDocumentLanguage } from './services/document-language';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AppStartupStatusComponent,
        AppUpdateNotificationPanelComponent,
        EpgProgressPanelComponent,
        RouterOutlet,
        WindowControlsComponent,
    ],
})
export class AppComponent implements OnInit {
    readonly ready = signal(false);
    readonly progress = inject(EpgProgressService);
    readonly updateNotice = signal<ElectronBridgeAppUpdateStatus | null>(null);
    private readonly destroyRef = inject(DestroyRef);
    private actions$ = inject(Actions);
    private dataService = inject(DataService);
    private readonly locales = inject(AppDateLocaleService);
    private bridge = inject(EpgRuntimeBridgeService);
    private epg = inject(EpgService);
    private readonly epgRefresh = inject(EpgAutoRefreshService);
    private snackBar = inject(LazySnackBar);
    private router = inject(Router);
    private store = inject(Store);
    private translate = inject(TranslateService);
    private prefs = inject(SettingsService);
    private stored = inject(SettingsStore);
    private readonly sources = inject(EpgSourceSettingsService);
    private keepAwake = inject(PlaybackKeepAwakeService);
    private readonly lock = inject(ParentalLockService);
    private readonly lockGuard = inject(
        ParentalLockEnforcementService
    );
    private openFiles = inject(PlaylistOpenRequestService);
    readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly shell = inject(WORKSPACE_SHELL_ACTIONS);
    private readonly drawer = inject(WorkspaceShellContextDrawerService);

    constructor() {
        syncDocumentLanguage();

        // An update only needs its UI chunk once a notification exists.
        // Subscribe before the first navigation so late status events are not lost.
        const bridge = window.electron;
        if (bridge?.getAppUpdateStatus) {
            const onUpdateStatus = (status: ElectronBridgeAppUpdateStatus) => {
                if (
                    status.latestVersion &&
                    (status.status === 'available' ||
                        status.status.startsWith('download'))
                ) {
                    this.updateNotice.set(status);
                }
            };
            this.destroyRef.onDestroy(bridge.onAppUpdateStatusChange(onUpdateStatus));
            void bridge.getAppUpdateStatus().then(onUpdateStatus, () => undefined);
        }

        // Body-level class (like 'dark-theme') so layout adjustments also
        // reach content rendered outside app-root, e.g. cdk-overlay content.
        if (this.runtime.usesCustomWindowControls) {
            document.body.classList.add('frameless-platform');
        }

        // Playlist files the OS asked us to open (command line argument, file
        // association, macOS `open-file`) are resolved in the main process and
        // queued there until the renderer subscribes. Start listening as early
        // as possible so a first-launch file is not delayed behind app init.
        this.openFiles.start();

        // Keep the display awake while a built-in player is playing video
        // (Electron powerSaveBlocker / PWA Screen Wake Lock, issue #1095).
        this.keepAwake.start();

        // Parental lock: load the PIN hash and lock store, then keep the
        // in-memory catalogs in step with lock/unlock (issue #285).
        void this.lock.initialize();
        this.lockGuard.start();

        effect(() => {
            const size = this.stored.coverSize?.() ?? 'medium';
            document.documentElement.dataset.coverSize = size;
        });

        if (this.runtime.isElectron) {
            document.addEventListener('keydown', (event) => {
                // Do not navigate behind the modal phone context drawer.
                if (
                    (event.ctrlKey || event.metaKey) &&
                    !this.drawer.isOpen() &&
                    event.key === 'r'
                ) {
                    event.preventDefault();
                    this.shell.openGlobalRecent();
                }
            });
        }
    }

    ngOnInit() {
        this.store.dispatch(PlaylistActions.loadPlaylists());
        this.translate.setDefaultLang(Language.ENGLISH);

        this.initSettings();
        this.epgRefresh.start();
        this.autoUpdatePlaylists();
    }

    /**
     * Reads the settings object from local storage and initializes the
     * application based on them
     */
    initSettings(): void {
        this.prefs
            .getValueFromLocalStorage<Settings>(STORE_KEY.Settings)
            .subscribe((settings: Settings) => {
                if (settings && Object.keys(settings).length > 0) {
                    // No need to send settings to Electron on init
                    // Settings are stored in IndexedDB and loaded by the settings store
                    // Only specific Electron settings (MPV/VLC paths) are sent when changed in settings component

                    const resolvedLang = settings.language ?? Language.ENGLISH;
                    // The switch re-renders every date with the new locale;
                    // its data is a lazy chunk that must be registered first.
                    void this.locales.use(resolvedLang);
                    // Mirror the active language to localStorage so the next
                    // cold start can read it synchronously in app.config.ts's
                    // getInitialLanguage() and avoid the English-then-localized
                    // flash for non-English users.
                    try {
                        localStorage.setItem(
                            'iptvnator:preferred-language',
                            resolvedLang
                        );
                    } catch {
                        // Ignore quota / privacy mode errors.
                    }

                    // Fetch EPG if URLs are configured (only fetch stale data)
                    if (
                        this.bridge.supportsImport &&
                        settings.epgAutoRefresh !== false &&
                        settings.epgRefreshOnStartup !== true &&
                        settings.epgUrl?.some((u) => u !== '')
                    ) {
                        this.fetchStaleEpgData(settings.epgUrl);
                    }

                    if (settings.theme) {
                        this.prefs.changeTheme(settings.theme);
                    } else {
                        this.detectDarkMode();
                    }
                } else {
                    this.detectDarkMode();
                }
            });
    }

    /**
     * Applies the operating system color scheme when no explicit theme is set
     */
    detectDarkMode(): void {
        this.prefs.changeTheme(Theme.SystemTheme);
    }

    /**
     * Navigate to the specified route
     * @param route route to navigate to
     */
    navigateToRoute(route: string) {
        this.router.navigateByUrl(route);
    }

    /**
     * Fetches EPG data only for URLs that have stale or missing data.
     * Data is considered fresh if updated within the last 12 hours.
     */
    private async fetchStaleEpgData(urls: string[]): Promise<void> {
        await this.stored.loadSettings();
        const revision = this.sources.revision();
        const fetchCurrentSources = async (sources: string[]) => {
            await this.sources.waitForReconciliation();
            this.epg.fetchEpg(
                this.sources.retainCurrentSources(sources, revision)
            );
        };
        if (!this.bridge.supportsSourceFreshness) {
            await fetchCurrentSources(urls);
            return;
        }

        try {
            const result = await this.bridge.checkFreshness(urls, 12);

            const staleUrls = result?.staleUrls ?? urls;
            if (result?.freshUrls.length && !staleUrls.length) {
                void this.snackBar.open(
                    this.translate.instant('EPG.UP_TO_DATE'),
                    this.translate.instant('CLOSE'),
                    { duration: 3000 }
                );
            }

            if (staleUrls.length) {
                await fetchCurrentSources(staleUrls);
            }
        } catch (error) {
            console.error('Error checking EPG freshness, fetching all:', error);
            // Fallback: fetch all URLs if freshness check fails
            await fetchCurrentSources(urls);
        }
    }

    /**
     * Triggers auto-update for playlists that have autoRefresh enabled
     */
    private autoUpdatePlaylists(): void {
        // Wait for playlists to be loaded successfully
        this.actions$
            .pipe(
                ofType(PlaylistActions.loadPlaylistsSuccess),
                take(1) // Only trigger once on app startup
            )
            .subscribe(() => {
                // Get all playlists from store
                this.store
                    .select(selectAllPlaylistsMeta)
                    .pipe(take(1))
                    .subscribe((playlists) => {
                        // Filter playlists with autoRefresh enabled
                        const playlistsToUpdate = playlists.filter(
                            (playlist) => playlist.autoRefresh === true
                        );

                        // Trigger auto-update if there are playlists to update
                        if (playlistsToUpdate.length > 0) {
                            this.dataService.sendIpcEvent(
                                AUTO_UPDATE_PLAYLISTS,
                                playlistsToUpdate
                            );
                        }
                    });
            });
    }
}
