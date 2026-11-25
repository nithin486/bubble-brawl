import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, hero_common as H
importlib.reload(H)
from hero_common import *
from mathutils.bvhtree import BVHTree

# ---- cleanup (keep KayKit rig + reference meshes, hidden) ----
H.clear_hero()
for n in ("Icosphere", "Icosphere.001", "Cube"):
    if n in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
if "Rig" in bpy.data.objects:
    bpy.data.objects.remove(bpy.data.objects["Rig"], do_unlink=True)
for o in bpy.data.objects:
    if o.name.startswith(("Rogue_", "1H_", "2H_", "Knife", "Throwable")):
        o.hide_set(True); o.hide_render = True

HC = Vector((0, 0, 1.61))
SC = (0.318, 0.30, 0.305)

SKIN = mat("BH_Skin", (0.99, 0.64, 0.45), rough=0.55, spec=0.4, sss=0.12)
SKIN_D = mat("BH_SkinShade", (0.80, 0.45, 0.32), rough=0.6)
HAIRBROW = mat("BH_Brow", (0.20, 0.10, 0.06), rough=0.45)
SCLERA = mat("BH_Sclera", (0.98, 0.98, 1.0), rough=0.15, coat=0.0, emit=(1,1,1,0.35))
IRIS = mat("BH_Iris", (0.42, 0.20, 0.08), rough=0.2, coat=1.0)
PUPIL = mat("BH_Pupil", (0.02, 0.01, 0.01), rough=0.15, coat=1.0)
SPARK = mat("BH_Spark", (1, 1, 1), rough=0.1, emit=(1, 1, 1, 3.0))
MOUTH = mat("BH_MouthIn", (0.35, 0.07, 0.07), rough=0.4)
LIP = mat("BH_Lip", (0.80, 0.36, 0.30), rough=0.4)


def head_deform(u, p):
    x, y, z = p
    f = max(0.0, -u.y)  # front factor
    # chibi jaw taper
    if u.z < 0:
        t = (-u.z) ** 1.25
        x *= 1 - 0.11 * t
        y *= 1 - 0.05 * t
        z *= 1 + 0.03 * t
    # flatten back/top slightly
    if u.y > 0:
        y *= 1 - 0.06 * u.y
    for s in (-1, 1):
        ex = s * 0.118
        # eye socket dent, brow ridge, cheek
        p_dent = 0.028 * gauss(x, z, ex, -0.005, 0.085, 0.095)
        p_brow = 0.014 * gauss(x, z, s * 0.105, 0.125, 0.085, 0.035)
        p_cheek = 0.014 * gauss(x, z, s * 0.18, -0.10, 0.075, 0.07)
        y += f * (p_dent - p_brow - p_cheek)
    # nose bump + chin
    y -= f * 0.038 * gauss(x, z, 0, -0.075, 0.032, 0.040)
    y -= f * 0.020 * gauss(x, z, 0, -0.225, 0.06, 0.04)
    # philtrum / mouth dip
    y += f * 0.006 * gauss(x, z, 0, -0.125, 0.07, 0.02)
    return Vector((x, y, z))


head = sphere("BH_Head", HC, SC, seg=64, rings=40, deform=head_deform)
finish(head, SKIN, subsurf=1)
head.data.materials.clear(); head.data.materials.append(SKIN)

# surface raycast helper (world space) on the base mesh
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(head, dg)

def surf(x, z, off=0.0):
    hit = bvh.ray_cast(Vector((x, -2, z)), Vector((0, 1, 0)))
    if hit[0] is None:
        return Vector((x, -0.3, z))
    p = hit[0] + hit[1] * off
    return p

# ---- eyes ----
for s, side in ((-1, "L"), (1, "R")):
    ex, ez = s * 0.118, 1.605
    cy = -0.248
    scl = sphere(f"BH_Sclera_{side}", (ex, cy, ez), (0.072, 0.046, 0.088), 26, 16, front=True)
    finish(scl, SCLERA, subsurf=0)
    # iris/pupil sit on the front of the sclera
    iy = cy - 0.048 * 0.93
    iris = sphere(f"BH_Iris_{side}", (ex + s * 0.003, iy, ez - 0.004), (0.052, 0.016, 0.068), 24, 12, front=True)
    finish(iris, IRIS, subsurf=0)
    pup = sphere(f"BH_Pupil_{side}", (ex + s * 0.004, iy - 0.017, ez - 0.006), (0.027, 0.008, 0.036), 16, 8, front=True)
    finish(pup, PUPIL, subsurf=0)
    hl = sphere(f"BH_Spark1_{side}", (ex - 0.017, iy - 0.027, ez + 0.026), (0.015, 0.006, 0.017), 10, 6, front=True)
    finish(hl, SPARK, subsurf=0)
    hl2 = sphere(f"BH_Spark2_{side}", (ex + 0.020, iy - 0.025, ez - 0.026), (0.008, 0.004, 0.009), 8, 5, front=True)
    finish(hl2, SPARK, subsurf=0)
    # upper eyelid cap (inner end lower = determined look)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=22, v_segments=14, radius=1.0)
    kill = []
    for v in bm.verts:
        thr = 0.60 + 0.20 * v.co.x * s
        if not (v.co.z > thr and v.co.y < 0.35):
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    for v in bm.verts:
        v.co = Vector((v.co.x * 0.081, v.co.y * 0.056, v.co.z * 0.097)) + Vector((ex, cy - 0.002, ez))
    lid = new_obj(f"BH_Lid_{side}", bm)
    finish(lid, SKIN, subsurf=0)
    sol = lid.modifiers.new("Solid", "SOLIDIFY"); sol.thickness = 0.008; sol.offset = 1

    # eyebrow
    pts = []
    n = 7
    for i in range(n):
        t = i / (n - 1)
        bx = s * (0.05 + 0.145 * t)
        bz = 1.735 + 0.012 * math.sin(t * math.pi) + 0.020 * t - 0.006
        p = surf(bx, bz, off=-0.004)
        pts.append(p)
    rad = [(0.010 + 0.006 * math.sin(t / (n - 1) * math.pi) , 0.011) for t in range(n)]
    br = tube(f"BH_Brow_{side}", pts, [(0.006, 0.0105 + 0.0045 * math.sin(i / (n - 1) * math.pi)) for i in range(n)], sides=8)
    finish(br, HAIRBROW, subsurf=1)

# ---- mouth: confident smile ----
pts = []
n = 11
for i in range(n):
    t = i / (n - 1) * 2 - 1
    mx = t * 0.072
    mz = 1.61 - 0.135 + 0.022 * t * t - 0.004 * t
    pts.append(surf(mx, mz, off=-0.002))
mouth = tube("BH_Mouth", pts, [(0.0095 + 0.003 * (1 - abs(i / (n - 1) * 2 - 1)), 0.0075) for i in range(n)], sides=8)
finish(mouth, MOUTH, subsurf=1)

# ears
for s, side in ((-1, "L"), (1, "R")):
    ear = sphere(f"BH_Ear_{side}", (0, 0, 0), (0.045, 0.05, 0.075), 24, 14)
    ear.rotation_euler = (math.radians(8), 0, s * math.radians(-18))
    ear.location = (s * 0.318, 0.02, 1.60)
    finish(ear, SKIN, subsurf=1)

# neck
neck = tube("BH_Neck", [(0, 0.0, 1.22), (0, 0.0, 1.36), (0, 0.0, 1.42)], [0.105, 0.098, 0.095], sides=24)
finish(neck, SKIN, subsurf=1)

H.studio()
bpy.context.scene.cycles.samples = 20

