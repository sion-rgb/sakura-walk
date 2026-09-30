# User-supplied VRM models

Sakura Walk 1.3 uses two VRM 1.0 model files supplied by the user for inclusion in the game and publication. The source files were copied byte-for-byte into `public/models/`; their original embedded metadata, geometry and textures are retained. Runtime posing, expressions, uniform scaling and rendering do not rewrite the files.

These assets are **not covered by the application's MIT code license and are not CC0**. They carry the [VRM Public License 1.0](https://vrm.dev/licenses/1.0/) and the permissions and restrictions embedded in each file. Consult the full license and model metadata when reusing them. This record reports that metadata; it does not grant additional rights.

## Provenance and integrity

| Game role | Source filename supplied by the user | Distributed file | Embedded name | Embedded author | Bytes |
|---|---|---|---|---|---:|
| Companion | `BBs_.vrm` | `public/models/bbs-companion.vrm` | `BBs` followed by a tab character | `sion` | 16,499,944 |
| Walker | `sssi.vrm` | `public/models/sssi-walker.vrm` | `sssi` | `sssi` | 16,350,868 |

SHA-256:

```text
b8971c4ca443882c2437251122251c9bc9fcc9efb1ce95b354ef27b18299d5b7  bbs-companion.vrm
7a17e310466e05b4d0101b88e9e9db8efb7811a378f4e1431f835aaeb3e5adc4  sssi-walker.vrm
```

## Embedded permissions and restrictions

Both files have the following values. They are recorded verbatim to preserve the scope of the source metadata:

| Metadata field | Value |
|---|---|
| `licenseUrl` | `https://vrm.dev/licenses/1.0/` |
| `avatarPermission` | `everyone` |
| `allowExcessivelyViolentUsage` | `false` |
| `allowExcessivelySexualUsage` | `false` |
| `commercialUsage` | `corporation` |
| `allowPoliticalOrReligiousUsage` | `false` |
| `allowAntisocialOrHateUsage` | `false` |
| `creditNotation` | `unnecessary` |
| `allowRedistribution` | `true` |
| `modification` | `allowModificationRedistribution` |

Redistribution and modification with redistribution are permitted by these embedded settings, subject to the complete license and the retained restrictions above. Neither the game code license nor distribution of this repository overrides those conditions. Author information is retained even though the embedded credit setting is `unnecessary`.

## Use in Sakura Walk

The game gives the companion the fictional adult identity Haruka (20) and the walker an age of 22. These are game character settings, not claims about the model creators or any real person. Runtime heights are 1.64 m and 1.77 m, using uniform scaling to preserve the supplied proportions.

The supplied models' clothing, hair, facial shapes and textures are used without the earlier custom costume, hair or iris overlays. Humanoid posing provides walking, idle gestures and greeting; expressions and spring bones use the supplied VRM systems. This is a wholesome companion-walking experience.

Legacy `haruka.vrm`, `walker.vrm` and sample-derived assets retained in the source remain governed separately by [VRoid-models.md](VRoid-models.md). They are not the active 1.3 companion or walker models.
