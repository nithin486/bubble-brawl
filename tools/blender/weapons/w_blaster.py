import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, bb_common as B
importlib.reload(B)
from bb_common import *
P = PAL

def build():
    k = Kit("W_Blaster")
    pink = mat("bl_pink", P['pink'], 0.32, 0.0, coat=0.4)
    pinkd = mat("bl_pinkd", P['pink_d'], 0.4)
    aqua = mat("bl_aqua", P['aqua'], 0.3, 0.0, coat=0.3)
    cream = mat("bl_cream", P['cream'], 0.45)
    navy = mat("bl_navy", P['navy'], 0.5)
    gold = mat("bl_gold", (1.0, 0.78, 0.3), 0.28, 0.9)
    steel = mat("bl_steel", P['steel'], 0.3, 0.85)
    glass = mat("bl_glass", P['aqua_l'], 0.05, 0.0, alpha=0.28, spec=1.0)
    glow = mat("bl_glow", P['aqua'], 0.3, 0.0, emit=(0.25, 0.9, 1.0, 3.0))
    glow2 = mat("bl_glow2", P['pink'], 0.3, 0.0, emit=(1.0, 0.4, 0.8, 3.0))
    film = mat("bl_film", (0.8, 0.95, 1.0), 0.02, 0.0, alpha=0.22, spec=1.0)
    red = mat("bl_red", P['red'], 0.4)
    navy_l = mat("bl_navyl", P['navy_l'], 0.5)
    # main body (sculpted: stacked rounded boxes)
    k.box("body", (0.62, 0.17, 0.2), (0.06, 0, 0.04), pink, bevel=0.055, seg=4)
    k.box("belly", (0.5, 0.2, 0.09), (0.04, 0, -0.07), pinkd, bevel=0.04, seg=3)
    k.box("topplate", (0.32, 0.13, 0.04), (0.2, 0, 0.155), cream, bevel=0.015)
    # rear cap
    k.sphere("rear", 0.1, (-0.27, 0, 0.04), pink, scale=(1.0, 0.9, 1.05))
    k.cyl("rearring", 0.1, 0.03, (-0.2, 0, 0.04), gold, rot=(0, math.pi / 2, 0), r2=0.1, bevel=0.005)
    # bubble chamber on top (glass dome, glowing bubbles inside)
    k.cyl("chbase", 0.15, 0.05, (-0.04, 0, 0.17), navy, bevel=0.01)
    k.torus("chring", 0.145, 0.018, (-0.04, 0, 0.2), gold, seg=32, sides=8)
    k.sphere("chamber", 0.145, (-0.04, 0, 0.3), glass, seg=28, rings=18)
    rnd = random.Random(7)
    for i, (x, y, z, r, mm) in enumerate([(-0.04, 0, 0.27, 0.05, glow), (0.0, 0.05, 0.32, 0.038, glow2), (-0.08, -0.04, 0.34, 0.034, glow),
                                           (-0.02, -0.05, 0.25, 0.03, glow2), (-0.07, 0.05, 0.27, 0.028, glow2), (-0.03, 0.01, 0.38, 0.025, glow), (0.02, 0.0, 0.22, 0.022, glow)]):
        k.sphere(f"bub{i}", r, (x, y, z), mm, seg=14, rings=10)
    k.cyl("chcap", 0.05, 0.05, (-0.04, 0, 0.45), gold, bevel=0.01)
    k.sphere("chknob", 0.028, (-0.04, 0, 0.485), pink)
    # barrel + flared nozzle with a bubble-wand ring
    k.cyl("barrel", 0.065, 0.34, (0.46, 0, 0.05), steel, rot=(0, math.pi / 2, 0), bevel=0.008)
    k.lathe("bell", [(0.06, 0), (0.075, 0.02), (0.1, 0.1), (0.125, 0.2), (0.12, 0.23)], (0.52, 0, 0.05), aqua, rot=(0, math.pi / 2, 0), seg=28)
    k.torus("wand", 0.115, 0.017, (0.77, 0, 0.05), gold, rot=(0, math.pi / 2, 0), seg=32, sides=8)
    k.cyl("filmdisc", 0.114, 0.004, (0.77, 0, 0.05), film, rot=(0, math.pi / 2, 0), seg=32)
    k.torus("nozglow", 0.098, 0.012, (0.745, 0, 0.05), glow, rot=(0, math.pi / 2, 0), seg=32, sides=6)
    for i in range(3):
        k.torus(f"band{i}", 0.073, 0.011, (0.38 + i * 0.07, 0, 0.05), cream, rot=(0, math.pi / 2, 0), seg=24, sides=6)
    # feed pipe chamber -> barrel
    k.tube("pipe", [(0.06, 0, 0.22), (0.14, 0, 0.26), (0.28, 0, 0.2), (0.42, 0, 0.1)], 0.018, gold, sides=8)
    # side air tank under barrel
    k.lathe("tank", [(0.0, -0.13), (0.06, -0.12), (0.075, -0.05), (0.075, 0.1), (0.06, 0.17), (0.0, 0.185)], (0.28, 0, -0.1), aqua, rot=(0, math.pi / 2, 0), seg=24)
    k.torus("tankring", 0.076, 0.012, (0.3, 0, -0.1), gold, rot=(0, math.pi / 2, 0), seg=24, sides=6)
    # grip, trigger, guard
    g = k.box("grip", (0.13, 0.12, 0.3), (-0.07, 0, -0.2), navy, rot=(0, -0.28, 0), bevel=0.04, seg=4)
    k.box("gripcap", (0.14, 0.125, 0.04), (-0.14, 0, -0.35), pink, rot=(0, -0.28, 0), bevel=0.015)
    for i in range(5):
        t = -0.1 + i * 0.05
        k.box(f"gripridge{i}", (0.145, 0.126, 0.014), (-0.07 - 0.276 * t, 0, -0.2 + 0.96 * t), navy_l, rot=(0, -0.28, 0), bevel=0.003)
    k.box("trigger", (0.03, 0.03, 0.09), (0.06, 0, -0.1), gold, rot=(0, 0.35, 0), bevel=0.01)
    k.torus("guard", 0.07, 0.01, (0.12, 0, -0.11), navy, rot=(math.pi / 2, 0, 0), seg=20, sides=6)
    # pressure gauges (both sides)
    for sgn in (1, -1):
        k.cyl(f"gaugebase{sgn}", 0.058, 0.03, (0.14, sgn * 0.095, 0.07), gold, rot=(sgn * math.pi / 2, 0, 0), bevel=0.006)
        k.cyl(f"gaugeface{sgn}", 0.046, 0.012, (0.14, sgn * 0.114, 0.07), cream, rot=(sgn * math.pi / 2, 0, 0), bevel=0.002)
        k.box(f"needle{sgn}", (0.005, 0.004, 0.036), (0.14, sgn * 0.122, 0.082), red, rot=(0, 0.6 * sgn, 0), bevel=0.0)
    # decorative bolts + sight
    for x in (-0.15, 0.0, 0.2, 0.3):
        for sgn in (1, -1):
            k.sphere(f"bolt{x}{sgn}", 0.011, (x, sgn * 0.086, 0.0), gold, seg=8, rings=6)
    k.box("sight", (0.05, 0.03, 0.05), (0.32, 0, 0.2), pinkd, bevel=0.01)
    k.sphere("sightbub", 0.018, (0.32, 0, 0.245), glow, seg=10, rings=8)
    return k

def run(render=False, export=True):
    k = build()
    k.bake()
    k.tris_ = k.tris()
    print("blaster tris", k.tris_)
    if export:
        k.export(MODELS + r"\weap_bubblegun.glb")
    return k
