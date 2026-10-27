# IPTVnator | mkaand Community Fork

> [!IMPORTANT]
> This is an **independent, unofficial fork** of [4gray/iptvnator](https://github.com/4gray/iptvnator), with original copyright, credits, and license retained. The fork is not affiliated with or endorsed by the upstream maintainers. Neither project provides IPTV services, subscriptions, playlists, channels, or copyrighted streams.

## Catalog.6 | Windows x64 accepted build

**Fork version:** `0.25.0-catalog.6`. Windows x64 acceptance tests completed on October 27, 2026. [Download the verified Windows installer ZIP from GitHub Actions](https://github.com/mkaand/iptvnator/actions/runs/40539331991/artifacts/12750643426) and extract `iptvnator-0.25.0-catalog.6-windows-x64-setup.exe`. The artifact is temporary and requires a GitHub login. See [Releases](https://github.com/mkaand/iptvnator/releases) for any subsequently published packages. This is an **unsigned community build** and may prompt Windows SmartScreen.

The fork preserves IPTVnator's original functionality and adds focused improvements for real-world M3U, XMLTV/EPG, playback, and browsing workflows. It works with the user's own legal playlists and programme guide, without rewriting source M3U or XMLTV content.

## Improvements compared with the original project

| Area | Added or extended in this fork | Practical advantage |
| --- | --- | --- |
| Mixed M3U playlists | Dedicated **Live TV, Movies, Series, Unclassified** sections, plus original all-content browsing | Keep a single large M3U instead of manually splitting live and VOD content |
| M3U movies | Poster-style, searchable, paginated catalog with group filtering | Browse movies visually rather than scanning an enormous channel list |
| M3U series | Grouping into series, seasons, and playable episodes | Find and play a specific episode more easily |
| Classification | Conservative group, name, filename and URL-based detection with manual content-type overrides | Correct provider-specific misclassification without rewriting the playlist |
| Source navigation | Per-section **All, Groups and Favorites** | Navigate different content categories without losing source context |
| XMLTV matching | Configurable matching order for channel name, `tvg-name` and `tvg-id` | Use reliable exact names when upstream/provider IDs are incorrect |
| Duplicate EPG entries | First Exact Match and per-channel XMLTV identity for shared `tvg-id` values | Keep HD/UHD channel guide entries independent, including global Favorites and Recently Viewed |
| Manual EPG assignments | Saved mapping priority is preserved | User-configured exceptions are not overwritten |
| EPG updates | Automatic background refresh at **6, 12, 18 or 24 hours**, optional refresh at startup, persisted settings | Keep imported guide data updated with predictable user control |
| Global EPG | Cold-start Favorites EPG, global Recently Viewed EPG, and selected-channel timeline reconciliation | Programme details remain available even when the source playlist is not yet open |
| Xtream EPG | External XMLTV versus provider EPG preference and name fallback | Better compatibility with third-party guide sources |
| Playback resilience | Up to five automatic retries for transient HLS/PHP stream failures, including temporary HTTP 403 responses | Reduce manual reconnecting while retaining bounded retries |
| Playback continuity | Last live channel restoration and accurate Recently Viewed ordering | Return to familiar live content and recent selections |
| VOD history | M3U Movies/Series entries appear under their own Recently Viewed tabs and reopen the recorded media | Keep films and episodes in the same unified viewing history as live channels |
| Collection management | Per-type and per-playlist/global history clearing with confirmation | Remove viewing history without deleting playlists or favorites |
| Distribution and quality | Dedicated Windows x64 installer workflow, Docker checks, typechecks, and regression tests | Reproducible fork builds and explicit acceptance testing |

### Windows validation

The Catalog.6 Windows x64 installer and Docker CI both completed successfully for commit [`17b094f`](https://github.com/mkaand/iptvnator/commit/17b094f6a6cf6389effbc4ec35d87f9b6ddc30b1). User acceptance confirmed EPG initialization and persistence, Favorites and Recently Viewed EPG, five playback retries, Live TV viewing history, Movies/Series history and reopening, last-channel playback, and dark-mode favorites sorting.

- [Windows build, tests, and temporary setup download](https://github.com/mkaand/iptvnator/actions/runs/40539331991)
- [Docker build](https://github.com/mkaand/iptvnator/actions/runs/40539341067)
- [Development PR #4](https://github.com/mkaand/iptvnator/pull/4)
- **Known limitation:** Turkish-language movie/series TMDB title matching was deliberately excluded from this acceptance scope.
- **Data safety:** Existing playlist URLs, credentials, favorites, mappings, and settings are retained. Do not post private IPTV credentials or playlist links in issue reports.

### Development and attribution

This community fork was developed and iteratively refined **with OpenAI Codex assistance**, guided by user requirements, code review, GitHub Actions checks, and hands-on Windows acceptance testing. AI-assisted changes are reviewed against the actual repository and acceptance results; the original upstream project's authorship and license remain acknowledged.

Upstream: [4gray/iptvnator](https://github.com/4gray/iptvnator) · Fork: [mkaand/iptvnator](https://github.com/mkaand/iptvnator) · [Fork issues](https://github.com/mkaand/iptvnator/issues)

---

## Original IPTVnator project information

The following documentation, screenshots, links, and upstream release/CI badges are inherited from the original project. They describe **upstream IPTVnator**, not the fork's own release status. Please credit and support the original authors.


<p align="center">
  <img src="https://raw.githubusercontent.com/4gray/iptvnator/electron/src/assets/icons/favicon.256x256.png" alt="IPTVnator icon" title="Free IPTV player application" />
</p>
<p align="center">
  <a href="https://github.com/4gray/iptvnator/releases"><img src="https://img.shields.io/github/release/4gray/iptvnator.svg?style=for-the-badge&logo=github" alt="Release"></a>
  <a href="https://github.com/4gray/iptvnator/releases"><img src="https://img.shields.io/github/v/release/4gray/iptvnator?include_prereleases&label=pre-release&logo=github&style=for-the-badge" /></a>
 <a href="https://github.com/4gray/iptvnator/actions/workflows/ci.yml"><img alt="CI status" src="https://img.shields.io/github/actions/workflow/status/4gray/iptvnator/ci.yml?branch=master&style=for-the-badge&logo=github&label=CI"></a> <a href="https://github.com/4gray/iptvnator/releases"><img src="https://img.shields.io/github/downloads/4gray/iptvnator/total?style=for-the-badge&logo=github" alt="Releases"></a> <a href="https://app.codecov.io/gh/4gray/iptvnator"><img alt="Codecov" src="https://img.shields.io/codecov/c/github/4gray/iptvnator?branch=master&style=for-the-badge&logo=codecov&logoColor=white"></a> <a href="https://t.me/iptvnator"><img src="https://img.shields.io/badge/telegram-iptvnator-blue?logo=telegram&style=for-the-badge" alt="Telegram"></a> <a href="https://bsky.app/profile/iptvnator.bsky.social"><img src="https://img.shields.io/badge/bluesky-iptvnator-darkblue?logo=bluesky&style=for-the-badge" alt="Bluesky"></a>
</p>

🌐 **[Website](https://4gray.github.io/iptvnator/)** | <a href="https://t.me/iptvnator">Telegram channel for discussions</a> | <a href="https://ko-fi.com/4gray" target="_blank">Buy me a coffee</a> | <a href="https://github.com/sponsors/4gray">GitHub Sponsors</a>

**IPTVnator** is a video player application that provides support for IPTV playlist playback (m3u, m3u8). The application allows users to import playlists using remote URLs or by uploading files from the local file system. Additionally, it supports EPG information in XMLTV format which can be provided via URL.

The application is a cross-platform, open-source project built with Electron and Angular.

⚠️ Note: IPTVnator does not provide any playlists or other digital content. The channels and pictures in the screenshots are for demonstration purposes only.

> [!IMPORTANT]
> **Official sources only.** IPTVnator is a free, open-source **player** — it never sells IPTV subscriptions, channels, or playlists. Websites offering "IPTVnator subscriptions/channels/premium/activated" builds are **not affiliated** with this project. Get the app only from the [official website](https://4gray.github.io/iptvnator/) or [GitHub Releases](https://github.com/4gray/iptvnator/releases). See [Beware of unofficial IPTVnator websites and IPTV services](https://4gray.github.io/iptvnator/blog/beware-unofficial-iptvnator-websites/) for details.

![IPTVnator: Channels list, player and epg list](./apps/website/public/screenshots/screenshot-player.webp)

## Features

**Playlists & sources**

- M3U / M3U8 playlists from local files or remote URLs 📂, with automatic updates on startup
- Xtream Codes (XC) and Stalker / Ministra (STB) portal support
- Custom "User-Agent" header per playlist

**Playback**

- Built-in HTML5 player (HLS.js or Video.js) with a resizable, resumable inline view
- Optional unified IPTVnator controls for HTML5, Video.js, and ArtPlayer, enabled in **Settings → Playback** _(experimental)_
- External players — MPV, VLC, and IINA on macOS (`mpv.app` / `VLC.app` bundle paths supported) _(desktop)_
- Embedded MPV — native mpv rendered inside the app window on macOS, Windows & Linux 🖥️ _(experimental · desktop)_
- Dedicated radio player for `radio="true"` streams 📻

**Live TV & EPG**

- EPG / XMLTV TV guide with a live timeline ribbon and multi-channel grid _(desktop)_
- TV archive / catch-up / timeshift _(desktop)_
- Group-based channel list, channel-number selection, and search 🔍

**Movies & series (VOD)**

- Redesigned two-state detail pages (browse ↔ watch) with season tabs and resume positions
- Download manager for offline movies & episodes ⬇️ _(desktop)_
- "Recently added" feeds and category grids with sorting & pagination

**Discovery & metadata**

- Global search across live TV, movies, and series _(desktop)_
- TMDB enrichment (opt-in, requires your own TMDB API key) — plots, cast & crew, trailers, ratings, artwork, a "Similar" rail, clickable actor pages, and a trending dashboard rail _(trending rail: desktop)_
- Dashboard with recently watched & continue-watching

**Organization**

- Per-playlist and global favorites, aggregated across all playlists ⭐
- Recently viewed / watch history
- Command palette (`Ctrl/Cmd+K`) that also finds and opens individual settings
- Settings search from the header search box on the Settings page

**Platform**

- Cross-platform desktop (Electron) and installable PWA
- Desktop auto-updater and mobile remote control _(desktop)_
- Docker self-hosting for the PWA + web backend
- 20 languages ([translation files](apps/web/src/assets/i18n/)), light & dark themes, and keyboard shortcuts

## Keyboard shortcuts

Press `?` or `Shift+/` in the workspace to open the in-app shortcuts list.

| Area              | Shortcut                    | Action                                                     |
| ----------------- | --------------------------- | ---------------------------------------------------------- |
| Global            | `Ctrl/Cmd+K`                | Open command palette                                       |
| Global            | `Ctrl/Cmd+F`                | Open global search (desktop); on Settings, search settings |
| Global            | `Ctrl/Cmd+R`                | Open recently viewed in the desktop app                    |
| Global            | `Enter` in workspace search | Submit the search; on Settings, open the best match        |
| Global            | `F11`                       | Toggle app window fullscreen in the desktop app            |
| Navigation        | `Alt+←` / `Cmd+[` (macOS)   | Go back, like the top bar's Back and the mouse Back button |
| Navigation        | `Ctrl/Cmd+B`                | Toggle the live sidebar                                    |
| Navigation        | `0-9`                       | Select an M3U channel by number                            |
| Playback          | `Space` / `K`               | Play or pause playback                                     |
| Playback          | `F`                         | Toggle player fullscreen                                   |
| Playback          | `ArrowLeft` / `ArrowRight`  | Seek VOD playback by 5 seconds                             |
| Playback          | `ArrowUp` / `ArrowDown`     | Adjust volume by 5%                                        |
| Playback          | `M`                         | Mute audio                                                 |
| Dialogs and lists | `ArrowUp` / `ArrowDown`     | Move command palette selection                             |
| Dialogs and lists | `Enter`                     | Run the selected command or open a focused item            |
| Dialogs and lists | `Escape`                    | Close dialogs and dismiss overlays                         |

The desktop app can also open at its last size, maximized, or fullscreen on
every launch (Settings → General → "Window on startup"), and `iptvnator
--fullscreen` forces a single fullscreen launch for TV or HTPC autostart
scripts without changing that setting.

## Screenshots:

|                                     Dashboard with recently watched content                                     |                               Live channels with inline player and EPG                                |
| :-------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------: |
|    ![Dashboard with recently watched content](./apps/website/public/screenshots/dashboard-with-content.webp)    | ![Live channels with inline player and EPG](./apps/website/public/screenshots/screenshot-player.webp) |
|                                Add playlist dialog for M3U, Xtream, and Stalker                                 |                                      Live category channel list                                       |
|    ![Add playlist dialog for M3U, Xtream, and Stalker](./apps/website/public/screenshots/add-playlist.webp)     |          ![Live category channel list](./apps/website/public/screenshots/channels-view.webp)          |
|                                Global search across live TV, movies, and series                                 |                                    Manage visible live categories                                     |
|    ![Global search across live TV, movies, and series](./apps/website/public/screenshots/global-search.webp)    |      ![Manage visible live categories](./apps/website/public/screenshots/manage-categories.webp)      |
|                                 Movie category grid with sorting and pagination                                 |                                   Recently added movies and series                                    |
| ![Movie category grid with sorting and pagination](./apps/website/public/screenshots/xtream-category-view.webp) |   ![Recently added movies and series](./apps/website/public/screenshots/xtream-recently-added.webp)   |
|                                 VOD details with playback and download actions                                  |                                           Download manager                                            |
|      ![VOD details with playback and download actions](./apps/website/public/screenshots/vod-details.webp)      |             ![Download manager](./apps/website/public/screenshots/download-manager.webp)              |
|                                             Multi-channel EPG grid                                              |                                      External MPV player support                                      |
|                ![Multi-channel EPG grid](./apps/website/public/screenshots/multi-epg-view.webp)                 |  ![External MPV player support](./apps/website/public/screenshots/external-player-support-mpv.webp)   |
|                                   Radio playback with dedicated audio player                                    |                                              Light theme                                              |
|       ![Radio playback with dedicated audio player](./apps/website/public/screenshots/radio-feature.webp)       |                  ![Light theme](./apps/website/public/screenshots/light-theme.webp)                   |
|                                              Application settings                                               |                                                                                                       |
|                    ![Application settings](./apps/website/public/screenshots/settings.webp)                     |                                                                                                       |

_Note: First version of the application which was developed as a PWA is available in an extra git branch._

## Self-hosted PWA

The Docker setup builds the Angular PWA and the monorepo web backend into one
image. The backend handles remote M3U parsing plus Xtream and Stalker proxy
requests under `/api`, so a separate `4gray/iptvnator-backend` container is not
required for the default self-hosted flow.

```bash
docker compose -f docker/docker-compose.yml up --build -d
```

The application is available at <http://localhost:4333>. See
[`docker/docker-compose.yml`](./docker/docker-compose.yml) for the ready-to-run
compose file and [`docker/README.md`](./docker/README.md) for environment
variables, reverse proxy notes, PWA limitations, and build details.

The image keeps playlists, favorites and watch progress on the server, so
every browser that opens it shares one library. The first browser that opens
an updated instance offers to move the playlists it already has.

The self-hosted image runs the browser PWA rather than the Electron desktop app:
EPG/XMLTV panels, Embedded MPV, managed MPV/VLC launching, the download manager,
and Electron remote-control features are not available there. If browser
playback fails, copy the stream URL and open it manually in an external player
such as MPV, VLC, or IINA.

## Download

Download the latest version of the application for macOS, Windows, and Linux from the [release page](https://github.com/4gray/iptvnator/releases).

Alternatively, you can install the application using one of the following package managers:

### Nightly builds

Every merge into `master` is published as a prerelease in
[4gray/iptvnator-nightly](https://github.com/4gray/iptvnator-nightly). The
desktop app can follow them: **Settings → About → Update channel → Nightly**
offers each new build through the built-in updater (macOS, Windows, and the
Linux AppImage). Nightly builds are untested snapshots — they may break, and
their database changes are permanent, so switching back to **Stable** keeps
the installed nightly until the next stable release is newer. Back up your
playlists first, and mention the version and commit shown in *About* when
reporting a bug from a nightly.

### Homebrew

```shell
$ brew install iptvnator
```

### Snap

```shell
$ sudo snap install iptvnator
```

### Arch

Also available as an Arch PKG, [iptvnator-bin](https://aur.archlinux.org/packages/iptvnator-bin/), in the AUR (using your favourite AUR-helper, .e.g. `yay`)

```shell
$ yay -S iptvnator-bin
```

### Gentoo

You can install IPTVnator from the [gentoo-zh overlay](https://github.com/microcai/gentoo-zh)

```shell
sudo eselect repository enable gentoo-zh
sudo emerge --sync gentoo-zh
sudo emerge iptvnator-bin
```

### Linux Embedded MPV Support

Embedded MPV on Linux is experimental and currently supports x64 desktop
sessions where IPTVnator runs under X11 or Xwayland. Native Wayland embedding
is not supported yet. Linux package launchers request X11 with
`--ozone-platform=x11`, so Wayland desktops still need Xwayland available.

The Linux backend starts a system `mpv` executable with `--wid`, so `mpv` must
be installed and available on `PATH`. CI validates the Linux native addon and
standard packages on Ubuntu 22.04, with Flatpak packaging built on Ubuntu 24.04.
Expected user targets are Ubuntu/Debian `.deb`, Arch/Manjaro `pacman`, RPM
distributions, and AppImage on x64 systems with X11/Xwayland plus `mpv`
installed. Flatpak and Snap builds remain available, but embedded MPV is not
announced as supported there yet because those sandboxed formats do not expose
the host `mpv` executable to the embedded backend by default.

[![Get it from the Snap Store](https://snapcraft.io/static/images/badges/en/snap-store-black.svg)](https://snapcraft.io/iptvnator)

<a href="https://github.com/sponsors/4gray" target="_blank"><img src="https://img.shields.io/badge/GitHub%20Sponsors-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor on GitHub"></a>
<a href="https://ko-fi.com/4gray" target="_blank"><img src="https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support on Ko-fi"></a>

## Troubleshooting

### macOS: "App is damaged and can't be opened"

Older unsigned macOS builds may require removing the quarantine flag from the downloaded application:

```bash
xattr -c /Applications/IPTVnator.app
```

Alternatively, if the app is located in a different directory:

```bash
xattr -c ~/Downloads/IPTVnator.app
```

### Linux: chrome-sandbox Issues

If you encounter the following error when launching IPTVnator:

```
The SUID sandbox helper binary was found, but is not configured correctly.
Rather than run without sandboxing I'm aborting now.
You need to make sure that chrome-sandbox is owned by root and has mode 4755.
```

**Solution 1: Fix chrome-sandbox permissions (Recommended for .deb/.rpm installations)**

Navigate to the IPTVnator installation directory and run:

```bash
sudo chown root:root chrome-sandbox
sudo chmod 4755 chrome-sandbox
```

**Solution 2: Launch with --no-sandbox flag**

Edit the desktop launcher file to add the `--no-sandbox` flag:

1. Find your desktop file location:
    - **Ubuntu/Debian**: `~/.local/share/applications/iptvnator.desktop`
    - **System-wide**: `/usr/share/applications/iptvnator.desktop`

2. Edit the file and modify the `Exec` line:

    ```
    Exec=iptvnator --no-sandbox %U
    ```

3. Save the file and relaunch the application from your application menu.

Alternatively, you can launch IPTVnator from the terminal with the flag:

```bash
iptvnator --no-sandbox
```

### GNU/Linux: Wayland startup failure

If IPTVnator exits on GNU/Linux with errors about failing to connect to
Wayland or initialize the Ozone platform, force X11/XWayland instead:

```bash
iptvnator --ozone-platform=x11
```

This workaround is mainly for older or problematic Linux graphics stacks. The
Snap package already includes this X11 override by default. For AppImage,
direct binaries, and other Linux package formats, pass the flag manually when
needed.

## How to Build and Develop

Requirements:

- Node.js 22.22.3 or newer within 22.x, or 24.15.0 or newer within 24.x
- pnpm 10.33.0 (via Corepack)

The repository's `.nvmrc` pins the Node.js version used by CI. With nvm,
run `nvm install` and `nvm use` from the repository root to use the same version
for local development.

1. Clone this repository and install project dependencies:

    ```
    $ nvm install
    $ nvm use
    $ corepack enable
    $ pnpm install
    ```

2. Start the application:
    ```
    $ pnpm run serve:backend
    ```

This will open the Electron app in a separate window, while the Angular dev server will run at http://localhost:4200.

The equivalent Nx command is:

```
$ nx serve electron-backend
```

To start Electron with an empty, isolated data directory instead of your normal
`~/.iptvnator` folder, set `IPTVNATOR_E2E_DATA_DIR` for that run:

```
$ rm -rf .tmp/iptvnator-empty && mkdir -p .tmp/iptvnator-empty
$ IPTVNATOR_E2E_DATA_DIR="$PWD/.tmp/iptvnator-empty" pnpm run serve:backend
```

This redirects the SQLite database, Electron user data, and local config under
the given directory. Delete that directory whenever you want a fresh empty
state.

If you need startup diagnostics for a white screen or a frozen route, you can
also turn on opt-in Electron tracing. These logs are written to the Electron
terminal output so they still help when the renderer DevTools never open:

```
$ IPTVNATOR_TRACE_STARTUP=1 pnpm run serve:backend
```

Nx equivalent:

```
$ IPTVNATOR_TRACE_STARTUP=1 nx serve electron-backend
```

Useful narrower flags:

- `IPTVNATOR_TRACE_IPC=1` logs renderer `window.electron.*` calls reaching the
  Electron bridge
- `IPTVNATOR_TRACE_DB=1` logs DB worker requests and request-scoped DB events
- `IPTVNATOR_TRACE_SQL=1` logs SQLite statements in both the main connection and
  DB worker connection
- `IPTVNATOR_TRACE_WINDOW=1` logs BrowserWindow load, navigation, and
  unresponsive events
- `IPTVNATOR_TRACE_RENDERER_CONSOLE=1` mirrors renderer console messages into
  the Electron terminal output

Security-sensitive network compatibility flags are opt-in:

- `IPTVNATOR_ALLOW_PRIVATE_NETWORK_URLS=1` permits strict EPG fetches from
  playlist metadata (`x-tvg-url`, `url-tvg`, or `tvg-url`) to resolve to
  localhost, LAN, or other private addresses. Directly configured
  Xtream/Stalker portals and private playlist servers remain supported without
  this flag. Prefer the in-app source-scoped “Allow source” action for a trusted
  EPG URL.
- `IPTVNATOR_ALLOW_INSECURE_TLS=1` disables certificate validation for remote
  playlist imports and refreshes for the whole Electron process. Prefer the
  in-app host-scoped trust action for a trusted provider with a self-signed or
  otherwise invalid certificate.

If the local Nx daemon gets into a bad state before rerunning Electron, reset it:

```
$ pnpm nx reset
```

To run only the Angular app without Electron, use:

```
$ pnpm run serve:frontend
```

To see how many bytes the built web app puts on the initial load path (the
number the CI ratchet guards), build it and run the measurement:

```
$ pnpm nx build web
$ pnpm run perf:initial-bytes
```

The contract behind that number is in
[docs/architecture/performance-journeys.md](docs/architecture/performance-journeys.md).

To benchmark the "launch to usable", "open a source" and "start playback"
journeys (fresh Electron processes on a seeded profile against the local
Xtream mock, exact renderer counters plus wall-clock), run:

```
$ pnpm run perf:journeys
```

The journeys, their counters and the summary written under
`dist/performance/journeys/` are described in
[docs/architecture/performance-journeys.md](docs/architecture/performance-journeys.md).
`pnpm run perf:compositing` measures the renderer's tile memory and composited
layers on the dashboard, the detail pages, Live TV and settings (the
"compositing budget" section of the same document).

## Disclaimer

**IPTVnator doesn't provide any playlists or other digital content.**

## Trademark

The name **"IPTVnator"** and the IPTVnator logo are unregistered trademarks of the project owner. The MIT license covers the source code only — it does **not** grant rights to the name or logo. Forks and redistributions (including app-store submissions) must use a different name and their own icon. See [TRADEMARK.md](./TRADEMARK.md) for details.

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-13-orange.svg?style=flat-square)](#contributors)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

## Developer and agent documentation

Start with the [task context map](docs/maintenance/agent-context-map.md) to find
the authoritative contract and validation for your area. Common agent rules are
in [AGENTS.md](AGENTS.md); Claude Code reads that same file directly (see
[Claude Code setup](docs/development/agent-workflow.md#claude-code)). Development and
documentation-maintenance conventions live in the
[agent workflow](docs/development/agent-workflow.md).

## Catalog.2 experimental preview

Work in the [experimental development branch](https://github.com/mkaand/iptvnator/tree/feat/m3u-classification-playback-resilience), not the stable master release.

- **Change Content Type** in the M3U channel context menu: Live TV / Movies / Series / Unclassified and **Reset to Automatic**. Movie poster cards also have a category selector.
- Overrides are per-playlist metadata, surviving automatic M3U refreshes. Items use original stream URL plus name rather than generated channel IDs. The source M3U remains unchanged.
- A limited HTTP HEAD check for ambiguous/PHP Video.js streams can detect HLS or MPEG-TS MIME types. Explicit TS/HLS files are unchanged. Unknown/failed checks keep original behavior.
- No authorization credentials, response bodies, URLs, or private test fixtures are logged by this check. CORS, provider authentication, unsupported codecs, and invalid MSE streams are not bypassed.
- Preview must pass CI and real Windows acceptance before merging or publishing a stable release.

## Catalog.3 integrated Windows package

Catalog.3 consolidates the M3U improvements on the feature branch pending
Windows acceptance: persistent playlist-local manual content classifications,
Ctrl-click selection and batch classification, clickable global search, corrected
Movies/Unclassified rail tooltips, a usable EPG grid icon before selecting a
channel, and Series TMDB posters/details (opt-in and page-bounded).

**Favorites EPG:** The root Favorites view now resolves XMLTV only for live
channels plus explicitly bookmarked non-live entries, rather than submitting
the entire mixed M3U movie/episode inventory to current-programme matching.
EPG channel keys and stored manual matching priorities are unchanged.

**HTTP playback/PiP:** Script and extensionless URLs can use Video.js's
MIME-aware HLS/TS handling. When HTML5 is selected for one of these ambiguous
sources, the compatible Video.js engine is used for that source, retaining the
HTML video Picture-in-Picture path. Embedded MPV still does not offer native
PiP. This is not a guarantee that providers returning HTTP 403, inaccessible
CORS responses or incompatible codecs will work in a browser engine.

All generated test URLs are synthetic. No private provider endpoints or secrets
are checked into this repository. The setup EXE is an unsigned Windows x64
artifact and remains subject to real-playlist acceptance before it replaces
the existing stable fork.
