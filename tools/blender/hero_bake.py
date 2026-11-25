"""Join the hero into one skinned mesh (+ a glass mesh), unwrap one atlas and bake colour+AO+procedural detail."""
import sys, os
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, hero_common as H
importlib.reload(H)
from hero_common import *

ATLAS = 2048
arm = bpy.data.objects["Rig.001"]
SKIP = ("BH_Floor", "BH_Cam", "BH_Key", "BH_Fill", "BH_Rim")
meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("BH_") and o.name not in SKIP and o.name not in ("BH_Hero", "BH_HeroGlass")]
glass = [o for o in meshes if o.name.startswith("BH_GogGlass")]
body = [o for o in meshes if o not in glass]


def principled(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")

def set_base(m, build):
    """build(nt, base_rgba_value) -> socket (color output) that replaces Base Color"""
    nt = m.node_tree
    b = principled(m)
    for l in list(b.inputs["Base Color"].links):
        nt.links.remove(l)
    base = tuple(b.inputs["Base Color"].default_value)
    out = build(nt, base)
    nt.links.new(out, b.inputs["Base Color"])

def N(nt, t, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items():
        setattr(n, k, v)
    return n

def mix(nt, a, b, fac, blend="MULTIPLY"):
    m = N(nt, "ShaderNodeMix", data_type="RGBA", blend_type=blend)
    m.inputs[0].default_value = fac if not hasattr(fac, "node") else 0
    if hasattr(fac, "node"):
        nt.links.new(fac, m.inputs[0])
    if hasattr(a, "node"): nt.links.new(a, m.inputs[6])
    else: m.inputs[6].default_value = a
    if hasattr(b, "node"): nt.links.new(b, m.inputs[7])
    else: m.inputs[7].default_value = b
    return m.outputs[2]

def pos(nt):
    return N(nt, "ShaderNodeNewGeometry").outputs["Position"]

def vmath(nt, op, a, b=None, scalar=None):
    n = N(nt, "ShaderNodeVectorMath", operation=op)
    for i, v in enumerate((a, b)):
        if v is None: continue
        if hasattr(v, "node"): nt.links.new(v, n.inputs[i])
        else: n.inputs[i].default_value = v
    return n

def dist_to(nt, point, mirror_x=False):
    p = pos(nt)
    if mirror_x:
        sep = N(nt, "ShaderNodeSeparateXYZ"); nt.links.new(p, sep.inputs[0])
        ab = N(nt, "ShaderNodeMath", operation="ABSOLUTE"); nt.links.new(sep.outputs[0], ab.inputs[0])
        cmb = N(nt, "ShaderNodeCombineXYZ")
        nt.links.new(ab.outputs[0], cmb.inputs[0]); nt.links.new(sep.outputs[1], cmb.inputs[1]); nt.links.new(sep.outputs[2], cmb.inputs[2])
        p = cmb.outputs[0]
    d = vmath(nt, "DISTANCE", p, point)
    return d.outputs["Value"]

def ramp(nt, fac, stops):
    r = N(nt, "ShaderNodeValToRGB")
    els = r.color_ramp.elements
    while len(els) < len(stops): els.new(0.5)
    for e, (p, c) in zip(els, stops):
        e.position = p; e.color = (*c, 1)
    nt.links.new(fac, r.inputs[0])
    return r.outputs[0]

def noise(nt, scale, detail=4.0, stretch=(1, 1, 1), rough=0.55):
    mp = N(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = stretch
    nt.links.new(pos(nt), mp.inputs[0])
    nz = N(nt, "ShaderNodeTexNoise", noise_dimensions="3D")
    nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = detail; nz.inputs["Roughness"].default_value = rough
    nt.links.new(mp.outputs[0], nz.inputs["Vector"])
    return nz.outputs["Fac"]

def maprange(nt, v, a, b, c, d, clamp=True):
    m = N(nt, "ShaderNodeMapRange", clamp=clamp)
    nt.links.new(v, m.inputs[0])
    m.inputs[1].default_value = a; m.inputs[2].default_value = b; m.inputs[3].default_value = c; m.inputs[4].default_value = d
    return m.outputs[0]

def ao(nt, dist=0.12):
    a = N(nt, "ShaderNodeAmbientOcclusion", samples=16)
    a.inputs["Distance"].default_value = dist
    return a.outputs["Color"] if "Color" in a.outputs else a.outputs[0]

def with_ao(nt, col, strength=0.7, dist=0.12):
    return mix(nt, col, ao(nt, dist), strength, "MULTIPLY")

def tint(base, k):
    return tuple(min(1, c * k) for c in base[:3]) + (1,)

M = bpy.data.materials

def b_skin(nt, base):
    # cheeks blush + nose tint
    d = dist_to(nt, (0.185, -0.272, 1.535), mirror_x=True)
    f = maprange(nt, d, 0.0, 0.085, 0.55, 0.0)
    c = mix(nt, base, (1.0, 0.36, 0.34, 1), f, "MIX")
    dn = dist_to(nt, (0.0, -0.325, 1.545))
    fn = maprange(nt, dn, 0.0, 0.03, 0.35, 0.0)
    c = mix(nt, c, (1.0, 0.40, 0.34, 1), fn, "MIX")
    return with_ao(nt, c, 0.8, 0.10)

def b_hair(nt, base):
    n = noise(nt, 22, 3.0, stretch=(1.6, 1.6, 0.35))
    r = ramp(nt, n, [(0.35, (0.55, 0.40, 0.33)), (0.65, (1.25, 1.1, 1.0))])
    c = mix(nt, base, r, 1.0, "MULTIPLY")
    h = maprange(nt, N(nt, "ShaderNodeSeparateXYZ") .outputs[2] if False else _z(nt), 1.78, 2.02, 0.0, 0.55)
    c = mix(nt, c, (0.62, 0.30, 0.12, 1), h, "MIX")
    return with_ao(nt, c, 0.85, 0.10)

def _z(nt):
    sep = N(nt, "ShaderNodeSeparateXYZ"); nt.links.new(pos(nt), sep.inputs[0]); return sep.outputs[2]

def b_cloth(nt, base, scale=90, k=0.30):
    n = noise(nt, scale, 2.0, stretch=(1, 1, 1))
    r = ramp(nt, n, [(0.3, (1 - k, 1 - k, 1 - k)), (0.7, (1.0 + k * 0.2,) * 3)])
    return with_ao(nt, mix(nt, base, r, 1.0, "MULTIPLY"), 0.8, 0.10)

def b_leather(nt, base):
    n = noise(nt, 38, 5.0, rough=0.7)
    r = ramp(nt, n, [(0.3, (0.92, 0.9, 0.88)), (0.7, (1.05, 1.03, 1.01))])
    return with_ao(nt, mix(nt, base, r, 1.0, "MULTIPLY"), 0.85, 0.09)

def b_plain(nt, base):
    return with_ao(nt, mix(nt, base, base, 0.0, "MIX") if False else _passthrough(nt, base), 0.7, 0.09)

def _passthrough(nt, base):
    rgb = N(nt, "ShaderNodeRGB"); rgb.outputs[0].default_value = base
    return rgb.outputs[0]

def b_iris(nt, base):
    d = dist_to(nt, (0.1215, -0.292, 1.598), mirror_x=True)
    t = maprange(nt, d, 0.0, 0.055, 0.0, 1.0)
    r = ramp(nt, t, [(0.0, (0.80, 0.50, 0.15)), (0.55, (0.38, 0.17, 0.06)), (0.88, (0.15, 0.07, 0.03))])
    return r

def b_sclera(nt, base):
    d = dist_to(nt, (0.118, -0.29, 1.60), mirror_x=True)
    t = maprange(nt, d, 0.03, 0.09, 0.0, 1.0)
    r = ramp(nt, t, [(0.0, (1.0, 1.0, 1.0)), (1.0, (0.86, 0.78, 0.78))])
    return r

BUILD = {
    "BH_Skin": b_skin, "BH_SkinShade": b_skin,
    "BH_HairMat": b_hair, "BH_HairTip": b_hair,
    "BH_Shirt": lambda nt, b: b_cloth(nt, b, 110, 0.04), "BH_ShirtTrim": lambda nt, b: b_cloth(nt, b, 90, 0.04),
    "BH_Pants": lambda nt, b: b_cloth(nt, b, 80, 0.04),
    "BH_Orange": lambda nt, b: b_cloth(nt, b, 70, 0.04), "BH_OrangeDark": lambda nt, b: b_cloth(nt, b, 70, 0.04),
    "BH_Leather": b_leather, "BH_LeatherDark": b_leather,
    "BH_Iris": b_iris, "BH_Sclera": b_sclera,
}
def b_boottoe(nt, base):
    n = noise(nt, 38, 5.0, rough=0.7)
    r = ramp(nt, n, [(0.3, (0.62, 0.55, 0.5)), (0.7, (1.2, 1.12, 1.05))])
    c = mix(nt, base, r, 1.0, "MULTIPLY")
    sep = N(nt, "ShaderNodeSeparateXYZ"); nt.links.new(pos(nt), sep.inputs[0])
    f = maprange(nt, sep.outputs[1], -0.135, -0.165, 0.0, 1.0)
    z = maprange(nt, sep.outputs[2], 0.095, 0.06, 0.0, 1.0)
    fm = N(nt, "ShaderNodeMath", operation="MULTIPLY"); nt.links.new(f, fm.inputs[0]); nt.links.new(z, fm.inputs[1])
    c = mix(nt, c, (0.95, 0.30, 0.04, 1), fm.outputs[0], "MIX")
    return with_ao(nt, c, 0.85, 0.09)
BUILD["BH_BootToe"] = b_boottoe
# metals bake black in a diffuse pass: bake as bright dielectrics (game re-lights anyway)
for nm, col in (("BH_Metal", (0.78, 0.80, 0.84, 1)), ("BH_GogRim", (0.80, 0.42, 0.13, 1))):
    if nm in M:
        pb = principled(M[nm]); pb.inputs["Metallic"].default_value = 0.0; pb.inputs["Base Color"].default_value = col
used = set()
for o in body:
    for s in o.material_slots:
        if s.material: used.add(s.material.name)
for name in used:
    m = M[name]
    set_base(m, BUILD.get(name, b_plain))

# ---- join ----
for o in bpy.data.objects: o.select_set(False)
def join(objs, name):
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = name; j.data.name = name
    for o in bpy.data.objects: o.select_set(False)
    return j

hero = join(body, "BH_Hero")
gl = join(glass, "BH_HeroGlass")
print("joined", len(hero.data.polygons), "polys;", len(hero.material_slots), "materials")

# ---- UV atlas ----
bpy.ops.object.select_all(action="DESELECT")
hero.select_set(True); bpy.context.view_layer.objects.active = hero
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=0.7, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale()
bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
bpy.ops.object.mode_set(mode="OBJECT")

# ---- bake ----
img = bpy.data.images.get("bubble_hero_albedo") or bpy.data.images.new("bubble_hero_albedo", ATLAS, ATLAS, alpha=False)
img.scale(ATLAS, ATLAS)
img.colorspace_settings.name = "sRGB"
for s in hero.material_slots:
    nt = s.material.node_tree
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = img; tn.name = "BAKE_TGT"
    nt.nodes.active = tn
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.samples = 64
sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False; sc.render.bake.use_pass_color = True
sc.render.bake.margin = 6
sc.cycles.bake_type = "DIFFUSE"
bpy.ops.object.bake(type="DIFFUSE")
os.makedirs(os.path.join(OUT, "textures"), exist_ok=True)
img.filepath_raw = os.path.join(OUT, "textures", "bubble_hero_albedo.png")
img.file_format = "PNG"
img.save()

# ---- single baked material ----
final = bpy.data.materials.new("BH_HeroAtlas"); final.use_nodes = True
b = principled(final)
tn = final.node_tree.nodes.new("ShaderNodeTexImage"); tn.image = img
final.node_tree.links.new(tn.outputs[0], b.inputs["Base Color"])
b.inputs["Roughness"].default_value = 0.6
hero.data.materials.clear(); hero.data.materials.append(final)
print("baked", img.filepath_raw)
