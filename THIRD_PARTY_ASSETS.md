# Third-party assets

## Environment upgrade (2026-09-30)

These four environment assets are **CC0 1.0 Universal**. The shipped derivatives may be used, modified and redistributed, including in commercial projects. Attribution is optional under CC0; authors are credited here for provenance. Asset licences are independent from the application code licence.

[CC0 dedication](https://creativecommons.org/publicdomain/zero/1.0/) · [Poly Haven asset licence](https://polyhaven.com/license) · [ambientCG asset licence](https://docs.ambientcg.com/license/)

| Asset | Author(s) | Local files | Use / scale |
| --- | --- | --- | --- |
| [Grass 004](https://ambientcg.com/a/Grass004) | Lennart Demes / ambientCG | `public/textures/grass-{albedo,normal,roughness,ao}.jpg` | Dense meadow/lawn ground PBR; approximately 1.4 m tile |
| [Monastery Stone Floor](https://polyhaven.com/a/monastery_stone_floor) | Amal Kumar / Poly Haven | `public/textures/path-{albedo,normal,roughness,ao}.jpg` | Weathered irregular slate paving PBR; approximately 1.8 m tile |
| [Kloppenheim 03 (Pure Sky)](https://polyhaven.com/a/kloppenheim_03_puresky) | Greg Zaal (original), Jarod Guest (sky edits) / Poly Haven | `public/environments/spring-day.hdr` | Partly cloudy blue midday outdoor IBL |
| [Qwantani Moon Noon (Pure Sky)](https://polyhaven.com/a/qwantani_moon_noon_puresky) | Greg Zaal (photography), Jarod Guest (processing) / Poly Haven | `public/environments/moonlight.hdr` | Clear moonlit outdoor IBL |

### Browser preparation

- Albedo and OpenGL normal maps retain 1024 x 1024 resolution. JPEGs use no chroma subsampling; quality 90 for albedo, 92 for grass normal and 95 for path normal.
- AO and roughness maps use 512 x 512 grayscale JPEGs, Lanczos downsampling, quality 93. These lower-frequency scalar maps do not need the full albedo resolution.
- Both HDR files are unmodified 1K Radiance originals (1024 x 512).
- Albedo uses sRGB; normals, roughness and AO are linear data. Normals use the OpenGL (+Y) convention.
- These files are hosted in the project. The production scene needs no Poly Haven/ambientCG API requests.
- Combined local download size: **5864366 bytes (5.59 MiB)**.

### Acquisition and integrity

Poly Haven API requests used the identifying `SakuraWalk-AssetAcquisition/1.4` User-Agent. Downloaded originals were checked against the MD5 supplied by its file manifest before deriving browser images. ambientCG files came from its official 1K-JPG archive; the archive and extracted source files have SHA-256 provenance in `artifacts/asset-manifest.json`. [Poly Haven API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md) cover the live API separately from the downloaded CC0 assets.

| Shipped file | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/textures/grass-albedo.jpg` | 646133 | `dbfcea58fa6e423ef851fce690db9e310138351e6c400b715cba454da2064a48` |
| `public/textures/grass-normal.jpg` | 1103486 | `618baa5e4f1df90e36ffce4344b4e7c8e15a7f4f460f320f580fd6dddcc9c456` |
| `public/textures/grass-roughness.jpg` | 130138 | `c02ef27dd05dd4e1248082efac7b13e442a3787076e3227cf00d82a2f49c3050` |
| `public/textures/grass-ao.jpg` | 138855 | `19ea40088692a5d347853292934821985670632ffe2a5da64a73cc6bf00f5e74` |
| `public/textures/path-albedo.jpg` | 317951 | `f27f6212d24e9aeaffd0f4682cb2ca325ec6bca30788e20e7e1d530cdcc5bd60` |
| `public/textures/path-normal.jpg` | 740635 | `162cb09b90dff0a814f6d30b67fe697189459762f31b86b16287f1a7895654e5` |
| `public/textures/path-roughness.jpg` | 55380 | `016699d007ae555284c112436d9ede72994fc91dfbf4efc2256fb11f1698a05a` |
| `public/textures/path-ao.jpg` | 82715 | `4583f33d3abec1ae79798705d9e436423256aba5d042ded1da00fc0f5a408068` |
| `public/environments/spring-day.hdr` | 1428760 | `9806bc452fc8e1564418e7b45b50683732c0b37584423fa026ff0e2edf4eb1ce` |
| `public/environments/moonlight.hdr` | 1220313 | `0910eaf209c5988db4a5aa9cfae6bc972ea7e6e61b76d6a00f01cd9b93a8bb3b` |

### Other sources investigated

- **ambientCG:** selected Grass 004 after inspecting its greener, denser ground pattern against Poly Haven Leafy Grass. No preview renders or unused material pack files are shipped.
- **3DAssets.dev:** investigated its CC0 model catalogue and documented API. A direct public search request returned HTTP 403 in this environment, so no model from that source was imported. [Provider documentation](https://3dassets.dev/docs).
- **Sketchfab:** inspected [Sakura Cherry Blossom CC0 by ffish.asia / floraZia.com](https://sketchfab.com/3d-models/updated-sakura-cherry-blossom-cc0-e3317fd3fd514017abd3819f4fdf4bbd). Its 2.2 million triangles per model exceed the interactive avenue budget; no file was imported. Existing procedural shared tree/prop geometry keeps the scene lightweight and coherent.

## Existing assets

The supplied BBs and sssi character models retain their original VRM metadata and permissions; see [user model record](licenses/User-models.md). Historical VRoid models are covered in [VRoid record](licenses/VRoid-models.md). Their permissions are **not** replaced by the environment assets CC0 licence. Existing fonts and runtime dependency notices remain in `licenses/`.
