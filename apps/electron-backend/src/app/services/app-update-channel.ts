import {
    AppUpdateChannel,
    normalizeAppUpdateChannel,
} from '@iptvnator/shared/interfaces';
import {
    APP_UPDATE_AUTO_CHECK,
    APP_UPDATE_CHANNEL,
    store,
} from './store.service';

type AppUpdateChannelListener = (channel: AppUpdateChannel) => void;
type AppUpdateAutoCheckListener = (enabled: boolean) => void;

const listeners = new Set<AppUpdateChannelListener>();
const autoCheckListeners = new Set<AppUpdateAutoCheckListener>();

/**
 * The persisted update channel, read synchronously from the main-process
 * config so the startup update check can use it before any renderer exists.
 * Junk in the config file collapses to `stable`.
 */
export function readStoredAppUpdateChannel(): AppUpdateChannel {
    return normalizeAppUpdateChannel(store.get(APP_UPDATE_CHANNEL));
}

/**
 * Mirrors a saved `Settings.updateChannel` into the config file and tells
 * the updater. Listeners only run on an actual change, so a Save that keeps
 * the channel cannot restart an update check.
 */
export function persistAppUpdateChannel(value: unknown): AppUpdateChannel {
    const channel = normalizeAppUpdateChannel(value);
    const previous = readStoredAppUpdateChannel();

    store.set(APP_UPDATE_CHANNEL, channel);

    if (channel !== previous) {
        for (const listener of listeners) {
            listener(channel);
        }
    }

    return channel;
}

export function readStoredAppUpdateAutoCheck(): boolean {
    return store.get(APP_UPDATE_AUTO_CHECK) === true;
}

export function persistAppUpdateAutoCheck(value: unknown): boolean {
    const enabled = value === true;
    const previous = readStoredAppUpdateAutoCheck();
    store.set(APP_UPDATE_AUTO_CHECK, enabled);

    if (enabled !== previous) {
        for (const listener of autoCheckListeners) {
            listener(enabled);
        }
    }

    return enabled;
}

export function onAppUpdateChannelChange(
    listener: AppUpdateChannelListener
): () => void {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

export function onAppUpdateAutoCheckChange(
    listener: AppUpdateAutoCheckListener
): () => void {
    autoCheckListeners.add(listener);

    return () => {
        autoCheckListeners.delete(listener);
    };
}
