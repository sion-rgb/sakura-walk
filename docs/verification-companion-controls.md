# Companion controls and locomotion — local verification, 9 October 2026

## Changes
- C / gender button / pause selector chooses Walker or Haruka as the controlled character, preserving avatar identities and positions.
- The other character follows in a side formation using shared actual speed and bounded corrections. Both perspectives use the selected character; only that avatar is hidden in first person.
- Q / Look together now works in both perspectives. Both avatars turn their gaze toward one another; first person frames the partner. Drag releases the first-person gaze lock.
- Existing foot IK and authored appearance are preserved. Acceleration lean, pace-dependent arm swing, pelvis/chest counter-rotation, smoothed gaze, and alternating idle-turn placements refine motion.

## Evidence
- TypeScript and Vite production build pass.
- Existing gait QA: 41/41 checks pass for both VRMs across steady, slow, start-stop, turn, reverse and restart; tests cover grounded soles, planted-foot drift and ankle discontinuities.
- Integration browser QA passes male/female walking, stopping, turning, no teleport at switch, mutual gaze, both first-person visibility states, night, settings selection, photo mode and 390×844 touch layout/auto-stroll. No page/console errors.
- Unpaused motion capture and thirty timed screenshots inspect walking, stopping, reversal and moonlight first-person motion. Contact sheet inspected for support and pose continuity.
- Both VRM normalized head yaw directions separately verified against world forward vectors.
- Local evidence: artifacts/companion-controls/verification.json, screenshots, video/, and motion/motion.webm.

## Limits
Procedural IK locomotion rather than motion capture. Tight reversals still require brief formation recovery. Touch QA uses browser emulation; physical phones were not tested. This update has not been published to GitHub.
