# Changelog

## [0.8.0](https://github.com/arisros/fate-studio/compare/v0.7.0...v0.8.0) (2026-10-10)


### Added

* show the running studio and engine versions ([#27](https://github.com/arisros/fate-studio/issues/27)) ([fbff672](https://github.com/arisros/fate-studio/commit/fbff672b4eff1701d1095b7408510c9f97ef8a42))
* **ui:** label fallback branches and warn about transitions that never fire ([#29](https://github.com/arisros/fate-studio/issues/29)) ([c7ad577](https://github.com/arisros/fate-studio/commit/c7ad577241eb901073f865fee666d3b4d4972d43))
* **ui:** rebuild the inspector as a readout with icons, form controls and a step log ([#28](https://github.com/arisros/fate-studio/issues/28)) ([92c3b00](https://github.com/arisros/fate-studio/commit/92c3b005f66b0d7fa0e869ea2d76d19b865dc4d1))


### Fixed

* offer events and highlights for every parallel region ([#25](https://github.com/arisros/fate-studio/issues/25)) ([17cd940](https://github.com/arisros/fate-studio/commit/17cd940bd2cd7ab07cdd3e80e7ff7d334023c391))

## [0.7.0](https://github.com/arisros/fate-studio/compare/v0.6.2...v0.7.0) (2026-10-10)


### Added

* fit charts on load, add a first-visit guide and chart tooltips ([#23](https://github.com/arisros/fate-studio/issues/23)) ([d9f3cae](https://github.com/arisros/fate-studio/commit/d9f3cae630213eb9211b76fa69e65df478b77bff))

## [0.6.2](https://github.com/arisros/fate-studio/compare/v0.6.1...v0.6.2) (2026-10-09)


### Fixed

* ship the event naming fix from fate v0.11.0 ([#21](https://github.com/arisros/fate-studio/issues/21)) ([57fc1a0](https://github.com/arisros/fate-studio/commit/57fc1a0015f0db0968b824280bb0cf3ce0989011))

## [0.6.1](https://github.com/arisros/fate-studio/compare/v0.6.0...v0.6.1) (2026-10-06)


### Fixed

* ship the engine fixes up to fate v0.10.1 ([#19](https://github.com/arisros/fate-studio/issues/19)) ([6252be8](https://github.com/arisros/fate-studio/commit/6252be88d0ce7f016a8c5a90665dab6a96881393))

## [0.6.0](https://github.com/arisros/fate-studio/compare/v0.5.0...v0.6.0) (2026-10-04)


### Added

* restyle the studio as Fate Blueprint ([#14](https://github.com/arisros/fate-studio/issues/14)) ([6d98f75](https://github.com/arisros/fate-studio/commit/6d98f75123a6055f4b7bd5af6c4a7ef7e17918f4))


### Fixed

* lay out with layered ELK so edges have room to route ([#13](https://github.com/arisros/fate-studio/issues/13)) ([2fe7d1f](https://github.com/arisros/fate-studio/commit/2fe7d1f957d2e1266182048ccb4156dda1af3b31))

## [0.5.0](https://github.com/arisros/fate-studio/compare/v0.4.0...v0.5.0) (2026-10-03)


### Added

* **ui:** redraw the chart and brand around the new mark ([#10](https://github.com/arisros/fate-studio/issues/10)) ([21f3c4a](https://github.com/arisros/fate-studio/commit/21f3c4a04497a03f0e5cd6bead13c0092a72a0c6))

## [0.4.0](https://github.com/arisros/fate-studio/compare/v0.3.0...v0.4.0) (2026-09-18)


### Added

* move to the fate v0.5 API and demo gates and view models ([a19e206](https://github.com/arisros/fate-studio/commit/a19e206e49c9efa2b16df36d149bd6611893f8c9))
* render descriptor snapshots and proxy their simulator ([91c8af2](https://github.com/arisros/fate-studio/commit/91c8af2ce086ba0ebb42b4de36aaa9bbcdb70ded))
* render descriptor snapshots and proxy their simulator ([1276abe](https://github.com/arisros/fate-studio/commit/1276abe23f9da4e86b8756e47da1640fd85771ba))
* tabs header, remove index page — machines as header tabs with auto-redirect ([618cba0](https://github.com/arisros/fate-studio/commit/618cba0e1514498cc14a6e3e3c35d1f7ab1cc2cc))
* **ui:** badge global/hub transitions to declutter dense charts ([fcb44ee](https://github.com/arisros/fate-studio/commit/fcb44ee7bc6b9b2e4b3d876239230f1f3f25f7a4))
* **ui:** clickable machine cards (drop redundant view button) + mesh-wired canvas ([21e3ea8](https://github.com/arisros/fate-studio/commit/21e3ea8acd6af613ca88de5ec3d0d18968c6a438))
* **ui:** ELK orthogonal edge routing + re-tidy control ([6a93802](https://github.com/arisros/fate-studio/commit/6a93802d32f29e22c3cb6481e71c553e7c67e0a9))
* **ui:** revamp studio front-end as a React Flow (xyflow) SPA ([c58a2f7](https://github.com/arisros/fate-studio/commit/c58a2f777123474186ac4c7a6d325002d286b93f))


### Fixed

* keep snapshot sources and the proxy consistent ([3b0c64d](https://github.com/arisros/fate-studio/commit/3b0c64d3fb24e3d5a8e84411414a693046b6a30b))
* publish simulator frames under the lock that produced them ([42620ee](https://github.com/arisros/fate-studio/commit/42620eed36a6f5c37e24bf712ad5850265d7fc40))
* serve the studio under a mount prefix ([943b865](https://github.com/arisros/fate-studio/commit/943b865ac9521e90a4516081d47d43f9851572ee))
* surface ancestor-declared events in the simulator ([2af8eea](https://github.com/arisros/fate-studio/commit/2af8eea75218a79886d311a57f92137cad00534f))
* **ui:** edges follow nodes on drag ([ed44fcf](https://github.com/arisros/fate-studio/commit/ed44fcfb9c0a1bf52bbbb86a18d9f14d7a36bd16))
* **ui:** simulate through a proxy and load everything under a mount prefix ([4639a88](https://github.com/arisros/fate-studio/commit/4639a88749eb3010c8efd16fa2e89a20097444d6))
