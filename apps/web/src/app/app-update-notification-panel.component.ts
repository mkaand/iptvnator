import {
    ChangeDetectionStrategy,
    Component,
    computed,
    OnDestroy,
    OnInit,
    signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
    ELECTRON_BRIDGE_APP_UPDATE_STATUSES,
    ElectronBridgeAppUpdateStatus,
} from '@iptvnator/shared/interfaces';
import { AppUpdateNotificationCardComponent } from './app-update-notification-card.component';

/**
 * Follows the main process's update status and shows the notification card
 * once an update is available. The panel is mounted on every launch, so the
 * card and its Material buttons, icons and dialog load with the first
 * notification instead of with the app. Should that chunk fail to load, a
 * notice points at the settings, where the update can still be installed.
 */
@Component({
    selector: 'app-update-notification-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [AppUpdateNotificationCardComponent, TranslatePipe],
    template: `
        @defer (when visibleStatus()) {
            @if (visibleStatus(); as current) {
                <app-update-notification-card
                    [status]="current"
                    (statusChange)="status.set($event)"
                    (dismissed)="dismiss()"
                />
            }
        } @error {
            @if (visibleStatus()) {
                <div class="app-update-notification-unavailable" role="alert">
                    {{ 'SETTINGS.APP_UPDATE_PANEL_UNAVAILABLE' | translate }}
                </div>
            }
        }
    `,
    styleUrl: './app-update-notification-panel.component.scss',
})
export class AppUpdateNotificationPanelComponent implements OnInit, OnDestroy {
    private static readonly dismissalPrefix =
        'iptvnator-app-update-dismissed-v1:mkaand/iptvnator';
    private unsubscribeStatus: (() => void) | null = null;

    readonly status = signal<ElectronBridgeAppUpdateStatus | null>(null);
    readonly dismissedVersion = signal<string | null>(null);
    readonly isVisible = computed(() => {
        const status = this.status();

        if (!status?.latestVersion) {
            return false;
        }

        if (
            this.dismissedVersion() === this.dismissalKey(status) ||
            this.wasDismissed(status)
        ) {
            return false;
        }

        return (
            status.status === ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Available ||
            status.status === ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloading ||
            status.status === ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloaded
        );
    });
    /** The status the card shows, or null while there is nothing to show. */
    readonly visibleStatus = computed(() =>
        this.isVisible() ? this.status() : null
    );

    ngOnInit(): void {
        if (!window.electron?.getAppUpdateStatus) {
            return;
        }

        this.unsubscribeStatus =
            window.electron.onAppUpdateStatusChange?.((status) => {
                this.status.set(status);
            }) ?? null;

        void window.electron.getAppUpdateStatus().then((status) => {
            this.status.set(status);
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeStatus?.();
        this.unsubscribeStatus = null;
    }

    dismiss(): void {
        const status = this.status();
        if (!status?.latestVersion) {
            return;
        }

        const key = this.dismissalKey(status);
        try {
            localStorage.setItem(key, '1');
        } catch {
            // Storage is optional; the current-session signal still hides it.
        }
        this.dismissedVersion.set(key);
    }

    private dismissalKey(status: ElectronBridgeAppUpdateStatus): string {
        return `${AppUpdateNotificationPanelComponent.dismissalPrefix}:${status.channel}:${status.latestVersion}`;
    }

    private wasDismissed(status: ElectronBridgeAppUpdateStatus): boolean {
        try {
            return localStorage.getItem(this.dismissalKey(status)) === '1';
        } catch {
            return false;
        }
    }
}
