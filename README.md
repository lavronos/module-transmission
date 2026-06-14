# LavronOS Transmission Module

Independent LavronOS module package for Transmission RPC data, actions and
dashboard runtime.

The module owns its page, dashboard widget, settings UI and server runtime.
Its runtime page shows real torrents, transfer speeds, free space and
start/pause controls. Missing configuration and connection failures use one
clear state with a direct link to the module settings.
LavronOS stores user-entered settings in its encrypted SQLite settings table
so module updates do not overwrite them.

The release workflow validates `module.json`, creates a versioned ZIP and
publishes it from tags matching the module version. The LavronOS WordPress
Marketplace periodically synchronizes published GitHub Releases from this
repository.

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```bash
git tag -a v0.4.4 -m "Release Transmission module 0.4.4"
git push origin main
git push origin v0.4.4
```

No WordPress credentials are required in this repository.
