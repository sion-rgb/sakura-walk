# Sakura Walk 1.1.0 — verification

28 September 2026. Screenshots in this repository are actual game captures.

## Checked result

- Production TypeScript check and Vite build: passed.
- Real-input Chromium checks: **27/27 passed**, zero console/page errors and zero failed requests.
- Eight declared canvas captures: desktop walking, character view, vista, pause, first person, first-person companion view; mobile walking and first-person companion view. All acknowledged their states and rendered nonblank canvases without errors.
- Normal production launch: start, pause/resume, first/third-person switch and look-at control passed; test hooks absent without `?qa=1`; no external runtime resource requests on the local production server.
- Mouse, keyboard, touch joystick, portrait/landscape layout, safe orbit/zoom, greeting, auto-stroll, photo download and restoration of the previous perspective were exercised.

## Synchronized companionship

The controller shares the player's velocity, then corrects the companion's side position. It no longer relies exclusively on chasing a point behind the player. In the first-person walking sample both speeds measured approximately **1.12 m/s**, with **1.18 m separation**. Both stopped at zero speed after settling. Turning and path-edge switching allow a brief catch-up period.

V switches perspective. Q looks at Haruka without changing the stored movement heading; dragging releases this focus. First-person camera height is about1.63m, and the player's own model is hidden to prevent head clipping. Third person and photo mode restore both visible characters.

## Character and environment changes

The two primitive avatars were replaced with skinned VRoid A/C models, with expression morphs, eye motion, finger geometry and hair springs. Female additions include plaid pleats, burgundy ribbon treatment and a blossom clip. The male retains a dark casual jacket and trousers. The characters are fictional adults in this story.

Imported shoe vertices were measured after posing to correct a 5.8cm floating offset on the female model. Rest soles are about3mm above ground. Ten sampled gait poses showed approximately -9mm to+12mm variation; this is a simple articulated gait, not full terrain IK or cloth simulation.

The garden now has curved boughs, finer aged ashlar, layered flower and fern beds, mossy stones, more varied woodland edges and a small animated rill. It includes65 sakura trees,1,107 perennial clusters,155 fern clusters and349 garden stones. Repeated geometry is instanced or merged by material.

## Performance and limits

Measured on Windows11 / NVIDIA RTX2070 SUPER / Chromium, at1440×900:

| Metric | Earlier build | Version1.1.0 |
|---|---:|---:|
| Active third-person draw calls |236|148|
| Active rendered triangles, including passes |661,100|624,134|
| First-person companion-view draw calls |—|108|
| First-person rendered triangles |—|569,720|
| Loaded textures |32–34|103|
| Real-input frame timer samples |74–75FPS|74–75FPS|

The higher texture count exceeds the skill's starting60-texture desktop budget. This revision favors imported character surface detail; draw calls and total rendered triangles decreased. Mobile emulation gave about34FPS in short high-quality capture samples on the same desktop GPU. **Physical phone performance is unverified**, and mobile geometry/texture starting budgets are exceeded. Balanced rendering lowers resolution, shadow resolution and post-processing cost.

The models require about28.2MB on first download. They are hosted with the game; no generation-service keys or third-party API calls are required to play. Audio is original Web Audio synthesis. AudioContext behavior was tested, but no claim is made about a physical-device listening test.

## Visual review

The earlier calibrated score was2.20/3. The revised captured set was reviewed using the installed graphics skill's ten-category rubric:

| Category | Before | Revised |
|---|---:|---:|
| Art direction |2.5|2.5|
| Hero / both companions |1.5|2.5|
| Path constraints |2.0|2.0|
| Social/photo interactions |2.0|2.5|
| World composition |2.5|2.5|
| Materials |2.0|2.3|
| Lighting |2.5|2.5|
| Motion and effects |2.0|2.3|
| UI |2.5|2.5|
| Performance evidence |2.5|2.3|

Average2.39/3. This is an internal assessment of these captures, not a claim of AAA production quality. The main improvement is actual skinned character geometry and facial response; materials are substantially richer but cost more textures. Desktop active pixels measured6.05bits entropy,0.530 edge density and175.9 luminance contrast. First-person companion view measured6.38bits,0.551 and186.0. These metrics establish image coverage/contrast, not character fidelity.

**Remaining artistic difference:** Haruka has a short bob and cardigan, rather than the reference illustration's exact long hair and blazer. This is an adaptation of licensed sample models, not a bespoke recreation. The scene remains stylized and the gait is procedurally authored.

## Reproduce

Run `npm ci`, install Chromium with `npx playwright install chromium`, then `npm run build` and `npm run preview`. In another terminal run `npm run verify:visual`. Set `QA_URL` to test another server and `QA_OUT` to select an evidence folder. QA hooks only exist when the page is opened with `?qa=1`.

The Windows download includes prebuilt dist and a launcher; npm installation is not required to play. VRoid model terms are separate from the MIT application license; see [model credits](../licenses/VRoid-models.md).
