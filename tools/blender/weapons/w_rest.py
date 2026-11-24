import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, bb_common as B
importlib.reload(B)
from bb_common import *
P = PAL

def fib(n):
    pts = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - y * y)
        pts.append(Vector((math.cos(ga * i) * r, math.sin(ga * i) * r, y)))
    return pts

def orient(v):
    return Vector((0, 0, 1)).rotation_difference(v).to_euler()

# ------------------------------------------------------------------ banana trap
def banana():
    k = Kit("W_Banana")
    yel = mat("bn_yel", (1.0, 0.82, 0.1), 0.28, 0.0, coat=0.5)
    yel2 = mat("bn_yel2", (0.95, 0.62, 0.05), 0.4)
    brown = mat("bn_brown", (0.36, 0.2, 0.08), 0.6)
    navy = mat("bn_navy", P['navy'], 0.5)
    steel = mat("bn_steel", P['steel'], 0.3, 0.9)
    gold = mat("bn_gold", (1.0, 0.78, 0.3), 0.3, 0.9)
    green = mat("bn_green", (0.3, 1.0, 0.4), 0.3, 0.0, emit=(0.2, 1.0, 0.35, 4.0))
    red = mat("bn_red", P['red'], 0.4)
    R = 0.42
    pts, rad = [], []
    N = 14
    for i in range(N + 1):
        t = -1.0 + 2.0 * i / N
        a = t * 0.95
        pts.append((R * math.sin(a), 0, 0.2 + R * (1 - math.cos(a)) * 0.9))
        prof = math.sin(math.pi * (i / N)) ** 0.55
        rr = 0.028 + 0.088 * prof
        rad.append((rr, rr * 1.12))
    k.tube("body", pts, rad, yel, sides=14, cap=True, subsurf=1)
    k.cyl("stem", 0.03, 0.12, (pts[0][0] - 0.03, 0, pts[0][2] + 0.04), brown, rot=(0, -0.9, 0), r2=0.04, bevel=0.008)
    k.sphere("tip", 0.034, (pts[-1][0] + 0.01, 0, pts[-1][2]), brown, seg=12, rings=8)
    for sgn in (1, -1):
        p2 = [(x, sgn * (r[0] * 0.98), z) for (x, y, z), r in zip(pts, rad)]
        k.tube(f"ridge{sgn}", p2[1:-1], [0.009] * (len(p2) - 2), yel2, sides=6)
    k.cyl("plate", 0.3, 0.035, (0, 0, 0.015), navy, bevel=0.012, seg=32)
    k.torus("plater", 0.3, 0.014, (0, 0, 0.03), gold, seg=36, sides=8)
    for i in range(8):
        a = i * math.pi / 4
        k.sphere(f"pbolt{i}", 0.014, (math.cos(a) * 0.23, math.sin(a) * 0.23, 0.04), steel, seg=8, rings=6)
    sp = []
    for i in range(41):
        a = i / 40 * math.pi * 2 * 3.0
        sp.append((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.04 + 0.1 * i / 40))
    k.tube("spring", sp, 0.009, steel, sides=6, cap=False)
    for i, tt in enumerate((-0.45, 0.45)):
        a = tt * 0.95
        c = (R * math.sin(a), 0, 0.2 + R * (1 - math.cos(a)) * 0.9)
        k.torus(f"band{i}", 0.108, 0.016, c, navy, rot=(0, math.pi / 2 - a * 0.9, 0), seg=24, sides=8)
    k.cyl("lamphouse", 0.04, 0.04, (0.0, 0, 0.32), gold, bevel=0.008)
    k.sphere("lamp", 0.034, (0.0, 0, 0.35), green, seg=14, rings=10)
    for sgn in (1, -1):
        k.tube(f"prong{sgn}", [(0.12 * sgn, 0.0, 0.05), (0.16 * sgn, 0.05, 0.1), (0.2 * sgn, 0.07, 0.17)], 0.011, red, sides=6)
        k.sphere(f"prongtip{sgn}", 0.022, (0.2 * sgn, 0.07, 0.17), red, seg=10, rings=8)
    return k

# ------------------------------------------------------------------ freeze bomb
def freeze():
    k = Kit("W_Freeze")
    ice = mat("fz_ice", (0.7, 0.93, 1.0), 0.08, 0.0, alpha=0.42, spec=1.0, coat=0.5)
    cry = mat("fz_cry", (0.6, 0.9, 1.0), 0.15, 0.0, coat=0.6, emit=(0.4, 0.8, 1.0, 0.35))
    cry2 = mat("fz_cry2", (0.9, 0.98, 1.0), 0.2, 0.0, coat=0.4)
    core = mat("fz_core", (0.4, 0.9, 1.0), 0.2, 0.0, emit=(0.3, 0.9, 1.0, 5.0))
    navy = mat("fz_navy", P['navy'], 0.5)
    gold = mat("fz_gold", (1.0, 0.78, 0.3), 0.28, 0.9)
    steel = mat("fz_steel", P['steel'], 0.3, 0.9)
    red = mat("fz_red", P['red'], 0.4)
    k.sphere("shell", 0.2, (0, 0, 0.22), ice, seg=32, rings=20)
    k.sphere("core", 0.115, (0, 0, 0.22), core, seg=20, rings=14)
    for i, v in enumerate(fib(6)):
        k.crystal(f"inner{i}", 0.03, 0.1, Vector((0, 0, 0.22)) + v * 0.07, cry2, rot=orient(v), sides=5)
    for i, v in enumerate(fib(14)):
        if v.z > 0.8 or v.z < -0.75:
            continue
        L = 0.16 + 0.07 * ((i * 7) % 3) / 2
        k.crystal(f"cr{i}", 0.045, L, Vector((0, 0, 0.22)) + v * 0.19, cry if i % 2 else cry2, rot=orient(v), sides=6)
    k.torus("eq", 0.205, 0.022, (0, 0, 0.22), steel, seg=40, sides=10)
    k.torus("eq2", 0.2, 0.012, (0, 0, 0.3), gold, seg=40, sides=8)
    k.torus("eq3", 0.2, 0.012, (0, 0, 0.14), gold, seg=40, sides=8)
    k.cyl("cap", 0.075, 0.07, (0, 0, 0.455), navy, bevel=0.012, r2=0.06)
    k.cyl("capring", 0.08, 0.02, (0, 0, 0.42), gold, bevel=0.005)
    k.torus("pin", 0.045, 0.01, (0.0, 0.0, 0.54), red, rot=(math.pi / 2, 0, 0), seg=20, sides=6)
    k.cyl("pinpost", 0.012, 0.06, (0, 0, 0.5), steel, seg=10)
    k.cyl("nozzle", 0.05, 0.07, (0, 0, 0.0), navy, r2=0.04, bevel=0.01)
    k.torus("nozring", 0.05, 0.01, (0, 0, 0.035), gold, seg=20, sides=6)
    return k

# ------------------------------------------------------------------ grapple hook
def hook():
    k = Kit("W_Hook")
    red = mat("hk_red", P['red'], 0.32, 0.0, coat=0.4)
    redd = mat("hk_redd", (0.62, 0.08, 0.16), 0.4)
    steel = mat("hk_steel", P['steel'], 0.28, 0.9)
    steeld = mat("hk_steeld", (0.38, 0.42, 0.52), 0.35, 0.9)
    gold = mat("hk_gold", (1.0, 0.78, 0.3), 0.28, 0.9)
    navy = mat("hk_navy", P['navy'], 0.5)
    cable = mat("hk_cable", (0.2, 1.0, 0.95), 0.3, 0.0, emit=(0.2, 1.0, 0.9, 1.2))
    green = mat("hk_green", (0.3, 1.0, 0.4), 0.3, 0.0, emit=(0.2, 1.0, 0.35, 4.0))
    rx = (0, math.pi / 2, 0)
    k.box("body", (0.5, 0.17, 0.2), (0.0, 0, 0.0), red, bevel=0.05, seg=4)
    k.box("topcowl", (0.34, 0.13, 0.05), (0.04, 0, 0.12), redd, bevel=0.02)
    k.cyl("barrel", 0.07, 0.3, (0.38, 0, 0.0), steel, rot=rx, bevel=0.008)
    k.lathe("muzzle", [(0.07, 0), (0.09, 0.03), (0.11, 0.08), (0.105, 0.11)], (0.5, 0, 0), steeld, rot=rx, seg=28)
    k.torus("muzring", 0.105, 0.014, (0.61, 0, 0), gold, rot=rx, seg=28, sides=8)
    k.cyl("spoolc", 0.085, 0.2, (-0.06, 0, 0.27), steeld, rot=(math.pi / 2, 0, 0), bevel=0.006, seg=24)
    for sgn in (1, -1):
        k.cyl(f"flange{sgn}", 0.16, 0.025, (-0.06, sgn * 0.11, 0.27), steel, rot=(math.pi / 2, 0, 0), bevel=0.008, seg=32)
        k.cyl(f"flhub{sgn}", 0.04, 0.03, (-0.06, sgn * 0.13, 0.27), gold, rot=(math.pi / 2, 0, 0), bevel=0.005, seg=16)
        for j in range(6):
            a = j * math.pi / 3
            k.sphere(f"flb{sgn}{j}", 0.012, (-0.06 + math.cos(a) * 0.12, sgn * 0.125, 0.27 + math.sin(a) * 0.12), gold, seg=8, rings=6)
    for i in range(6):
        k.torus(f"wound{i}", 0.105 + (i % 2) * 0.012, 0.014, (-0.06, -0.075 + i * 0.03, 0.27), cable, rot=(math.pi / 2, 0, 0), seg=28, sides=6)
    k.box("grip", (0.12, 0.11, 0.28), (-0.12, 0, -0.22), navy, rot=(0, -0.25, 0), bevel=0.035, seg=4)
    k.box("gripcap", (0.13, 0.115, 0.035), (-0.18, 0, -0.35), gold, rot=(0, -0.25, 0), bevel=0.01)
    k.box("trigger", (0.028, 0.03, 0.08), (0.02, 0, -0.14), gold, rot=(0, 0.3, 0), bevel=0.008)
    k.torus("guard", 0.065, 0.01, (0.07, 0, -0.15), navy, rot=(math.pi / 2, 0, 0), seg=18, sides=6)
    k.cyl("shaft", 0.03, 0.2, (0.66, 0, 0.0), steel, rot=rx, bevel=0.004)
    k.sphere("clawhub", 0.055, (0.79, 0, 0.0), steeld, seg=16, rings=10)
    for i in range(3):
        a = i * 2 * math.pi / 3 + math.pi / 2
        pts = []
        for j in range(9):
            t = j / 8
            out = 0.02 + 0.13 * math.sin(t * 1.6)
            pts.append((0.8 + 0.04 * t - 0.17 * (t ** 2.2) * 0.9, math.cos(a) * out, math.sin(a) * out))
        k.tube(f"barb{i}", pts, [0.024 - 0.015 * (j / 8) for j in range(9)], steel, sides=8)
        k.sphere(f"barbtip{i}", 0.012, pts[-1], gold, seg=8, rings=6)
    k.sphere("clawcap", 0.03, (0.845, 0, 0.0), gold, seg=12, rings=8)
    k.tube("cablemain", [(0.0, 0.0, 0.34), (0.2, 0.0, 0.3), (0.45, 0.0, 0.18), (0.7, 0.0, 0.07), (0.79, 0.0, 0.0)], 0.012, cable, sides=8)
    k.torus("guide", 0.04, 0.01, (0.2, 0, 0.21), gold, rot=rx, seg=18, sides=6)
    for sgn in (1, -1):
        k.cyl(f"lamph{sgn}", 0.034, 0.03, (0.2, sgn * 0.085, 0.04), gold, rot=(sgn * math.pi / 2, 0, 0), bevel=0.005, seg=14)
        k.sphere(f"lamp{sgn}", 0.026, (0.2, sgn * 0.1, 0.04), green, seg=12, rings=8)
    for x in (-0.15, 0.1, 0.2):
        for sgn in (1, -1):
            k.sphere(f"bolt{x}{sgn}", 0.011, (x, sgn * 0.088, -0.05), gold, seg=8, rings=6)
    return k

# ------------------------------------------------------------------ thunder hammer
def hammer():
    k = Kit("W_Hammer")
    gold = mat("hm_gold", (1.0, 0.78, 0.28), 0.25, 0.95)
    steel = mat("hm_steel", (0.55, 0.6, 0.72), 0.3, 0.9)
    navy = mat("hm_navy", P['navy'], 0.45, 0.2)
    purple = mat("hm_purple", P['purple'], 0.3, 0.0, coat=0.5)
    wood = mat("hm_wood", (0.45, 0.24, 0.12), 0.55)
    wrap = mat("hm_wrap", P['red'], 0.5)
    cream = mat("hm_cream", P['cream'], 0.45)
    bolt = mat("hm_bolt", (1.0, 0.9, 0.3), 0.2, 0.0, emit=(1.0, 0.85, 0.2, 4.0))
    core = mat("hm_core", (0.7, 0.5, 1.0), 0.2, 0.0, emit=(0.6, 0.4, 1.0, 5.0))
    k.cyl("handle", 0.034, 0.95, (0, 0, 0.0), wood, r2=0.04, bevel=0.004, seg=16)
    for i in range(8):
        k.torus(f"wrap{i}", 0.04, 0.009, (0, 0, -0.38 + i * 0.045), wrap if i % 2 == 0 else cream, seg=16, sides=6)
    k.sphere("pommel", 0.065, (0, 0, -0.5), gold, scale=(1, 1, 0.8), seg=18, rings=12)
    k.sphere("gem", 0.036, (0, 0, -0.54), core, seg=14, rings=10)
    k.torus("pomring", 0.045, 0.012, (0, 0, -0.44), gold, seg=20, sides=6)
    k.cyl("head", 0.17, 0.5, (0, 0, 0.55), navy, rot=(math.pi / 2, 0, 0), bevel=0.02, seg=28)
    for s in (1, -1):
        k.cyl(f"cap{s}", 0.2, 0.1, (0, s * 0.3, 0.55), gold, rot=(math.pi / 2, 0, 0), r2=0.19, bevel=0.02, seg=28)
        k.cyl(f"capface{s}", 0.15, 0.02, (0, s * 0.355, 0.55), steel, rot=(math.pi / 2, 0, 0), bevel=0.005, seg=24)
        k.box(f"bolt1{s}", (0.05, 0.02, 0.14), (0.02, s * 0.37, 0.6), bolt, rot=(0, -0.45, 0), bevel=0.005)
        k.box(f"bolt2{s}", (0.09, 0.02, 0.04), (0.0, s * 0.37, 0.55), bolt, bevel=0.005)
        k.box(f"bolt3{s}", (0.05, 0.02, 0.14), (-0.02, s * 0.37, 0.49), bolt, rot=(0, -0.45, 0), bevel=0.005)
        for j in range(8):
            a = j * math.pi / 4
            k.sphere(f"capb{s}{j}", 0.012, (math.cos(a) * 0.17, s * 0.352, 0.55 + math.sin(a) * 0.17), gold, seg=8, rings=6)
    k.cyl("coreband", 0.18, 0.09, (0, 0, 0.55), core, rot=(math.pi / 2, 0, 0), bevel=0.01, seg=28)
    k.cyl("coreband_ring1", 0.185, 0.012, (0, 0.06, 0.55), gold, rot=(math.pi / 2, 0, 0), seg=28)
    k.cyl("coreband_ring2", 0.185, 0.012, (0, -0.06, 0.55), gold, rot=(math.pi / 2, 0, 0), seg=28)
    k.cyl("collar", 0.08, 0.1, (0, 0, 0.36), gold, r2=0.05, bevel=0.01, seg=20)
    k.cyl("collarb", 0.05, 0.05, (0, 0, 0.32), steel, seg=16)
    k.crystal("topspike", 0.06, 0.16, (0, 0, 0.72), purple, sides=6)
    for s in (1, -1):
        k.box(f"fin{s}", (0.06, 0.12, 0.05), (0, s * 0.14, 0.4), purple, rot=(s * 0.5, 0, 0), bevel=0.01)
    return k

def run(which, export=True):
    f = dict(banana=banana, freeze=freeze, hook=hook, hammer=hammer)[which]
    k = f(); k.bake()
    names = dict(banana="banana.glb", freeze="weap_icebomb.glb", hook="weap_hook.glb", hammer="weap_hammer.glb")
    print(which, "tris", k.tris())
    if export: k.export(MODELS + "\\" + names[which])
    return k
