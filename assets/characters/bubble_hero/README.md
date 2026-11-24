# Bubble Ranger (hero #4)

Original character, modelled in Blender for Bubble Brawl (no third-party meshes or textures; skeleton + animation clips are KayKit Adventurers, CC0).

- `bubble_hero_wip.blend` – working scene (rigged, baked). Rebuild chain: `tools/blender/hero_head → hero_hair → hero_body → hero_rig → hero_opt → hero_bake.py` (run in Blender via BlenderMCP, set `NORENDER=True` to skip test renders).
- `export/bubble_hero_raw.glb` – Blender export (skinned mesh + glass + 31 clips).
- `textures/bubble_hero_albedo.png` – 2048 baked atlas (colour + AO + procedural detail).
- `renders/` – showcase: 01 front, 02 three-quarter, 03 side, 04 back, 05 face, 06 hair+goggles, 07 clothing, 08a boots, 08b gloves, 09 neutral pose, 10 action (run).
- `ingame/` – screenshots from the real game and the standalone preview.
- Game build: `node tools/pack-bubble-hero.mjs` → `client/public/assets/hero_ranger.glb` (~0.7 MB, ~29k tris, 2 materials, 1024 WebP atlas).
- Standalone viewer: dev server → `/preview-ranger.html`.
- In game: `shared/config/heroes.ts` → `ranger` (unlocks after 3 matches; ability is a placeholder copy of Rattle Burst).

Known issues / next polish: faint UV-seam marks on the forearms, 29k tris is above the 15k phone target (needs a LOD or lower-poly hair), no blaster prop yet, scarf/headband tails are rigid (no secondary motion), ability not designed.
