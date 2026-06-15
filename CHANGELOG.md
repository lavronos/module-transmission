# Changelog

All notable changes to the LavronOS Transmission module are documented here.

## [Unreleased]

## [0.4.5] - 2026-06-15

### Fixed
- Restored the complete v0.11 Transmission page inside the module package,
  including torrent filters, search, pagination and management actions.
- Restored torrent selection, bulk deletion and the confirmation choice between
  keeping downloaded files or deleting them with the torrent.
- Restored adding torrents from `.torrent` files, URLs and magnet links.
- Fixed module icons and add-torrent modals being misaligned inside the iframe host.
- Centered title, dashboard and metric icons on both axes and simplified the dashboard widget to show
  the five most relevant torrents without redundant transfer counters.

## [0.4.4] - 2026-06-14

### Changed
- Replaced raw API payloads with a torrent dashboard, transfer metrics and start/pause controls.
- Added a clear first-run setup screen linked to Transmission settings.

### Fixed
- Added separate connection hints for unreachable RPC endpoints and invalid credentials.

## [0.4.3] - 2026-06-13

### Added
- Added a module-owned settings page and server runtime entry.

### Changed
- Removed direct WordPress uploads from the release workflow; Marketplace now synchronizes published GitHub Releases.
- Included module settings and server runtime files in release ZIP packages.

## [0.4.2] - 2026-06-12

### Changed
- Moved the module manifest, runtime assets and release packaging into an independent repository.
- Added versioned ZIP and SHA-256 release assets for Marketplace publishing.

## [0.4.1] - 2026-05-30

### Fixed
- Improved Transmission RPC error handling.
