---
type: perf
area: search
---

Global search now rejects non-matching large M3U playlists much faster while
preserving channel names, groups, ordering and pagination. A guarded fallback
keeps results complete even when playlist metadata creates many candidates.
