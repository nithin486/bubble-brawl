import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import bpy, bb_common as B
from bb_common import *
def prep():
    for o in bpy.data.objects:
        if o.name.startswith(("BH_", "Rig")) and o.type != "CAMERA":
            o.hide_render = True; o.hide_viewport = True
    B.studio((800, 800), 32)
    B.floor(8, -0.001, (0.93, 0.88, 0.97))
def views(name, c=(0, 0, 0.1), d=1.9, lens=60, only=("front", "side", "q3", "back"), sub=None):
    out = []
    import math
    angs = dict(front=(0, -d, 0.15), side=(d, 0, 0.15), q3=(d * 0.7, -d * 0.7, d * 0.45), back=(0, d, 0.2), top=(0, -0.3, d), qb=(-d * 0.7, d * 0.7, d * 0.4))
    for v in only:
        a = angs[v]
        out.append(B.shoot(f"{name}_{v}", (c[0] + a[0], c[1] + a[1], c[2] + a[2]), c, lens=lens, folder=sub))
    return out
