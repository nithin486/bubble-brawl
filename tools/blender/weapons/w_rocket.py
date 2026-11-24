import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, bb_common as B
importlib.reload(B)
from bb_common import *
P = PAL

def build():
    k = Kit("W_Rocket")
    orange = mat("rk_orange", P['orange'], 0.35, 0.0, coat=0.35)
    red = mat("rk_red", P['red'], 0.35, 0.0, coat=0.3)
    cream = mat("rk_cream", P['cream'], 0.4)
    navy = mat("rk_navy", (0.1, 0.1, 0.18), 0.5)
    navyl = mat("rk_navyl", P['navy_l'], 0.5)
    yellow = mat("rk_yellow", P['yellow'], 0.4)
    steel = mat("rk_steel", P['steel'], 0.3, 0.9)
    gold = mat("rk_gold", (1.0, 0.78, 0.3), 0.3, 0.9)
    glass = mat("rk_glass", (0.8, 0.95, 1.0), 0.05, 0.0, alpha=0.3)
    glow = mat("rk_glow", P['orange'], 0.3, 0.0, emit=(1.0, 0.5, 0.1, 3.0))
    pink = mat("rk_pink", P['pink'], 0.4)
    # aerodynamic body: lathe along X, swelling in the middle (rotate Z-axis lathe to X)
    rx = (0, math.pi / 2, 0)
    # lathe local z -> world x
    k.lathe("tube", [(0.0, -0.45), (0.1, -0.44), (0.15, -0.38), (0.17, -0.2), (0.175, 0.0), (0.16, 0.2), (0.13, 0.36), (0.12, 0.45)], (0.0, 0, 0.0), orange, rot=rx, seg=36)
    # muzzle: flared bell with dark inside + gold lip
    k.lathe("muzzle", [(0.12, 0), (0.15, 0.03), (0.19, 0.12), (0.2, 0.17), (0.17, 0.17), (0.12, 0.12), (0.1, 0.05)], (0.45, 0, 0), navyl, rot=rx, seg=36)
    k.torus("muzlip", 0.195, 0.018, (0.62, 0, 0), gold, rot=rx, seg=36, sides=8)
    k.cyl("muzinner", 0.17, 0.005, (0.605, 0, 0), navy, rot=rx, seg=32)
    # hazard stripes near front
    for i in range(8):
        k.cyl(f"haz{i}", 0.17, 0.035, (0.31 + i * 0.0, 0, 0), None, rot=rx) if False else None
    prof = [(-0.45, 0.0), (-0.44, 0.1), (-0.38, 0.15), (-0.2, 0.17), (0.0, 0.175), (0.2, 0.16), (0.36, 0.13), (0.45, 0.12)]
    def rad(x):
        for (x0, r0), (x1, r1) in zip(prof, prof[1:]):
            if x0 <= x <= x1: return r0 + (r1 - r0) * (x - x0) / (x1 - x0)
        return 0.12
    for i in range(6):
        x = 0.2 + i * 0.04
        k.torus(f"stripe{i}", rad(x) + 0.004, 0.011, (x, 0, 0), yellow if i % 2 == 0 else navy, rot=rx, seg=36, sides=6)
    # rear exhaust cone + fins
    k.lathe("exh", [(0.09, 0), (0.115, 0.03), (0.15, 0.1), (0.155, 0.14), (0.125, 0.14), (0.085, 0.08)], (-0.585, 0, 0), navyl, rot=(0, -math.pi / 2, 0), seg=32)
    k.torus("exhlip", 0.152, 0.014, (-0.725, 0, 0), gold, rot=rx, seg=32, sides=8)
    k.sphere("exhglow", 0.1, (-0.6, 0, 0), glow, scale=(0.3, 1, 1), seg=16, rings=10)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        k.box(f"fin{i}", (0.26, 0.022, 0.13), (-0.34, math.sin(a) * 0.2, math.cos(a) * 0.2), red, rot=(a, 0, 0), bevel=0.01)
    # loading window (transparent) with the rocket visible
    k.box("window", (0.34, 0.14, 0.06), (0.0, 0, 0.175), glass, bevel=0.02)
    k.lathe("rocketnose", [(0.0, 0.3), (0.025, 0.26), (0.05, 0.16), (0.055, 0.0), (0.0, 0.0)], (-0.17, 0, 0.17), red, rot=rx, seg=16)
    k.torus("rocketband", 0.054, 0.008, (-0.02, 0, 0.17), cream, rot=rx, seg=16, sides=6)
    k.box("windowframe", (0.38, 0.17, 0.03), (0.0, 0, 0.145), gold, bevel=0.01)
    # loading mechanism: ratchet drum + side lever
    for sgn in (1, -1):
        k.cyl(f"drum{sgn}", 0.09, 0.05, (-0.1, sgn * 0.19, 0.02), steel, rot=(sgn * math.pi / 2, 0, 0), bevel=0.008, seg=20)
        for j in range(6):
            a = j * math.pi / 3
            k.sphere(f"drumbolt{sgn}{j}", 0.014, (-0.1 + math.cos(a) * 0.06, sgn * 0.215, 0.02 + math.sin(a) * 0.06), gold, seg=8, rings=6)
        k.sphere(f"drumhub{sgn}", 0.03, (-0.1, sgn * 0.225, 0.02), red, seg=12, rings=8)
    k.tube("lever", [(-0.1, 0.22, 0.02), (-0.2, 0.26, -0.02), (-0.3, 0.26, -0.03)], 0.014, steel, sides=8)
    k.sphere("leverknob", 0.03, (-0.3, 0.26, -0.03), pink, seg=12, rings=8)
    # warning labels: small coloured plates on both sides
    for sgn in (1, -1):
        k.box(f"warn{sgn}", (0.16, 0.012, 0.07), (0.2, sgn * 0.168, 0.02), yellow, rot=(0, 0, 0), bevel=0.004)
        for j in range(4):
            k.box(f"warnstripe{sgn}{j}", (0.012, 0.014, 0.07), (0.145 + j * 0.037, sgn * 0.17, 0.02), navy, rot=(0, 0.5, 0), bevel=0.0)
    # sight, grips, shoulder pad
    k.box("sight", (0.07, 0.04, 0.05), (0.32, 0, 0.19), navyl, bevel=0.01)
    k.cyl("sightlens", 0.017, 0.02, (0.355, 0, 0.19), glow, rot=rx, seg=12)
    k.box("grip", (0.11, 0.1, 0.26), (-0.12, 0, -0.27), navyl, rot=(0, -0.25, 0), bevel=0.035, seg=4)
    k.box("foregrip", (0.1, 0.09, 0.22), (0.2, 0, -0.26), navyl, rot=(0, 0.2, 0), bevel=0.035, seg=4)
    k.box("foregripcap", (0.11, 0.1, 0.03), (0.23, 0, -0.38), pink, rot=(0, 0.2, 0), bevel=0.01)
    k.box("trigger", (0.025, 0.03, 0.08), (-0.04, 0, -0.17), gold, rot=(0, 0.3, 0), bevel=0.008)
    k.torus("guard", 0.06, 0.009, (0.0, 0, -0.18), navy, rot=(math.pi / 2, 0, 0), seg=16, sides=6)
    k.box("pad", (0.07, 0.2, 0.24), (-0.75, 0, 0.0), pink, bevel=0.025, seg=3)
    # rivets along seam
    for x in (-0.3, -0.15, 0.0, 0.15, 0.3):
        for sgn in (1, -1):
            k.sphere(f"rv{x}{sgn}", 0.012, (x, sgn * 0.176, 0.1), gold, seg=8, rings=6)
    return k

def run(export=True):
    k = build(); k.bake()
    print("rocket tris", k.tris())
    if export: k.export(MODELS + r"\weap_rocketl.glb")
    return k
