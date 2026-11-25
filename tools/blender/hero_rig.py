import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, hero_common as H
importlib.reload(H)
from hero_common import *
from mathutils import Vector

arm = bpy.data.objects["Rig.001"]
dg = bpy.context.evaluated_depsgraph_get()

# remove reference KayKit meshes
for o in list(bpy.data.objects):
    if o.name.startswith(("Rogue_", "1H_", "2H_", "Knife", "Throwable", "Icosphere")):
        bpy.data.objects.remove(o, do_unlink=True)

SKIP = ("BH_Floor", "BH_Cam", "BH_Key", "BH_Fill", "BH_Rim")
meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("BH_") and o.name not in SKIP]

# 1. bake modifiers
for o in meshes:
    if o.modifiers:
        ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = bpy.data.meshes.new_from_object(ev)
        old = o.data
        o.modifiers.clear()
        o.data = me
        bpy.data.meshes.remove(old)
    for p in o.data.polygons:
        p.use_smooth = True

# 2. bone table
BONES = {}
for b in arm.data.bones:
    BONES[b.name] = (b.head_local.copy(), b.tail_local.copy())
DEF = ["hips", "spine", "chest", "head", "upperarm.l", "lowerarm.l", "wrist.l", "hand.l", "upperarm.r", "lowerarm.r",
       "wrist.r", "hand.r", "upperleg.l", "lowerleg.l", "foot.l", "toes.l", "upperleg.r", "lowerleg.r", "foot.r", "toes.r"]

def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length

def side(o):
    # my "_R" objects sit at +x, which is the KayKit ".l" side
    return ".l" if o.name.endswith("_R") else ".r"

def classify(o):
    n = o.name
    sd = side(o)
    # rigid assignments
    if n.startswith(("BH_Head", "BH_Sclera", "BH_Iris", "BH_Pupil", "BH_Spark", "BH_Lid", "BH_Brow", "BH_Mouth", "BH_Ear",
                     "BH_Hair", "BH_Band", "BH_Knot", "BH_Tail", "BH_Gog")) and not n.startswith("BH_Band2"):
        return ("rigid", "head")
    if n.startswith(("BH_HandPalm", "BH_HandPlate", "BH_HandFinger", "BH_HandThumb")): return ("rigid", "hand" + sd)
    if n.startswith("BH_HandCuff"): return ("rigid", "wrist" + sd)
    if n.startswith("BH_Band2"): return ("rigid", "lowerarm" + sd)
    if n.startswith("BH_BeltBuckle"): return ("rigid", "spine")
    if n.startswith("BH_Pouch"): return ("rigid", "hips")
    if n.startswith("BH_BootStrap") or n.startswith("BH_BootBuckle") or n.startswith("BH_BootLace"): return ("rigid", "foot" + sd)
    if n.startswith("BH_Boot"): return ("rigid", "foot" + sd)
    if n.startswith("BH_PadKnee"): return ("rigid", "lowerleg" + sd)
    if n.startswith("BH_PadPocket"): return ("rigid", "upperleg" + sd)
    if n.startswith(("BH_ScarfTail", "BH_ScarfFront", "BH_ScarfKnot")): return ("rigid", "chest")
    return ("soft", None)

report = {"rigid": 0, "soft": 0}
for o in meshes:
    kind, bone = classify(o)
    for vg in list(o.vertex_groups): o.vertex_groups.remove(vg)
    o.parent = arm
    o.matrix_parent_inverse = Matrix.Identity(4)
    for m in list(o.modifiers):
        if m.type == "ARMATURE": o.modifiers.remove(m)
    md = o.modifiers.new("Armature", "ARMATURE"); md.object = arm
    if kind == "rigid":
        vg = o.vertex_groups.new(name=bone)
        vg.add([v.index for v in o.data.vertices], 1.0, "REPLACE")
        report["rigid"] += 1
    else:
        groups = {n: o.vertex_groups.new(name=n) for n in DEF}
        mw = o.matrix_world
        for v in o.data.vertices:
            p = mw @ v.co
            ds = sorted(((seg_dist(p, *BONES[n]), n) for n in DEF))[:3]
            ws = [1.0 / (max(d, 0.004) ** 3.2) for d, _ in ds]
            tot = sum(ws)
            for w, (_, n) in zip(ws, ds):
                if w / tot > 0.04:
                    groups[n].add([v.index], w / tot, "REPLACE")
        report["soft"] += 1

tris = sum(len(o.data.polygons) for o in meshes)
print(report, "faces", tris, "meshes", len(meshes))
