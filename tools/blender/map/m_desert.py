"""Phase 3: Desert Outpost pieces (own work). Headless:
blender --background --factory-startup --python tools/blender/map/m_desert.py -- [piece ...]
Z up, metres, base at z=0 (ledge / rim: top at z=0). Footprints of cover pieces match the collision in shared/config/maps.ts."""
import sys, math, random
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender\map")
from m_common import *
import bmesh
from mathutils import Vector, noise as mnoise

# linear-space palette
SAND = (0.62, 0.33, 0.14); SANDL = (0.80, 0.52, 0.26); SANDD = (0.40, 0.18, 0.075); ADOBE = (0.72, 0.40, 0.19); ADOBE2 = (0.82, 0.57, 0.34)
ROCK = (0.50, 0.20, 0.075); ROCKL = (0.70, 0.36, 0.15); WOOD = (0.20, 0.085, 0.03); WOODL = (0.40, 0.20, 0.07)
TEAL = (0.02, 0.28, 0.28); RED = (0.55, 0.045, 0.025); CREAM = (0.90, 0.76, 0.50); GOLD = (0.9, 0.52, 0.06)
GREEN = (0.055, 0.25, 0.07); GREENL = (0.13, 0.40, 0.09); PINK = (0.85, 0.07, 0.22); CLAY = (0.48, 0.14, 0.05); DARK = (0.045, 0.02, 0.012); ROPE = (0.45, 0.28, 0.11)
STRAW = (0.66, 0.46, 0.13)


def m(name, c, rough=0.8):
    return mat("D_" + name, c, rough)


def blocks(k, prefix, w, d, z0, courses, ch, mats, rnd, taper=0.0, bw=0.9, cx=0.0, cy=0.0, bevel=0.0):
    """Hollow rectangle of stone courses (outer size w x d), each block slightly different."""
    for c in range(courses):
        f = 1.0 - taper * c / max(courses, 1)
        W, D = w * f, d * f
        z = z0 + c * ch + ch / 2
        for side, (ln, off, rz) in enumerate(((W, D / 2, 0), (W, -D / 2, 0), (D, W / 2, 1), (D, -W / 2, 1))):
            n = max(1, round(ln / bw))
            step = ln / n
            for i in range(n):
                t = -ln / 2 + step * (i + 0.5)
                th = 0.34 + rnd.uniform(-0.03, 0.05)
                inset = off - math.copysign(th / 2, off)
                loc = (cx + t, cy + inset, z) if rz == 0 else (cx + inset, cy + t, z)
                size = (step - 0.035, th, ch - 0.035) if rz == 0 else (th, step - 0.035, ch - 0.035)
                k.box(f"{prefix}{c}_{side}_{i}", size, loc, mats[rnd.randrange(len(mats))], bevel=bevel, seg=1)


def awning(k, name, w, d, z, y, drop, a, b, n=8, x=0.0):
    """Striped sloped canvas with a scalloped front edge."""
    sw = w / n
    ang = math.atan2(drop, d)
    for i in range(n):
        cx = x - w / 2 + sw * (i + 0.5)
        mm = a if i % 2 == 0 else b
        k.box(f"{name}s{i}", (sw, math.hypot(d, drop), 0.06), (cx, y - d / 2, z - drop / 2), mm, rot=(ang, 0, 0), bevel=0.0, smooth=False)
        k.cyl(f"{name}f{i}", sw / 2, 0.05, (cx, y - d, z - drop - 0.02), mm, rot=(math.pi / 2, 0, 0), seg=10)


def pot(k, name, x, y, z, s, mm, band):
    prof = [(0.0, 0.0), (0.22, 0.0), (0.38, 0.18), (0.42, 0.38), (0.30, 0.62), (0.18, 0.74), (0.24, 0.86), (0.20, 0.88), (0.0, 0.80)]
    k.lathe(name, [(r * s, h * s) for r, h in prof], (x, y, z), mm, seg=12)
    k.torus(name + "b", 0.40 * s, 0.035 * s, (x, y, z + 0.37 * s), band, seg=12, sides=4)


def flag(k, name, x, y, z, h, mm):
    k.cyl(name + "p", 0.05, h, (x, y, z + h / 2), m("wood", WOOD), seg=6)
    bm = bmesh.new()
    pts = [(0, 0, 0), (0.55, 0, -0.05), (1.15, 0, -0.22), (0.55, 0, -0.45), (0, 0, -0.55)]
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs)
    bm.faces.new([bm.verts.new((p[0], 0.012, p[2])) for p in reversed(pts)])
    o = k.mesh(name, bm, mm, smooth=False)
    o.location = (x, y, z + h - 0.02)
    k.sphere(name + "k", 0.09, (x, y, z + h + 0.05), m("gold", GOLD, 0.35), seg=8, rings=5)


def wall():
    k = Kit("D_Wall"); rnd = random.Random(2)
    a, b, c = m("s1", SAND), m("s2", SANDL), m("s3", SANDD)
    for row, (z, ch, off) in enumerate(((0.17, 0.34, 0), (0.50, 0.32, 0.5))):
        edges = [-1.4, -0.7, 0.0, 0.7, 1.4] if not off else [-1.4, -1.05, -0.35, 0.35, 1.05, 1.4]
        for i in range(len(edges) - 1):
            x0, x1 = edges[i], edges[i + 1]
            k.box(f"b{row}{i}", (x1 - x0 - 0.04, 0.62 + rnd.uniform(-0.04, 0.05), ch - 0.03), ((x0 + x1) / 2, 0, z), (a, b)[rnd.randrange(2)], bevel=0.06, seg=1)
    for i, x in enumerate((-0.94, 0.0, 0.94)):
        k.box(f"cap{i}", (0.92, 0.76, 0.16), (x, 0, 0.75), b, bevel=0.06, seg=2)
    for i, x in enumerate((-1.33, 1.33)):
        k.box(f"post{i}", (0.30, 0.74, 0.30), (x, 0, 0.95), c, bevel=0.07, seg=2)
    return k, make_vary(0, 1.1, ao=0.28, noise=0.14)


def tower():
    k = Kit("D_Tower"); rnd = random.Random(5)
    s = [m("s1", SAND), m("s2", SANDL), m("s1", SAND)]
    blocks(k, "c", 3.8, 3.8, 0, 9, 0.52, s, rnd, taper=0.2, bw=0.95)
    k.box("core", (2.5, 2.5, 4.6), (0, 0, 2.3), m("s3", SANDD), bevel=0.0)
    k.box("ledge", (4.2, 4.2, 0.34), (0, 0, 4.85), m("s2", SANDL), bevel=0.1, seg=2)
    wl = m("woodl", WOODL); wd = m("wood", WOOD)
    k.box("deck", (4.6, 4.6, 0.18), (0, 0, 5.1), wl, bevel=0.04)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box(f"post{sx}{sy}", (0.24, 0.24, 2.5), (sx * 1.9, sy * 1.9, 6.4), wd, bevel=0.04, seg=1)
            k.box(f"brace{sx}{sy}", (0.14, 0.14, 1.5), (sx * 2.0, sy * 1.2, 4.55), wd, rot=(sy * 0.75, 0, 0), bevel=0.02, seg=1)
    for a in range(4):
        ang = a * math.pi / 2
        cx, cy = math.cos(ang) * 2.15, math.sin(ang) * 2.15
        rail = (0.12, 4.4, 0.14) if a % 2 == 0 else (4.4, 0.12, 0.14)
        k.box(f"rail{a}", rail, (cx, cy, 5.9), wl, bevel=0.03, seg=1)
        for j in (-1.1, 0, 1.1):
            px, py = (cx, j) if a % 2 == 0 else (j, cy)
            k.box(f"bal{a}{j}", (0.1, 0.1, 0.75), (px, py, 5.55), wd, bevel=0.0, smooth=False)
    # striped four-sided canvas roof
    red, cream = m("red", RED), m("cream", CREAM)
    for i in range(4):
        r0, r1 = 3.3 - i * 0.8, 3.3 - (i + 1) * 0.8
        k.cyl(f"roof{i}", r0, 0.42, (0, 0, 7.75 + i * 0.4), red if i % 2 == 0 else cream, rot=(0, 0, math.pi / 4), seg=4, r2=max(r1, 0.05), smooth=False)
    flag(k, "flag", 0, 0, 9.2, 1.7, m("teal", TEAL))
    # door, slit windows, ladder
    dk = m("dark", DARK)
    k.box("door", (1.0, 0.12, 1.7), (0, -1.9, 0.85), wd, bevel=0.03)
    k.cyl("doortop", 0.5, 0.12, (0, -1.9, 1.7), wd, rot=(math.pi / 2, 0, 0), seg=14)
    for z in (2.9, 3.9):
        for sx in (-0.7, 0.7):
            k.box(f"win{z}{sx}", (0.28, 0.14, 0.55), (sx, -1.9 + z * 0.075, z), dk, bevel=0.05, seg=1)
    for sx in (-0.32, 0.32):
        k.box(f"lad{sx}", (0.1, 0.1, 5.2), (2.15, sx, 2.55), wl, rot=(0, -0.07, 0), bevel=0.0, smooth=False)
    for i in range(10):
        k.box(f"rung{i}", (0.08, 0.7, 0.08), (2.33 - i * 0.036, 0, 0.35 + i * 0.5), wl, bevel=0.0, smooth=False)
    return k, make_vary(0, 9, ao=0.22, noise=0.12)


def adobe_box(k, name, w, d, h, z, mm, trim, cx=0.0, cy=0.0):
    k.box(name, (w, d, h), (cx, cy, z + h / 2), mm, bevel=0.22, seg=2)
    k.box(name + "p", (w + 0.24, d + 0.24, 0.26), (cx, cy, z + h - 0.12), trim, bevel=0.1, seg=2)
    n = max(3, int(w / 0.9))
    for i in range(n):
        x = cx - w / 2 + 0.35 + i * (w - 0.7) / (n - 1)
        k.box(f"{name}c{i}", (0.4, 0.34, 0.36), (x, cy - d / 2 + 0.12, z + h + 0.12), trim, bevel=0.08, seg=1)
        k.box(f"{name}d{i}", (0.4, 0.34, 0.36), (x, cy + d / 2 - 0.12, z + h + 0.12), trim, bevel=0.08, seg=1)
        k.cyl(f"{name}v{i}", 0.12, 0.5, (x, cy - d / 2 - 0.18, z + h - 0.55), m("wood", WOOD), rot=(math.pi / 2, 0, 0), seg=8)


def window(k, name, x, y, z, w=0.7, h=0.9):
    k.box(name + "f", (w + 0.2, 0.12, h + 0.2), (x, y, z), m("s2", SANDL), bevel=0.05, seg=1)
    k.box(name + "g", (w, 0.14, h), (x, y - 0.01, z), m("dark", DARK), bevel=0.02, seg=1)
    for sx in (-1, 1):
        k.box(f"{name}s{sx}", (w * 0.45, 0.08, h), (x + sx * (w * 0.74), y - 0.06, z), m("teal", TEAL), bevel=0.02, seg=1)
    k.box(name + "l", (w + 0.35, 0.24, 0.1), (x, y - 0.05, z - h / 2 - 0.13), m("woodl", WOODL), bevel=0.02, seg=1)


def door(k, name, x, y, w=1.15, h=1.9):
    k.box(name + "f", (w + 0.36, 0.14, h), (x, y, h / 2), m("s2", SANDL), bevel=0.05, seg=1)
    k.cyl(name + "a", (w + 0.36) / 2, 0.14, (x, y, h), m("s2", SANDL), rot=(math.pi / 2, 0, 0), seg=16)
    k.box(name + "d", (w, 0.18, h), (x, y - 0.02, h / 2), m("teal", TEAL), bevel=0.03, seg=1)
    k.cyl(name + "t", w / 2, 0.18, (x, y - 0.02, h), m("teal", TEAL), rot=(math.pi / 2, 0, 0), seg=16)
    for sx in (-0.28, 0.0, 0.28):
        k.box(f"{name}p{sx}", (0.04, 0.2, h * 0.95), (x + sx, y - 0.03, h / 2), m("wood", WOOD), bevel=0.0, smooth=False)
    k.sphere(name + "k", 0.07, (x + 0.35, y - 0.14, h * 0.5), m("gold", GOLD, 0.35), seg=8, rings=5)


def house():
    k = Kit("D_House")
    a, t = m("adobe", ADOBE), m("s2", SANDL)
    adobe_box(k, "main", 5.6, 4.2, 3.3, 0, a, t)
    adobe_box(k, "up", 2.8, 3.0, 1.9, 3.3, m("adobe2", ADOBE2), t, cx=-1.2, cy=0.4)
    door(k, "door", 1.2, -2.12)
    window(k, "w1", -1.3, -2.12, 1.65)
    window(k, "w2", -1.2, -1.12, 4.3, 0.6, 0.65)
    awning(k, "aw", 2.4, 1.3, 2.75, -2.15, 0.45, m("red", RED), m("cream", CREAM), 6, x=1.2)
    for sx in (0.1, 2.3):
        k.cyl(f"pole{sx}", 0.06, 2.3, (sx, -3.35, 1.15), m("wood", WOOD), seg=6)
    pot(k, "p1", -2.4, -2.55, 0, 1.0, m("clay", CLAY), m("cream", CREAM))
    pot(k, "p2", -1.75, -2.75, 0, 0.7, m("clay", CLAY), m("teal", TEAL))
    pot(k, "p3", 1.9, 0.9, 3.35, 0.8, m("clay", CLAY), m("cream", CREAM))
    return k, make_vary(0, 5.4, ao=0.25, noise=0.1)


def house_dome():
    k = Kit("D_HouseDome")
    a, t = m("adobe2", ADOBE2), m("s2", SANDL)
    adobe_box(k, "main", 4.6, 4.6, 3.0, 0, a, t)
    k.cyl("drum", 1.6, 0.6, (0, 0, 3.35), m("adobe", ADOBE), seg=20)
    k.lathe("dome", [(1.55, 0.0), (1.5, 0.45), (1.2, 1.0), (0.7, 1.4), (0.18, 1.6), (0.0, 1.62)], (0, 0, 3.6), m("teal", TEAL, 0.45), seg=20)
    k.torus("band", 1.55, 0.09, (0, 0, 3.62), m("gold", GOLD, 0.35), seg=24, sides=6)
    k.cyl("spire", 0.05, 0.8, (0, 0, 5.55), m("gold", GOLD, 0.35), seg=6)
    k.sphere("ball", 0.16, (0, 0, 5.75), m("gold", GOLD, 0.35), seg=10, rings=6)
    door(k, "door", 0, -2.32, 1.2, 1.7)
    for sx in (-1.5, 1.5):
        window(k, f"w{sx}", sx, -2.32, 1.55, 0.45, 0.8)
    pot(k, "p1", 1.7, -2.8, 0, 0.9, m("clay", CLAY), m("cream", CREAM))
    return k, make_vary(0, 5.2, ao=0.25, noise=0.1)


def arch():
    k = Kit("D_Arch"); rnd = random.Random(8)
    s = [m("s1", SAND), m("s2", SANDL)]
    for sx in (-3.0, 3.0):
        blocks(k, f"p{sx}", 1.5, 1.5, 0, 8, 0.5, s, rnd, taper=0.08, bw=0.75, cx=sx)
        k.box(f"pc{sx}", (1.0, 1.0, 4.0), (sx, 0, 2.0), m("s3", SANDD), bevel=0.0)
        k.box(f"cap{sx}", (1.8, 1.8, 0.3), (sx, 0, 4.15), s[1], bevel=0.1, seg=2)
        flag(k, f"fl{sx}", sx, 0, 4.3, 1.6, m("red", RED))
    n = 13
    for i in range(n):
        ang = math.pi * (i + 0.5) / n
        r = 2.55
        k.box(f"a{i}", (0.62, 0.95, 0.66), (math.cos(ang) * r, 0, 3.1 + math.sin(ang) * r * 0.75), s[i % 2], rot=(0, math.pi / 2 - ang, 0), bevel=0.08, seg=1)
    for sx, c in ((-1.3, TEAL), (1.3, TEAL), (0.0, RED)):
        z = 4.0 if sx == 0 else 3.6
        name = "red" if c == RED else "teal"
        k.box(f"ban{sx}", (0.8, 0.06, 1.1), (sx, -0.55, z), m(name, c), bevel=0.0, smooth=False)
        k.cyl(f"tip{sx}", 0.4, 0.06, (sx, -0.55, z - 0.55), m(name, c), rot=(math.pi / 2, 0, 0), seg=3, smooth=False)
        k.torus(f"em{sx}", 0.2, 0.04, (sx, -0.61, z), m("gold", GOLD, 0.35), rot=(math.pi / 2, 0, 0), seg=12, sides=4)
    return k, make_vary(0, 5.5, ao=0.25, noise=0.13)


def stall():
    k = Kit("D_Stall"); rnd = random.Random(9)
    wd, wl = m("wood", WOOD), m("woodl", WOODL)
    for sx in (-1.6, 1.6):
        k.box(f"pf{sx}", (0.16, 0.16, 2.3), (sx, -0.9, 1.15), wd, bevel=0.03, seg=1)
        k.box(f"pb{sx}", (0.16, 0.16, 2.9), (sx, 0.9, 1.45), wd, bevel=0.03, seg=1)
    awning(k, "aw", 3.8, 2.5, 3.0, 1.15, 0.65, m("teal", TEAL), m("cream", CREAM), 9)
    k.box("counter", (3.3, 0.9, 0.18), (0, -0.7, 1.0), wl, bevel=0.04, seg=1)
    for i in range(6):
        k.box(f"plank{i}", (0.5, 0.08, 0.9), (-1.38 + i * 0.55, -1.1, 0.48), wl if i % 2 else wd, bevel=0.02, seg=1)
    fruit = [m("red", RED), m("gold", GOLD, 0.5), m("greenl", GREENL), m("pink", PINK)]
    for b in range(3):
        bx = -1.05 + b * 1.05
        k.box(f"tray{b}", (0.9, 0.7, 0.16), (bx, -0.7, 1.15), wd, bevel=0.03, seg=1)
        for i in range(11):
            k.sphere(f"fr{b}_{i}", 0.12, (bx + rnd.uniform(-0.32, 0.32), -0.7 + rnd.uniform(-0.24, 0.24), 1.28 + rnd.uniform(0, 0.1)), fruit[b], seg=8, rings=5)
    for i, (x, y, sc) in enumerate(((-1.2, 0.5, 1.1), (1.25, 0.35, 0.85), (0.5, 0.7, 0.7))):
        pot(k, f"pot{i}", x, y, 0, sc, m("clay", CLAY), m("cream", CREAM))
    k.box("rug", (3.0, 1.2, 0.04), (0, -1.85, 0.02), m("red", RED), bevel=0.0, smooth=False)
    k.box("rug2", (2.5, 0.8, 0.05), (0, -1.85, 0.025), m("cream", CREAM), bevel=0.0, smooth=False)
    k.box("rug3", (1.9, 0.35, 0.06), (0, -1.85, 0.03), m("teal", TEAL), bevel=0.0, smooth=False)
    return k, make_vary(0, 3.0, ao=0.22, noise=0.08)


def bridge():
    """Plank walkway, 10 m along X, deck top at z=0, rope rails."""
    k = Kit("D_Bridge"); rnd = random.Random(3)
    wd, wl, rp = m("wood", WOOD), m("woodl", WOODL), m("rope", ROPE)
    L, n = 10.0, 20
    sag = lambda x: -0.35 * (1 - (2 * x / L) ** 2)
    for i in range(n):
        x = -L / 2 + (i + 0.5) * L / n
        k.box(f"pl{i}", (L / n - 0.07, 2.0 + rnd.uniform(-0.12, 0.12), 0.12), (x, rnd.uniform(-0.04, 0.04), sag(x) - 0.06), wl if i % 3 else wd, rot=(0, 0, rnd.uniform(-0.03, 0.03)), bevel=0.02, seg=1)
    for sy in (-1.0, 1.0):
        k.tube(f"rail{sy}", [(-L / 2 + j * L / 8, sy, sag(-L / 2 + j * L / 8) + 0.95) for j in range(9)], 0.055, rp, sides=5)
        k.tube(f"under{sy}", [(-L / 2 + j * L / 8, sy * 0.85, sag(-L / 2 + j * L / 8) - 0.18) for j in range(9)], 0.07, rp, sides=5)
        for j in range(5):
            x = -L / 2 + j * L / 4
            h = 1.35 if j in (0, 4) else 0.95
            k.box(f"po{sy}{j}", (0.18 if j in (0, 4) else 0.08, 0.18 if j in (0, 4) else 0.08, h), (x, sy, sag(x) + h / 2 - 0.1), wd, bevel=0.02, seg=1)
    return k, make_vary(-0.5, 1.5, ao=0.2, noise=0.14)


def pots():
    k = Kit("D_Pots")
    pot(k, "a", -0.22, 0.05, 0, 0.78, m("clay", CLAY), m("cream", CREAM))
    pot(k, "b", 0.3, -0.12, 0, 0.55, m("s2", SANDL), m("teal", TEAL))
    pot(k, "c", 0.15, 0.32, 0, 0.42, m("clay", CLAY), m("gold", GOLD, 0.4))
    return k, make_vary(0, 0.7, ao=0.3, noise=0.07)


def rib_tube(k, name, pts, radii, mm, ribs=9):
    """A ribbed cactus limb: star-shaped cross-section swept along pts, rounded tip."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new(); rings = []; n = len(pts); sides = ribs * 2
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
        a = t.cross(ref).normalized(); b = t.cross(a).normalized()
        r = radii[i]
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * j / sides) + b * math.sin(2 * math.pi * j / sides)) * r * (1.0 if j % 2 == 0 else 0.82)) for j in range(sides)])
    for i in range(n - 1):
        for j in range(sides):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % sides], rings[i + 1][(j + 1) % sides], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    k.mesh(name, bm, mm, smooth=False)


def flower(k, name, x, y, z, s=1.0):
    for i in range(5):
        a = i * 2 * math.pi / 5
        k.sphere(f"{name}{i}", 0.1 * s, (x + math.cos(a) * 0.1 * s, y + math.sin(a) * 0.1 * s, z), m("pink", PINK, 0.6), scale=(1, 1, 0.5), seg=5, rings=3)
    k.sphere(name + "c", 0.07 * s, (x, y, z + 0.04 * s), m("gold", GOLD, 0.5), seg=5, rings=3)


def cactus():
    k = Kit("D_Cactus")
    g = m("green", GREEN, 0.7)
    rib_tube(k, "trunk", [(0, 0, 0), (0, 0, 0.5), (0, 0, 1.6), (0, 0, 2.6), (0, 0, 3.0), (0, 0, 3.17)], [0.30, 0.34, 0.33, 0.30, 0.2, 0.05], g, 10)
    rib_tube(k, "armr", [(0.2, 0, 1.25), (0.65, 0, 1.3), (0.82, 0, 1.55), (0.84, 0, 2.15), (0.84, 0, 2.38), (0.84, 0, 2.48)], [0.18, 0.2, 0.21, 0.19, 0.12, 0.03], g, 8)
    rib_tube(k, "arml", [(-0.2, 0, 1.75), (-0.55, 0, 1.8), (-0.68, 0, 2.0), (-0.7, 0, 2.45), (-0.7, 0, 2.62), (-0.7, 0, 2.7)], [0.15, 0.17, 0.17, 0.15, 0.1, 0.03], g, 8)
    flower(k, "f1", 0, 0, 3.2, 1.2); flower(k, "f2", 0.84, 0, 2.52)
    for i, (x, y, r) in enumerate(((0.42, -0.25, 0.2), (-0.38, 0.22, 0.15))):
        rib_tube(k, f"pup{i}", [(x, y, 0), (x, y, r), (x, y, r * 1.7), (x, y, r * 2.0)], [r * 0.7, r, r * 0.6, 0.02], m("greenl", GREENL, 0.7), 8)
    return k, make_vary(0, 3.2, ao=0.35, noise=0.1)


def prickly():
    k = Kit("D_Prickly"); rnd = random.Random(12)
    g, gl = m("green", GREEN, 0.7), m("greenl", GREENL, 0.7)
    pads = [((0, 0, 0.42), 0.42, 0.1, 0.0), ((-0.38, 0.05, 0.95), 0.34, 0.55, 0.5), ((0.36, -0.04, 1.0), 0.36, -0.5, -0.4),
            ((-0.62, 0.02, 1.45), 0.24, 0.8, 0.2), ((0.2, 0.06, 1.52), 0.28, -0.1, 0.9), ((0.7, -0.08, 1.46), 0.22, -0.7, -0.8)]
    for i, (p, r, tilt, yaw) in enumerate(pads):
        k.sphere(f"pad{i}", r, p, g if i % 2 == 0 else gl, scale=(0.82, 0.28, 1.15), rot=(0, tilt, yaw), seg=9, rings=6)
        if i >= 4:
            flower(k, f"fl{i}", p[0] + math.sin(tilt) * r * 1.15, p[1], p[2] + math.cos(tilt) * r * 1.15, 0.75)
    for i in range(7):
        a = i * 0.9
        k.sphere(f"st{i}", rnd.uniform(0.09, 0.17), (math.cos(a) * 0.62, math.sin(a) * 0.5, 0.06), m("s3", SANDD), scale=(1.2, 1, 0.7), seg=5, rings=3, smooth=False)
    return k, make_vary(0, 1.8, ao=0.35, noise=0.1)


def strata(p, t):
    """Horizontal sandstone bands, slightly wavy."""
    z = p.z + 0.18 * mnoise.noise(Vector((p.x * 0.45, p.y * 0.45, 3.0)))
    v = math.sin(z * 7.5) * 0.5 + math.sin(z * 3.1 + 1.7) * 0.5
    if v > 0.35: return (1.28, 1.3, 1.3)
    if v < -0.4: return (0.7, 0.62, 0.6)
    return (1, 1, 1)


def stone_stack(k, prefix, layers, mm, seed, seg=11, soft=True):
    """Stacked irregular slabs: [(z0, z1, r_bottom, r_top, off_x, off_y)]."""
    rnd = random.Random(seed)
    for i, (z0, z1, r0, r1, ox, oy) in enumerate(layers):
        bm = bmesh.new()
        jit = [1 + rnd.uniform(-0.2, 0.16) for _ in range(seg)]
        lo = [bm.verts.new((ox + math.cos(2 * math.pi * j / seg) * r0 * jit[j], oy + math.sin(2 * math.pi * j / seg) * r0 * jit[j], z0)) for j in range(seg)]
        hi = [bm.verts.new((ox + math.cos(2 * math.pi * j / seg) * r1 * jit[j], oy + math.sin(2 * math.pi * j / seg) * r1 * jit[j], z1 + rnd.uniform(-0.03, 0.03))) for j in range(seg)]
        for j in range(seg):
            bm.faces.new((lo[j], lo[(j + 1) % seg], hi[(j + 1) % seg], hi[j]))
        bm.faces.new(lo[::-1]); bm.faces.new(hi)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        k.mesh(f"{prefix}{i}", bm, mm, bevel=min(0.09, (z1 - z0) * 0.25) if soft else 0.0, seg=1, smooth=False)


def rock():
    """Layered sandstone outcrop: flat tilted slabs in alternating tones, so the strata read from far away."""
    k = Kit("D_Rock")
    a, b, c = m("rock", ROCK), m("rockl", ROCKL), m("rockd", (0.34, 0.12, 0.048))
    stone_stack(k, "a", [(0.0, 0.40, 0.80, 0.74, 0.0, 0.0), (0.38, 0.50, 0.66, 0.66, 0.02, 0.0)], c, 41, 8, False)
    stone_stack(k, "b", [(0.48, 0.90, 0.76, 0.66, -0.08, 0.04)], a, 47, 7)
    stone_stack(k, "c", [(0.88, 1.00, 0.52, 0.52, -0.05, 0.03)], c, 52, 7, False)
    stone_stack(k, "d", [(0.98, 1.38, 0.62, 0.50, -0.14, 0.07)], b, 58, 6)
    stone_stack(k, "e", [(0.0, 0.36, 0.40, 0.36, 0.52, -0.34), (0.34, 0.66, 0.32, 0.25, 0.50, -0.34)], b, 63, 6, False)
    stone_stack(k, "f", [(0.0, 0.24, 0.30, 0.22, -0.60, -0.46)], a, 71, 6, False)
    return k, make_vary(0, 1.4, ao=0.3, noise=0.12)


def ledge():
    """Backdrop mesa shelf: flat sandy top at z=0 (radius ~8), stratified walls going 30 m down."""
    k = Kit("D_Ledge")
    r = m("rock", ROCK)
    layers = [(-1.1, 0.0, 8.0, 8.2, 0, 0), (-3.4, -1.0, 7.0, 7.6, 0.2, -0.1), (-6.6, -3.3, 7.4, 6.9, -0.3, 0.2), (-8.4, -6.5, 6.2, 7.0, 0.1, 0.1),
              (-13.5, -8.3, 6.6, 5.9, 0.4, -0.3), (-17.0, -13.4, 5.2, 6.0, 0.1, 0), (-24.0, -16.9, 5.6, 4.8, -0.4, 0.3), (-32.0, -23.9, 6.6, 5.0, 0, 0)]
    stone_stack(k, "l", layers, r, 31, 15)
    stone_stack(k, "top", [(-0.16, 0.0, 7.55, 7.45, 0, 0)], m("s2", SANDL), 31, 15)
    base = make_vary(-30, 30, ao=0.4, noise=0.1, grad=lambda p, t: (1, 1, 1) if p.z > -0.2 else tuple(c ** 1 for c in strata(Vector((p.x, p.y, p.z * 0.42)), t)))
    return k, base


def rim():
    """Stone kerb that dresses one outer tile edge (4.8 m along X): sits just outside the edge, top at ground level."""
    k = Kit("D_Rim"); rnd = random.Random(14)
    a, b = m("s2", SANDL), m("s1", SAND)
    x = -2.4
    while x < 2.39:
        w = min(rnd.uniform(0.9, 1.5), 2.4 - x)
        if 2.4 - (x + w) < 0.5: w = 2.4 - x
        k.box(f"cap{x:.2f}", (w - 0.06, 0.52, 0.24), (x + w / 2, -0.2, -0.1 + rnd.uniform(-0.015, 0.0)), a, bevel=0.07, seg=1)
        k.box(f"low{x:.2f}", (w - 0.12, 0.3, 0.34), (x + w / 2 + rnd.uniform(-0.1, 0.1), -0.14, -0.42), b, bevel=0.06, seg=1)
        x += w
    return k, make_vary(-0.6, 0.6, ao=0.35, noise=0.13)


def grass():
    k = Kit("D_Grass"); rnd = random.Random(17)
    mm = m("straw", STRAW, 0.9)
    bm = bmesh.new()
    for i in range(26):
        a = rnd.uniform(0, 6.283); r = rnd.uniform(0, 0.2); h = rnd.uniform(0.2, 0.46); lean = rnd.uniform(0.05, 0.28); w = 0.028
        x, y = math.cos(a) * r, math.sin(a) * r
        tx, ty = x + math.cos(a) * lean, y + math.sin(a) * lean
        px, py = -math.sin(a) * w, math.cos(a) * w
        v = [bm.verts.new((x + px, y + py, 0)), bm.verts.new((x - px, y - py, 0)), bm.verts.new((tx, ty, h))]
        bm.faces.new(v)
        bm.faces.new([bm.verts.new((p.co.x, p.co.y, p.co.z)) for p in reversed(v)])
    k.mesh("blades", bm, mm, smooth=False)
    return k, make_vary(0, 0.4, ao=0.45, noise=0.1)


PIECES = dict(desert_wall=wall, desert_tower=tower, desert_house=house, desert_house_dome=house_dome, desert_arch=arch, desert_stall=stall,
              desert_bridge=bridge, desert_pots=pots, desert_cactus=cactus, desert_prickly=prickly, desert_rock=rock, desert_ledge=ledge, desert_rim=rim, desert_grass=grass)

want = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for name in (want or PIECES):
    kit, vary = PIECES[name]()
    export(kit, name, name.replace("_", " ").title(), vary=vary)
