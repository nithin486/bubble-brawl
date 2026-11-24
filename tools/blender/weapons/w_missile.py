import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, bb_common as B
importlib.reload(B)
from bb_common import *
P = PAL


def build():
    """The rocket the launcher fires: a fat cartoon missile pointing along +X, ~0.62 m long."""
    k = Kit("W_Missile")
    red = mat("ms_red", P['red'], 0.3, 0.0, coat=0.5)
    cream = mat("ms_cream", P['cream'], 0.4)
    navy = mat("ms_navy", (0.1, 0.1, 0.18), 0.5)
    orange = mat("ms_orange", P['orange'], 0.3, 0.0, coat=0.3)
    yellow = mat("ms_yellow", P['yellow'], 0.4)
    glow = mat("ms_glow", (1.0, 0.6, 0.15), 0.3, 0.0, emit=(1.0, 0.55, 0.1, 5.0))
    rx = (0, math.pi / 2, 0)
    k.lathe("body", [(0.0, -0.3), (0.07, -0.29), (0.115, -0.22), (0.13, -0.05), (0.13, 0.1), (0.1, 0.2), (0.0, 0.32)], (0, 0, 0), red, rot=rx, seg=20)
    k.lathe("nose", [(0.1, 0.2), (0.07, 0.26), (0.0, 0.34)], (0, 0, 0), cream, rot=rx, seg=20)
    for i, z in enumerate((-0.06, 0.04)):
        k.torus(f"band{i}", 0.131, 0.014, (z, 0, 0), yellow if i == 0 else cream, rot=rx, seg=20, sides=6)
    k.sphere("window", 0.045, (0.08, 0, 0.115), cream, scale=(1.2, 1, 0.6), seg=10, rings=8)
    k.lathe("nozzle", [(0.07, 0), (0.09, -0.04), (0.1, -0.08)], (-0.28, 0, 0), navy, rot=(0, -math.pi / 2, 0), seg=16)
    k.sphere("flame", 0.07, (-0.34, 0, 0), glow, scale=(1.5, 1, 1), seg=10, rings=8)
    for i in range(4):
        a = i * math.pi / 2
        k.box(f"fin{i}", (0.16, 0.012, 0.09), (-0.2, math.sin(a) * 0.15, math.cos(a) * 0.15), navy, rot=(a, 0, 0), bevel=0.004)
    return k


def run():
    k = build(); k.bake()
    print("missile tris", k.tris())
    k.export(MODELS + r"\weap_missile.glb")
    return k
