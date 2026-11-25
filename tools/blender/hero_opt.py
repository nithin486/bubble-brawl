import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import bpy
from collections import defaultdict

arm = bpy.data.objects["Rig.001"]
if arm.animation_data: arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)

RATIOS = [  # (prefix, final ratio of original tris). Face-critical parts stay at 1.0 (built at sensible resolution).
    ("BH_Head", 0.17), ("BH_HairCap", 0.12), ("BH_HairSpike", 0.12), ("BH_HairBang", 0.2), ("BH_HairSide", 0.22), ("BH_HairNape", 0.3),
    ("BH_Spark", 1.0), ("BH_Sclera", 1.0), ("BH_Iris", 1.0), ("BH_Pupil", 1.0), ("BH_Lid", 1.0), ("BH_Brow", 0.5), ("BH_Mouth", 0.5),
    ("BH_Ear", 0.12), ("BH_Neck", 0.25), ("BH_Band2", 0.6), ("BH_Band", 0.16), ("BH_Knot", 0.2), ("BH_Tail", 0.3),
    ("BH_GogRim", 0.09), ("BH_GogGlass", 0.15), ("BH_GogFoam", 0.12), ("BH_Gog", 0.3), ("BH_HandFinger", 0.4), ("BH_HandPalm", 0.12), ("BH_HandPlate", 0.1), ("BH_Hand", 0.3),
    ("BH_ArmElbow", 0.07), ("BH_Arm", 0.22), ("BH_ShirtShoulder", 0.1), ("BH_Shirt", 0.22), ("BH_Body", 0.22), ("BH_BeltBuckle", 0.08), ("BH_Belt", 0.25), ("BH_Pouch", 0.14),
    ("BH_Leg", 0.22), ("BH_BootCap", 0.2), ("BH_BootToe", 0.26), ("BH_BootSole", 0.12), ("BH_BootWelt", 0.1), ("BH_BootShaft", 0.18), ("BH_Boot", 0.3), ("BH_PadKnee", 0.12), ("BH_PadPocket", 0.12), ("BH_Pad", 0.3), ("BH_Scarf", 0.22),
]
SKIP = ("BH_Floor", "BH_Cam", "BH_Key", "BH_Fill", "BH_Rim")
before = after = 0
bytype = defaultdict(int)
for o in list(bpy.data.objects):
    if o.type != "MESH" or not o.name.startswith("BH_") or o.name in SKIP: continue
    before += len(o.data.polygons)
    r = next((x for p, x in RATIOS if o.name.startswith(p)), 0.3)
    if r < 0.999 and len(o.data.polygons) > 40:
        md = o.modifiers.new("Dec", "DECIMATE"); md.decimate_type = "COLLAPSE"; md.ratio = r; md.use_collapse_triangulate = True
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_apply(modifier="Dec")
    else:
        for p in o.data.polygons: pass
    o.data.calc_loop_triangles()
    n = len(o.data.loop_triangles)
    after += n
    bytype[o.name.split("_")[1][:6]] += n
print("faces before", before, "tris after", after)
print(dict(bytype))
