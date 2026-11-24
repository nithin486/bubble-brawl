import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, hero_common as H
importlib.reload(H)
from hero_common import *

PREFIX = ("BH_Body", "BH_Arm", "BH_Hand", "BH_Leg", "BH_Boot", "BH_Belt", "BH_Pouch", "BH_Scarf", "BH_Pad", "BH_Shirt", "BH_Band2", "BH_Neck2")
for o in list(bpy.data.objects):
    if o.name.startswith(PREFIX):
        bpy.data.objects.remove(o, do_unlink=True)

SKIN = bpy.data.materials["BH_Skin"]
SHIRT = mat("BH_Shirt", (0.30, 0.31, 0.35), rough=0.85, spec=0.2)
SHIRT_T = mat("BH_ShirtTrim", (0.14, 0.14, 0.17), rough=0.8)
PANTS = mat("BH_Pants", (0.16, 0.17, 0.21), rough=0.82, spec=0.2)
LEATHER = mat("BH_Leather", (0.33, 0.15, 0.06), rough=0.55, spec=0.45, coat=0.15)
LEATHER_D = mat("BH_LeatherDark", (0.12, 0.07, 0.05), rough=0.6, spec=0.4)
ORANGE = bpy.data.materials["BH_Orange"]
ORANGE_D = bpy.data.materials["BH_OrangeDark"]
METAL = bpy.data.materials["BH_Metal"]
RUBBER = mat("BH_Rubber", (0.10, 0.10, 0.12), rough=0.9, spec=0.2)
SOLE = mat("BH_Sole", (0.78, 0.76, 0.72), rough=0.8)
BOOTTOE = mat("BH_BootToe", (0.33, 0.15, 0.06), rough=0.55, spec=0.45, coat=0.15)
LACE = mat("BH_Lace", (0.92, 0.88, 0.78), rough=0.8)


def loft(name, rings, sides=32, cap=True, closed_top=True):
    """rings: list of (z, cx, cy, rx, ry) -> smooth lofted vertical solid."""
    bm = bmesh.new()
    R = []
    for (z, cx, cy, rx, ry) in rings:
        R.append([bm.verts.new((cx + math.cos(2 * math.pi * k / sides) * rx, cy + math.sin(2 * math.pi * k / sides) * ry, z)) for k in range(sides)])
    for i in range(len(R) - 1):
        for k in range(sides):
            bm.faces.new((R[i][k], R[i][(k + 1) % sides], R[i + 1][(k + 1) % sides], R[i + 1][k]))
    if cap:
        bm.faces.new(R[0][::-1]); bm.faces.new(R[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)


def rot_obj(o, euler, loc):
    o.rotation_euler = euler
    o.location = loc
    return o

# ================= TORSO =================
torso = loft("BH_BodyTorso", [
    (0.66, 0, 0.0, 0.150, 0.112), (0.72, 0, 0.0, 0.150, 0.112), (0.88, 0, 0.0, 0.142, 0.110),
    (0.98, 0, 0.0, 0.150, 0.114), (1.08, 0, 0.0, 0.176, 0.122), (1.18, 0, 0.0, 0.176, 0.118),
    (1.24, 0, 0.0, 0.140, 0.100), (1.28, 0, 0.0, 0.100, 0.085)], sides=36)
finish(torso, SHIRT, subsurf=1)
# shirt neckline/hem trim
hem = loft("BH_ShirtHem", [(0.655, 0, 0, 0.1535, 0.1145), (0.705, 0, 0, 0.1535, 0.1145)], sides=36)
finish(hem, SHIRT_T, subsurf=1)
# shoulder caps (sleeve-less shirt covers deltoid)
for s, side in ((-1, "L"), (1, "R")):
    sh = sphere(f"BH_ShirtShoulder_{side}", (s * 0.205, 0.0, 1.105), (0.075, 0.068, 0.085), 24, 16)
    finish(sh, SHIRT, subsurf=1)

# ================= ARMS (T-pose along X) =================
for s, side in ((-1, "L"), (1, "R")):
    ua = tube(f"BH_ArmUpper_{side}", [(s * 0.20, 0.0, 1.107), (s * 0.33, 0.006, 1.107), (s * 0.454, 0.014, 1.107)],
              [(0.064, 0.064), (0.060, 0.06), (0.056, 0.056)], sides=20, cap=False)
    finish(ua, SKIN, subsurf=1)
    la = tube(f"BH_ArmLower_{side}", [(s * 0.454, 0.014, 1.107), (s * 0.58, 0.007, 1.107), (s * 0.72, 0.0, 1.107)],
              [(0.057, 0.057), (0.058, 0.058), (0.048, 0.048)], sides=20, cap=False)
    finish(la, SKIN, subsurf=1)
    elbow = sphere(f"BH_ArmElbow_{side}", (s * 0.454, 0.014, 1.107), (0.058, 0.058, 0.058), 18, 12)
    finish(elbow, SKIN, subsurf=1)
    # orange wristband + dark glove cuff
    wb = tube(f"BH_Band2_{side}", [(s * 0.680, 0, 1.107), (s * 0.730, 0, 1.107)], [(0.056, 0.056), (0.056, 0.056)], sides=24)
    finish(wb, ORANGE, subsurf=1)
    cuff = tube(f"BH_HandCuff_{side}", [(s * 0.730, 0, 1.107), (s * 0.790, 0, 1.107)], [(0.054, 0.054), (0.058, 0.058)], sides=24)
    finish(cuff, LEATHER_D, subsurf=1)
    palm = sphere(f"BH_HandPalm_{side}", (s * 0.835, 0.0, 1.107), (0.058, 0.048, 0.05), 24, 16)
    finish(palm, LEATHER_D, subsurf=1)
    plate = sphere(f"BH_HandPlate_{side}", (s * 0.842, -0.03, 1.107), (0.038, 0.016, 0.038), 16, 10)
    finish(plate, METAL, subsurf=1)
    for i, fy in enumerate((-0.030, -0.010, 0.010, 0.030)):
        ln = 0.052 - 0.006 * abs(i - 1.2)
        f = tube(f"BH_HandFinger{i}_{side}", [(s * 0.870, fy, 1.107), (s * (0.870 + ln * 0.6), fy, 1.103), (s * (0.870 + ln), fy, 1.094)],
                 [(0.0165, 0.0165), (0.0155, 0.0155), (0.0135, 0.0135)], sides=10)
        finish(f, LEATHER_D, subsurf=1)
    th = tube(f"BH_HandThumb_{side}", [(s * 0.82, -0.034, 1.115), (s * 0.85, -0.056, 1.125), (s * 0.872, -0.066, 1.13)],
              [(0.0185, 0.0185), (0.0165, 0.0165), (0.0135, 0.0135)], sides=10)
    finish(th, LEATHER_D, subsurf=1)

# ================= BELT + POUCHES =================
belt = loft("BH_BeltBand", [(0.700, 0, 0, 0.1565, 0.1195), (0.760, 0, 0, 0.1585, 0.1215)], sides=40)
finish(belt, LEATHER, subsurf=1)
buckle = sphere("BH_BeltBuckle", (0, -0.123, 0.730), (0.036, 0.01, 0.032), 20, 12)
finish(buckle, METAL, subsurf=1)
bk_in = sphere("BH_BeltBuckleIn", (0, -0.130, 0.730), (0.020, 0.007, 0.018), 16, 10)
finish(bk_in, LEATHER, subsurf=1)
for i, (px, py, pz, sx, sy, sz, rot) in enumerate([(-0.165, -0.03, 0.64, 0.045, 0.060, 0.062, -12), (0.16, 0.05, 0.64, 0.04, 0.05, 0.055, 14)]):
    po = sphere(f"BH_PouchBody{i}", (0, 0, 0), (sx, sy, sz), 20, 14)
    rot_obj(po, (0, 0, math.radians(rot)), (px, py, pz)); finish(po, LEATHER, subsurf=1)
    fl = sphere(f"BH_PouchFlap{i}", (0, 0, 0), (sx * 1.07, sy * 1.07, sz * 0.5), 20, 10)
    rot_obj(fl, (0, 0, math.radians(rot)), (px, py, pz + sz * 0.5)); finish(fl, ORANGE, subsurf=1)
    sn = sphere(f"BH_PouchSnap{i}", (0, 0, 0), (0.009, 0.009, 0.009), 10, 8)
    rot_obj(sn, (0, 0, 0), (px + (-0.0 if i else -0.0), py - sy * 1.05, pz + sz * 0.3)); finish(sn, METAL, subsurf=0)

pelvis = loft("BH_BodyPelvis", [(0.44, 0, 0.0, 0.14, 0.09), (0.50, 0, 0.0, 0.225, 0.112), (0.58, 0, 0.0, 0.232, 0.118), (0.66, 0, 0.0, 0.185, 0.116), (0.74, 0, 0.0, 0.156, 0.114)], sides=40)
finish(pelvis, PANTS, subsurf=1)

# ================= LEGS / BOOTS =================
for s, side in ((-1, "L"), (1, "R")):
    x = s * 0.171
    leg = loft(f"BH_LegUpper_{side}", [(0.205, x, 0.019, 0.080, 0.082), (0.292, x, -0.008, 0.078, 0.080), (0.40, x, -0.006, 0.088, 0.090), (0.505, x, 0.0, 0.092, 0.095), (0.560, x, 0.0, 0.085, 0.09)], sides=28)
    finish(leg, PANTS, subsurf=1)
    cuff = loft(f"BH_LegCuff_{side}", [(0.215, x, 0.019, 0.086, 0.088), (0.265, x, 0.0, 0.082, 0.085)], sides=28)
    finish(cuff, SHIRT_T, subsurf=1)
    # knee pad (orange) + strap
    kp = sphere(f"BH_PadKnee_{side}", (0, 0, 0), (0.060, 0.032, 0.070), 22, 14)
    rot_obj(kp, (math.radians(-8), 0, 0), (x, -0.075, 0.305)); finish(kp, ORANGE, subsurf=1)
    kp2 = sphere(f"BH_PadKneeRim_{side}", (0, 0, 0), (0.066, 0.026, 0.020), 22, 10)
    rot_obj(kp2, (math.radians(-8), 0, 0), (x, -0.078, 0.355)); finish(kp2, ORANGE_D, subsurf=1)
    # cargo pocket on thigh (outer side)
    cp = sphere(f"BH_PadPocket_{side}", (0, 0, 0), (0.016, 0.052, 0.058), 18, 12)
    rot_obj(cp, (0, 0, 0), (x + s * 0.087, -0.01, 0.43)); finish(cp, PANTS, subsurf=1)

    # ---- boot ----
    shaft = loft(f"BH_BootShaft_{side}", [(0.028, x, 0.02, 0.092, 0.098), (0.10, x, 0.02, 0.086, 0.092), (0.19, x, 0.019, 0.088, 0.09), (0.225, x, 0.019, 0.095, 0.096)], sides=28)
    finish(shaft, LEATHER, subsurf=1)
    toe = sphere(f"BH_BootToe_{side}", (x, -0.095, 0.062), (0.093, 0.15, 0.064), 28, 18)
    finish(toe, BOOTTOE, subsurf=1)
    sole = sphere(f"BH_BootSole_{side}", (x, -0.07, 0.020), (0.1, 0.205, 0.024), 32, 12)
    finish(sole, RUBBER, subsurf=1)
    welt = sphere(f"BH_BootWelt_{side}", (x, -0.07, 0.034), (0.098, 0.20, 0.012), 32, 10)
    finish(welt, SOLE, subsurf=1)
    top = tube(f"BH_BootTop_{side}", [(x - 0.092, 0.02, 0.225), (x, 0.118, 0.225), (x + 0.092, 0.02, 0.225), (x, -0.078, 0.225)], [0.012] * 4, sides=8, cap=False) if False else None
    rim = loft(f"BH_BootRim_{side}", [(0.205, x, 0.019, 0.096, 0.098), (0.232, x, 0.019, 0.099, 0.101)], sides=28)
    finish(rim, ORANGE, subsurf=1)
    # strap + buckle across ankle
    st = loft(f"BH_BootStrap_{side}", [(0.135, x, 0.02, 0.0915, 0.095), (0.168, x, 0.02, 0.0925, 0.096)], sides=28)
    finish(st, ORANGE_D, subsurf=1)
    bkl = sphere(f"BH_BootBuckle_{side}", (x, -0.077, 0.152), (0.018, 0.008, 0.02), 14, 10)
    finish(bkl, METAL, subsurf=0)
    # laces
    for j in range(4):
        lz = 0.08 + j * 0.0
        lc = tube(f"BH_BootLace{j}_{side}", [(x - 0.038, -0.18 + j * 0.0, 0.1), (x, -0.185, 0.1), (x + 0.038, -0.18, 0.1)], [0.006] * 3, sides=6) if False else None
    for j in range(3):
        yy = -0.155 + j * 0.032
        zz = 0.108 - j * 0.004 if False else 0.118 + (0.0)
        lc = tube(f"BH_BootLace{j}_{side}", [(x - 0.036, yy, 0.12 + j * 0.012 - 0.0), (x, yy - 0.004, 0.126 + j * 0.012), (x + 0.036, yy, 0.12 + j * 0.012)], [0.0055] * 3, sides=6)
        finish(lc, LACE, subsurf=0)

# ================= SCARF =================
loop = loft("BH_ScarfLoop", [(1.20, 0, 0.0, 0.150, 0.126), (1.255, 0, 0.0, 0.158, 0.132), (1.31, 0, 0.0, 0.140, 0.120), (1.34, 0, 0.0, 0.128, 0.11)], sides=40, cap=False)
finish(loop, ORANGE, subsurf=1)
knot = sphere("BH_ScarfKnot", (-0.075, -0.115, 1.235), (0.062, 0.05, 0.055), 22, 14)
finish(knot, ORANGE, subsurf=1)
# long tail trailing behind (flowing), two tails of different length
for i, (sx, ln, dz) in enumerate(((-0.06, 0.55, 0.0), (0.07, 0.38, 0.02))):
    pts = []
    n = 9
    for j in range(n):
        t = j / (n - 1)
        pts.append((sx + 0.03 * math.sin(t * 3.4 + i), 0.12 + 0.28 * t + 0.03 * math.sin(t * 4 + i), 1.22 - ln * t * 0.9 + 0.04 * t))
    rad = [(0.055 + 0.04 * math.sin(t * 2.2) * (1 - 0.5 * t), 0.011) for t in [j / (n - 1) for j in range(n)]]
    tl = tube(f"BH_ScarfTail{i}", pts, rad, sides=8, cap=True)
    finish(tl, ORANGE if i == 0 else ORANGE_D, subsurf=1)
# front short end
pts = [(-0.09, -0.125, 1.22), (-0.10, -0.15, 1.12), (-0.085, -0.155, 1.0)]
fe = tube("BH_ScarfFront", pts, [(0.04, 0.011), (0.045, 0.011), (0.04, 0.011)], sides=8)
finish(fe, ORANGE_D, subsurf=1)

H.studio()
_shoot = (lambda *a, **k: None) if globals().get("NORENDER") else H.shoot
bpy.context.scene.cycles.samples = 16
_shoot("test_body_front", (0, -5.2, 1.0), (0, 0, 1.0), lens=70, res=(700, 900))
_shoot("test_body_34", (-3.0, -3.8, 1.55), (0, 0, 1.0), lens=70, res=(700, 900))
