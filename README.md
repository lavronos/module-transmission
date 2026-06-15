# LavronOS Transmission Module

Independent LavronOS module package for Transmission RPC data, actions and
dashboard runtime.

The module owns its page, dashboard widget, settings UI and server runtime.
Its runtime page restores the complete LavronOS v0.11 Transmission interface
with real torrents, transfer speeds, filtering, search, pagination, add,
start, pause and remove controls. Torrents can be added from a `.torrent`
file, URL or magnet link, and one or more selected torrents can be removed
while either keeping or deleting their downloaded files. Missing configuration and connection
failures use one clear state with a direct link to the module settings. The
page and dashboard widget are rendered entirely by this package. The compact
dashboard widget prioritizes active torrents and fills the remaining five
positions with the latest available torrents.
LavronOS stores user-entered settings in its encrypted SQLite settings table
so module updates do not overwrite them.

The release workflow validates `module.json`, creates a versioned ZIP and
publishes it from tags matching the module version. The LavronOS WordPress
Marketplace periodically synchronizes published GitHub Releases from this
repository.

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```bash
git tag -a v0.4.5 -m "Release Transmission module 0.4.5"
git push origin main
git push origin v0.4.5
```

No WordPress credentials are required in this repository.
