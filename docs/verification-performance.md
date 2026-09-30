# Browser resolution upgrade verification

Verified locally on 1 October 2026. This implementation is not yet published; GitHub Pages remains at `a68a79f`.

## DLSS 5 compatibility

DLSS 5 exists, but NVIDIA's current integration is a native renderer integration through Streamline / DirectX / Vulkan. The official SDK does not provide a WebGL or WebGPU browser interface. Direct integration is therefore unavailable in this existing Three.js WebGL2 application. No DLSS library, neural rendering, frame generation or hardware ray tracing was added.

Sources checked: [NVIDIA Streamline SDK](https://github.com/NVIDIA-RTX/Streamline), [NVIDIA DLSS 5 launch](https://www.nvidia.com/en-us/geforce/news/dlss-5-3d-guided-neural-rendering/). A Context7 lookup did not identify the relevant NVIDIA SDK; the official sources were used instead.

## Implemented

- Independent Resolution setting: Auto, Native, Quality (85%) and Performance (67%). Existing quality presets, characters, controls and day/night remain intact.
- Async WebGL GPU queries enclose actual rendering, sample once every eight frames and read only available results. No synchronous GPU finish is required.
- Auto uses a 14.5 ms GPU-work target, median filtering, a settle period and hysteresis. Scale changes stay between55% and100%; changes stop while paused, composing a photograph, changing atmosphere or hidden. Invalid/disjoint timing clears stale pressure.
- The scene and post effects render into smaller integer-sized targets. Catmull-Rom reconstruction and limited sharpening output to the original display buffer, retaining the existing tone mapping and color conversion. HTML UI stays full resolution.
- If timer queries are unavailable, Auto uses a fixed proportion:100% desktop,85% coarse-pointer devices. Touch devices retain their Balanced preset. Native remains available.
- Balanced reconstruction uses only the scene/output passes; it does not silently enable AO, mist or bloom. Photograph files retain display dimensions, although reconstructed content contains less native detail.

No new third-party assets, npm dependencies or proprietary SDKs were added. The new interpolation/controller code is original application code under the existing MIT licence; the existing Three.js OutputPass remains under its MIT licence.

## Measured GPU work

Hardware Chromium / ANGLE / NVIDIA RTX2070 SUPER, Windows11. Same fixed daytime scene and camera,1920×1080 CSS viewport, device scale factor2. High caps DPR at1.5; Cinematic caps it at2. Each mode warmed up before200 continuous animation-frame intervals;23–24 usable GPU samples were collected. GPU queries enclose actual renderer work. Preliminary measurements enclosing frame boundaries were excluded because they included scheduling/idle time.

| Quality | Native display size | GPU median Native | GPU median67% | GPU time saved |
|---|---|---|---|---|
| Beautiful / High |2880×1620|18.58 ms|8.83 ms|52.5%|
| Cinematic |3840×2160|36.39 ms|17.76 ms|51.2%|

67% renders about45% of the original scene pixels. Geometry and draw-call budgets remain comparable (approximately153 reported calls and846k triangles in High); the improvement is in scene/depth/post pixel cost, not geometry reduction. The monitor's presentation interval can cap observed FPS: High's median animation-frame interval remained about13.4 ms, while Cinematic changed from39.9 to13.4 ms. GPU timing and presentation timing are separate measurements; these results are not a universal FPS guarantee.

Authoritative raw profile: `artifacts/resolution-verified-profile/profile.json`. Compact tracked record: [verification-performance.json](verification-performance.json). The profile preceded the final invalid-timing guard; the rendering and reconstruction code were unchanged. All final functional checks below used the final build.

## Final verification

- TypeScript and Vite production build passed: `index-B3HjfGis.js`,336.10 kB /96.77 kB gzip, plus the existing shared Three.js chunk.
-15/15 focused resolution checks: correct target sizes, reconstruction, real companion walking, full-size nonblank photograph, actual GPU-driven adaptation, pause stability, night/first-person/gaze,720p settings, missing-timer fallback, Native override and invalid-timing protection. `artifacts/resolution-release-qa/report.json`.
-28/28 existing real-input checks: walking, stopping, reversing, companion formation, orbit/zoom, greeting, photo download, pause/audio/reset, first/third person, gaze and touch/portrait/landscape controls. `artifacts/resolution-controls/behavior.json`; actual motion recording: `artifacts/resolution-controls/locomotion.webm`.
-7/7 quality/rendering checks, no GL errors or shader errors: `artifacts/resolution-quality/quality.json`.
- Normal production launch passed with QA hooks absent, both supplied VRMs loading locally with HTTP200, no legacy model requests, no external requests and no console errors. `artifacts/resolution-production/smoke.json`.
- Fresh seeded desktop/mobile day and night captures report nonblank canvas content. `artifacts/performance-canvas/desktop-day-active-play.json`, `artifacts/performance-canvas/desktop-night-first-person-together.json`, `artifacts/performance-canvas/mobile-day-active-play.json`, `artifacts/performance-canvas/mobile-night-first-person-together.json`.
- Inspected daylight Performance, night first person,720p settings and mobile fallback captures. Original staging, warm lanterns, character appearance and crisp UI remain visible; no new texture/shader failure or conspicuous reconstruction halo was found. Representative captures: `artifacts/resolution-release-qa/day-performance.png`, `artifacts/resolution-release-qa/night-first-person.png`, `artifacts/resolution-release-qa/settings-720.png`, `artifacts/resolution-release-qa/mobile-fallback.png`.

The final auto functional run reached55% under the additional load of parallel regression checks. That run establishes controller behavior and bounds, not an isolated hardware benchmark. Photo evidence: `artifacts/resolution-release-qa/performance-photograph.png`.

## Limits

Spatial reconstruction cannot restore all fine grass/hair detail and can soften edges at low proportions. This is not temporal antialiasing, AI inference or frame generation. Shadow-map and geometry costs do not scale with scene resolution. Heavy CPU/geometry bottlenecks are not solved by this controller. Timer availability depends on the browser/device; mobile emulation and fallback checks do not establish physical-phone FPS or thermals. Native mode restores the full preset resolution. No new public deployment was performed.
