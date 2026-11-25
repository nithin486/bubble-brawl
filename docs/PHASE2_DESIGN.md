# Phase 2 design: Bubblegum Islands + six redesigned weapons

Stage A of the Phase 2 brief (audit, layout, weapon concepts). Written before the Blender work; numbers below are the ones the map and weapons were built to.

## What the audit found (existing project)

| Thing | Value (source) |
|---|---|
| Hero | radius 0.45 m, walk 6 m/s, dash 5 m in 0.25 s (3 s cooldown), **no jumping** (`shared/config/tuning.ts`) |
| Height | only by ramps/decks (`shared/sim/terrain.ts`), step limit 0.55 m, deck sides are cliffs |
| Ground | square tiles; tiles fall in the finale (`keepRadius`) |
| Camera | third person behind the hero (`client/src/camera.ts`), see-through dithering for props between camera and hero (`client/src/render/batch.ts`) |
| Netcode | host-authoritative sim (`shared/sim`), clients draw snapshots; every damage/status effect lives in `shared/sim/brawl.ts` |
| Render budget | ~250 draw calls, ~300k triangles per frame on phones (cloud-session measurements), each GLB <= 300 KB |
| Weapons | `Brawl` (fire, projectiles, mines, throws, hammer) tuned in `TUNING.weapons`, drawn by `weapons-view.ts` |

Consequences for the design: platform heights are 1.2 m (ramps at 0.2 slope, well under the 0.55 step limit), paths are >= 2.5 m wide between rails (heroes are 0.9 m), every gap between solid things is >= 1.4 m, the biggest void gap is 4 m (inside the 5 m dash: a dash can cross it, which is a deliberate risk/reward shortcut, never required).

## Bubblegum Islands (map id `bubblegum`)

Central landmark: **the Bubblegum Fountain** on a raised octagon plaza. Three tiers of striped bubblegum stem and cream basins with gold rims, ribbons of water, a crown of soap bubbles around a glowing core, lollipop posts and crystal clusters round the pool. The whole structure is open (one pool-sized collision circle) so it never blocks the view of a fight.

```
            N sat
   islet NW  |  islet NE          grid: 4 m tiles, 133 tiles, ~64 m across
        \    |    /               central island  r ~ 3.6 tiles, plaza 10 m (octagon, +1.2 m)
 W sat ---- ISLAND ---- E sat     4 satellite islands (axes), 3x3 tiles, low
        /    |    \               4 corner islets, 3x3 tiles, raised nest (+1.2 m) with 2 ramps
   islet SW  |  islet SE          bridges: 4 x 1 tile (island-satellite), 8 x 2 tiles (satellite-islet)
            S sat
```

* **Central combat zone**: plaza (+1.2 m) with four 3.2 m ramps. Whoever holds it is visible from every direction, so it is exposed too.
* **Side routes**: satellites reached over 4 m bridges (rails are real walls, 2.5 m of room), corner islets reached from the satellites over 8 m bridges: a ring route round the outside that never touches the plaza.
* **Raised platforms**: plaza + four islet nests (one ramp straight off the bridge, one from inside the islet).
* **Lower combat areas**: satellites and the island ring (gumball machines, candy mushrooms, crystal clusters, rock-candy boulders = cover).
* **Dangerous vs safe**: island edges have no rail (knock-backs and dashes can drop you); bridges have rails (you can't be pushed off, you can be hooked/shot in a corridor).
* **Collectibles / pickups**: coins everywhere, 14 mystery boxes spread by farthest-point sampling (verified reachable), 8 bank spots (4 satellites, 4 islets).
* **Finale**: tiles fall from the outside in (`keepRadius` 17): islets and satellites collapse first, the plaza island stays.
* **Backdrop**: 12 floating islets (flower forest, candy castle, crystal garden) with waterfalls into the clouds, soap bubbles rising round the fountain.
* **Anti-camping**: no dead ends with a single choke (every island has two ways in/out except the satellites, which are open fields), the plaza is the only high ground that sees everything.

## Weapon concepts (all one universe: pink / aqua / cream / gold, chunky, translucent glass + glowing cores)

| Weapon | Idea | Gameplay (unchanged intent) |
|---|---|---|
| Bubble Blaster | Pink gumball-machine pistol: glass dome full of glowing bubbles on top, gold-ringed bubble-wand nozzle with a soap film, pressure gauges on both sides, air tank under the barrel | rapid bubbles, 1 hit each, 0.22 s cooldown |
| Rocket Launcher | Orange aerodynamic launcher: window showing the loaded rocket, ratchet loading drums, hazard stripes, bell muzzle, rear exhaust + fins | slow rocket, area blast radius 1.3 m, 2 hits of damage, ring/dome shows the radius |
| Banana Trap | A glossy banana mounted on a pressure plate with a coil spring, clamp bands and an arming lamp (blinking red -> steady green) | dropped behind you, arms after 0.6 s, slip 1.3 s, 1.2 s stun immunity after |
| Freeze Bomb | Icy crystal bomb: glass shell around a glowing core, crystals bursting out, steel latch bands, pull-ring cap | thrown, 2.8 m freeze radius, 1.8 s freeze (ice block on each victim), 1.2 s immunity after |
| Grapple Hook | Red hand launcher with a big cable spool (glowing teal cable), three-barbed steel claw, tether guide, status lamps | 10 m range, needs line of sight, pulls the rival to 1.3 m, never through walls or off the island |
| Thunder Hammer | Chunky gold-capped hammer: navy head, glowing violet energy core band, lightning bolt emblems, crystal spike, wrapped handle, gem pommel | spin around you, 2.7 m radius, 2 hits of damage + knockback, radial lightning on impact |

Everything is modelled in Blender from scratch (`tools/blender/weapons/*.py`, `tools/blender/map/*.py`); none of the supplied reference images' models were used.
