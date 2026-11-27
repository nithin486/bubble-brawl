# Project skills

Third-party Agent Skills, reviewed before adding (no scripts, no hidden text, no network or secret access).

| Skill | Source | License | Why |
|---|---|---|---|
| three-best-practices | github.com/emalorenzo/three-agent-skills (skills/three-best-practices) | MIT | Three.js performance rules: mobile, draw calls, pooling, dispose, shaders |
| threejs-* (12: fundamentals, geometry, materials, lighting, textures, loaders, animation, shaders, postprocessing, performance, interaction, asset-pipeline) | github.com/cloudai-x/threejs-skills | MIT | three.js how-to for every part of the renderer |
| game-developer | github.com/Jeffallan/claude-skills (skills/game-developer) | MIT | game patterns, performance, multiplayer/lag compensation references |

Left out on purpose: r3f-best-practices and threejs-react-three-fiber (we don't use React), shader-techniques (unknown/restricted licence), Blender/CAD/Unity-only skills.
Picked from https://snyk.io/articles/top-claude-skills-3d-modeling-game-dev-shader-programming/

MCP server: `.mcp.json` adds threejs-devtools-mcp 0.5.0 (github.com/DmitriyGolub/threejs-devtools-mcp, MIT), pinned. It inspects the live scene of `npm run dev` (port 5173) through a proxy at localhost:9222.

Blender skills (26 of 94, plus their shared `references/`) from github.com/arjun988/blender-skills (MIT): blender-director, blender-modeler,
cartoon/stylized/lowpoly/chibi/hand-painted styles, character/prop/environment artists, set-dressing, materials, texture/uv workflow,
retopology, rigging, animation, lod-pipeline, asset-optimization, export-pipeline, collision-proxy, lighting, vfx-fx, qa-review,
genre-shooter, genre-card-party-idle. The rest (horror, realism, Unity/Unreal/Godot export, genres we don't make) were left out.
They act in Blender through BlenderMCP (github.com/ahujasid/blender-mcp), which runs on your own computer: install Blender + uv,
add the Blender MCP add-on, click "Connect to Claude", then `claude mcp add blender -- uvx blender-mcp`. Not added to .mcp.json because it
only works on a machine with Blender open (and it lets Claude run Python inside Blender).
