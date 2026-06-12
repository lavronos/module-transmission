# LavronOS Transmission Module

Independent LavronOS module package for Transmission RPC data, actions and
dashboard runtime.

The release workflow validates `module.json`, creates a versioned ZIP and
publishes it from tags matching the module version. When Marketplace secrets
are configured, the same verified ZIP is imported and approved on the
LavronOS WordPress Marketplace automatically.

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```bash
git tag -a v0.4.2 -m "Release Transmission module 0.4.2"
git push origin main
git push origin v0.4.2
```

Required repository secrets for automatic Marketplace publishing:

- `LAVRONOS_MARKETPLACE_URL`
- `LAVRONOS_MARKETPLACE_USER`
- `LAVRONOS_MARKETPLACE_APPLICATION_PASSWORD`
