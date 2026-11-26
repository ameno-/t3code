# Floor avatars

The Floor renders one GLB per worker on a three.js canvas. Until the Media desk's assets
land, `floorAvatars.scene.ts` builds a placeholder from the same node and joint names, so the
animation code does not change when the real files arrive.

## Where the files come from

The source of truth is `ameno-/media-pieces`, under `pieces/floor-avatars/source/`:

```text
pieces/floor-avatars/source/
  manifest.json
  nasir.glb
  baashe.glb
  faris.glb
  qasim.glb
```

Copy the manifest and the four GLBs into `apps/web/public/floor/avatars/`, from a pinned
media-pieces commit. Check every file against the manifest before committing:

```bash
cd apps/web/public/floor/avatars
jq -r '.avatars[] | "\(.sha256)  \(.file)"' manifest.json | sha256sum -c -
```

No code change is needed: the Floor fetches `manifest.json`, loads the files it names, and
keeps the placeholder for any worker whose file is missing or invalid.

## Asset contract

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
  `leg_r_swing` sit under `avatar_<id>` so the feet stay planted.
- Each joint node carries sand3d's `extras.s3d_joint`: `{ name, type, axis, lower, upper }`,
  with `axis` in the node's local glTF frame and `lower`/`upper` in radians. That is
  authoritative; the Floor clamps every pose to it.
- One material named `accent` carries the worker colour. The Floor retints it at runtime.
- `_l` is on `+X`. Face nodes `eye_l`, `eye_r`, `brow_l`, `brow_r`, `nose` and `mouth` hang
  under `head`; the renderer ignores them for now.

## Manifest

```json
{
  "schema": "floor-avatars/1",
  "source_commit": "<media-pieces commit>",
  "license": "Apache-2.0 (sand3d)",
  "avatars": [
    {
      "id": "nasir",
      "file": "nasir.glb",
      "sha256": "<64 hex>",
      "bytes": 12345,
      "triangles": 1234,
      "height_m": 1.2,
      "accent": "#45707e",
      "joints": []
    }
  ]
}
```

The renderer requires `id`, `file`, `sha256` and `bytes`; the other fields are kept for
provenance. Colours remain owned by `FloorPage.tsx`, not the manifest.

`floor-avatars/2` adds an optional `skins` block and three slot materials (`skin_base`,
`skin_belly`, `skin_mark`). The loader accepts both schemas and ignores skins for now; the
authored colours are the default skin, so a round-2 drop renders unchanged until the Floor
adds a picker.

## Vendored version

`ameno-/media-pieces` 398bc78, `pieces/floor-avatars/source/` (manifest
`source_commit` bd5f66e). Four GLBs, 531,696 bytes and 26,898 triangles total.
The manifest's `height_m` values run 1.1494 to 1.2886 m; the Floor scales each
model by its loaded height, which matches the manifest.
