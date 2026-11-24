# Phase 2 asset manifest

All Phase 2 art is **original work modelled in Blender** for Bubble Brawl (no third-party meshes or textures, nothing paid). Licence: ours (CC0 / free to use). Source scripts are in `tools/blender/` (run through BlenderMCP), GLBs in `assets/models/`, optimised with `tools/opt-glb.mjs`.

| Asset | File | Source | Author | Licence |
|---|---|---|---|---|
| Bubble Blaster | weap_bubblegun.glb | `tools/blender/weapons/w_blaster.py` | Bubble Brawl | own work |
| Rocket Launcher | weap_rocketl.glb | `w_rocket.py` | Bubble Brawl | own work |
| Rocket missile (projectile) | weap_missile.glb | `w_missile.py` | Bubble Brawl | own work |
| Banana Trap | banana.glb | `w_rest.py` | Bubble Brawl | own work |
| Freeze Bomb | weap_icebomb.glb | `w_rest.py` | Bubble Brawl | own work |
| Grapple Hook | weap_hook.glb | `w_rest.py` | Bubble Brawl | own work |
| Thunder Hammer | weap_hammer.glb | `w_rest.py` | Bubble Brawl | own work |
| Island tiles (pink, mint, mint2, cream, sky, sky2, lilac, lilac2), rock-candy underside, bridge, block, ramps, plaza | bg_tile_*.glb, bg_under, bg_bridge, bg_block, bg_ramp, bg_ramp4, bg_plaza | `tools/blender/map/m_infra.py` | Bubble Brawl | own work |
| Bubblegum Fountain, gumball machine, candy mushrooms (3), crystals (3), boulder, bubble pillar, lollipop lamp, cotton-candy tree | bg_fountain, bg_gumball, bg_mush_*, bg_cry_*, bg_boulder, bg_pillar, bg_lamp, bg_cotton | `m_props.py` | Bubble Brawl | own work |
| Floating islets (flower forest, candy castle, crystal garden) | bg_islet_a/b/c.glb | `m_islets.py` | Bubble Brawl | own work |
| Hero (unchanged) | hero_ranger.glb | Phase 1; rig + clips KayKit Adventurers (CC0) | Bubble Brawl / Kay Lousberg | CC0 |
| Mystery box | mystery_cube.glb | existing, Sketchfab "Yellow Question Box" by becduino | becduino | CC Attribution (credited in `assets/models/CREDITS.md`) |

Replaced and no longer shipped: the Sketchfab weapon models (drollShark, MASH Virtual, luizmiguel3d, warcool, Jungle Jim) and the banana peel (nandoxun). Their credit lines were removed from `CREDITS.md`.

**Asset research.** Kenney / Quaternius / KayKit packs already used by the other maps (candy sweets, desert) were reviewed against the brief: none contains a floating bubblegum island kit or cartoon sci-fi weapons that match the hero's look, so everything here was built from scratch. The BlenderMCP Poly Pizza source was switched off on this PC, so Poly Pizza/Sketchfab were not searched this session (honest gap; nothing was imported from them).
