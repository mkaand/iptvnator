---
type: fix
area: playback
---

Ambiguous PHP/script and extensionless live stream URLs now retry MIME detection with one bounded Range request when servers reject HEAD, so HLS endpoints select the correct player without breaking MPEG-TS playback.
