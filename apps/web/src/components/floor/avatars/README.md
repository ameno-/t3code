# Floor avatars

The Floor draws one r6 shader plane per worker on a three.js canvas. The r3 GLBs are the
compile/link fallback; the flat SVG workers remain for browsers without WebGL2.

## Where the files come from

The source of truth is `ameno-/media-pieces`, under `pieces/floor-avatars/`:

```text
pieces/floor-avatars/
  r6/avatar-shader.js
  r6/rig.js
  source/manifest.json
  source/nasir.glb
  source/baashe.glb
  source/faris.glb
  source/qasim.glb
```

Copy the two r6 modules into `apps/web/src/components/floor/avatars/r6/` and the manifest
into `apps/web/public/floor/avatars/`, from a pinned media-pieces commit. Check the GLBs
against the manifest before committing:

```bash
cd apps/web/public/floor/avatars
jq -r '.avatars[] | "\(.sha256)  \(.file)"' manifest.json | sha256sum -c -
```

The shader is built from `r6/face.glsl`, `r6/parts.glsl` and `r6/module.tmpl.js` with
`python3 assemble.py`; the generated `avatar-shader.js` is what the app imports. The r6
module is vendored with its MIT notice.

## Renderer contract

- `avatar-shader.js` exports `KINDS`, `FRAGMENT`, `VERTEX_THREE`, `layout(h, dpr)` and
  `uniformValues(...)`. `rig.js` exports `rigAt(state, t)`; every channel is a function of
  time alone. The states include `idle`, `working`, `talking`, `listening`, `blink` and
  `cycle`.
- The Floor maps `busy ? "working" : "idle"`, offsets each worker with
  `rigAt(state, t + phase)`, and uses the worker's Floor colour as `uAccent`.
- The plane is `layout(h, dpr).width x height` CSS px. `layout` also supplies `uRes`, `uR`,
  `uCtr` and `uSmall`; the feet sit 0.03h above the plane's bottom edge. The Floor's
  baseline is 148 px from the top.
- Use `RawShaderMaterial` with `glslVersion: GLSL3`, `VERTEX_THREE`, `FRAGMENT`,
  `transparent`, `premultipliedAlpha`, `toneMapped: false` and `depthWrite: false`. The
  shader applies its own tone curve and gamma.
- Recompute `layout` when the DPR changes, resize the plane and copy `uRes`, `uR`, `uCtr`
  and `uSmall` again.
- Under `prefers-reduced-motion`, draw one frame at `rigAt("idle", 1)`.
- If the shader fails to compile or link, `floorAvatars.scene.ts` loads the r3 GLBs. If
  WebGL2 is missing, `FloorAvatars` keeps the SVG workers and does not try the GLBs.

## Manifest

`source/manifest.json` uses `floor-avatars/2`. Each avatar has a `default_skin` naming one
of its `skins`; each skin has `skin_base`, `skin_belly` and `skin_mark` colours. The Floor
parses the default and all three slots. The skin picker is a separate feature.

## r3 GLB fallback contract

- glTF 2.0 binary, everything embedded. No Draco, meshopt or KTX2, no textures, no lights,
  no cameras and no animation clips. Plain `GLTFLoader` from three 0.180.
- Y up, metres, feet on `y = 0`, centred at the origin, facing `+Z`, 1.1 to 1.3 m tall.
  The Floor scales every avatar to 104 px.
- At most 200 KB and 10k triangles each.
- Root node `avatar_<id>`. Part nodes `head`, `body`, `arm_l`, `arm_r`, `leg_l`, `leg_r`.
- sand3d nests a joint node above each jointed part, for example
  `body → arm_l_swing → arm_l`. The joint node's origin is the shoulder; the part node holds
  the mesh. The Floor rotates the joint node, never the part node.
- `body` contains `head_turn`, `arm_l_swing` and `arm_r_swing`; `leg_l_swing` and
  `leg_r_swing` sit under `avatar_<id>` so the feet stay planted. A `tail` node sits under
  an optional `tail_wag` joint under `body`; the Floor ignores `tail_wag`.
- Each joint node carries sand3d's `extras.s3d_joint`: `{ name, type, axis, lower, upper }`,
  with `axis` in the node's local glTF frame and `lower`/`upper` in radians. That is
  authoritative; the Floor clamps every pose to it.
- One material named `accent` carries the worker colour; `skin_base`, `skin_belly` and
  `skin_mark` are the authored skin slots.

## Vendored version

- r6 shader: `ameno-/media-pieces` 83bf861, with the frame-time record at 25c840e. The
  current modules and manifest are from 25c840e.
- r3 GLBs: `ameno-/media-pieces` 5a9d6df, `pieces/floor-avatars/source/` (GLBs 6995c99;
  manifest `source_commit` 6995c99). 744,776 bytes and 34,135 triangles total.

The r3 fallback measures each model with `Box3.setFromObject(model, true)`; precise mode
walks the vertices and matches the manifest's `height_m` exactly: nasir 1.1316, baashe
1.2395, faris 1.1478, qasim 1.2146 m.
