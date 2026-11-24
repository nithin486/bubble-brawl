exec(open(r"C:\Users\User\Desktop\bubble-brawl\tools\blender\weapons\stage.py").read())
import os
OUTW = ROOT + r"\assets\phase2\renders\weapons"
os.makedirs(OUTW, exist_ok=True)
# collection, label, centre, distance, floor z, close-up (target, distance)
SET = {
    "blaster": ("W_Blaster", (0.22, 0, 0.05), 1.9, -0.42, ((-0.04, 0, 0.3), 0.8)),
    "rocket": ("W_Rocket", (-0.1, 0, 0.0), 2.4, -0.42, ((0.45, 0, 0.0), 0.9)),
    "banana": ("W_Banana", (0, 0, 0.17), 1.5, 0.0, ((0.0, 0, 0.3), 0.6)),
    "freeze": ("W_Freeze", (0, 0, 0.26), 1.3, 0.0, ((0, 0, 0.22), 0.6)),
    "hook": ("W_Hook", (0.3, 0, 0.1), 2.0, -0.38, ((0.7, 0, 0.0), 0.8)),
    "hammer": ("W_Hammer", (0, 0, 0.1), 2.3, -0.56, ((0, 0, 0.55), 0.9)),
}


def shoot_weapon(key, views=("front", "side", "q3", "back", "close")):
    col, c, d, fz, close = SET[key]
    B.show_only(col)
    B.floor(10, fz, (0.93, 0.88, 0.97))
    angs = dict(front=(0, -1, 0.12), side=(1, 0, 0.12), q3=(0.72, -0.72, 0.42), back=(0, 1, 0.18))
    for v in views:
        if v == "close":
            t, dd = close
            loc = (t[0] + dd * 0.7, t[1] - dd * 0.7, t[2] + dd * 0.35)
            B.shoot(f"{key}_close", loc, t, lens=70, folder=OUTW, res=(640, 640))
        else:
            a = angs[v]
            B.shoot(f"{key}_{v}", (c[0] + a[0] * d, c[1] + a[1] * d, c[2] + a[2] * d), c, lens=60, folder=OUTW, res=(640, 640))
