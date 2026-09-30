# Walking animation repair — 2026-10-01

Local production: http://127.0.0.1:5192/ (refresh an already open tab). Production application chunk: `index-BGkLBOSR.js`. This repair has not been pushed or deployed to GitHub Pages.

## Changed behavior

- Replaced the abrupt linear swing with a continuous trajectory whose horizontal velocity joins the stance phase. The foot lift starts and ends gently.
- Cadence and step length follow actual traveled distance, including slow companion formation adjustments.
- Planted feet use world anchors and three-dimensional two-bone IK. Cached authored shoe envelopes compensate heel/toe height without re-skinning vertices each frame.
- Reduced the crouched pelvis pose; added subtle weight transfer, torso counter-rotation, elbow bend and delayed arm/wrist motion.
- Stopping finishes the lifted foot first, then makes a small second settling step. A brief stop resumes from toe-off instead of jumping to the end of a frozen stride.
- Turning smoothly adjusts the next landing direction. Resetting pivot state on heel strike fixes a measured foot rewind during turns.
- Corrected capture tools to actually translate characters while posing walking animation.

The supplied BBs and sssi VRM model binaries, geometry, textures, dimensions and clothing remain unchanged. Existing first/third person, companion gaze, formation, greeting, camera, photo, audio and day/night controls remain connected.

## Verification

| Check | Result | Local evidence |
| --- | --- | --- |
| Focused rig and curve checks | 41/41 passed; both models, steady / slow / start-stop / 90-degree turn / reversal / brief-stop restart | `artifacts/gait-motion/gait.json` |
| Rendered supporting shoe soles | 1.63–4.21 mm above the level path across measured scenarios and profile samples | Rig and profile reports |
| Planted midstance ankle drift | Maximum 0.065 mm/frame in the sampled turn/reversal cases; straight walking below 0.001 mm/frame | Focused rig report |
| Frame continuity | Maximum horizontal ankle travel below 7.4 cm per 60 Hz step, including reversals and restart | Focused rig report |
| Character profile review | Six views per model; 12 sole samples each; zero console errors | `artifacts/gait-final-companion/`, `artifacts/gait-final-player/` |
| Actual scene motion | 30 frames plus video: day walking, stop, reverse, night first-person walking and stop | `artifacts/gait-scene/review.json`, `artifacts/gait-scene/motion.webm` |
| Existing real-input checks | 28/28 passed: formation, direction changes, wave, orbit/zoom, pause/photo/audio, first-person gaze, portrait/landscape mobile controls | `artifacts/gait-production-final/behavior.json`, `artifacts/gait-production-final/locomotion.webm` |
| Current-build canvas captures | Four fresh nonblank captures: desktop/mobile day third-person and night first-person; no browser errors | `artifacts/gait-evidence.json` |
| Normal production launch | Both supplied VRMs load; debug hooks absent; no external requests, console errors or failed assets; perspective, pause and settings work | `artifacts/gait-production-smoke/smoke.json` |
| TypeScript + production build | Passed | `npm run build` |

Screenshots were inspected in sequence for stance, lifted feet, stop, reversal and first-person framing. Independent visual review found no supporting-foot float, crouched stance, inverted knees or crossed-step failure in the reviewed frames. The shoe measurements test the actual deformed rendered meshes; planted-foot drift measures ankle positions, not a guarantee that every rolling sole point is immobile.

The first development-server regression run was interrupted by a source reload during editing. Both subsequent production runs passed all 28 checks; the final run used the chunk identified above.

## Performance and limits

No animation files, new third-party assets, dynamic lights, draw calls or rendering systems were added for this repair. Sole hulls are built once on load; each update uses two short hull scans and two leg solves. Existing instancing, render presets and frame scheduling are retained.

This remains procedural humanoid animation, not motion capture or physical locomotion. Grounding assumes the existing level walking path. Clothing deformation and hair motion use the supplied skin and VRM spring bones; there is no new cloth solver. Mobile controls were verified in browser emulation; physical mobile hardware and a separate frame-time benchmark of this animation repair were not tested.
