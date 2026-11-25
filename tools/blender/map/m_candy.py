"""Phase 3: Candy Town pieces (own work). Headless:
blender --background --factory-startup --python tools/blender/map/m_candy.py -- [piece ...]
Z up, metres, base at z=0 (rim / shelf: top at z=0). Gameplay pieces keep the old footprints:
tiles 4.8 x 4.8 x 1.0, block 4.8 x 2.4 x 4.8, ramp 4.8 wide x 7.2 long x 2.4 high (high end at Blender -Y... glTF +Z)."""
import sys, math, random
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender\map")
from m_common import *
import bmesh
from mathutils import Vector

PINK = (1.0, 0.20, 0.50); PINKD = (0.72, 0.07, 0.30); PINKL = (1.0, 0.52, 0.70); CREAM = (1.0, 0.82, 0.62); VAN = (1.0, 0.70, 0.36)
MINT = (0.18, 0.78, 0.52); MINTD = (0.05, 0.46, 0.34); SKY = (0.14, 0.62, 0.95); LILAC = (0.46, 0.28, 0.90); LILACD = (0.28, 0.14, 0.62)
CHOC = (0.17, 0.055, 0.022); CHOCL = (0.34, 0.13, 0.045); GINGER = (0.55, 0.23, 0.07); BISC = (0.80, 0.46, 0.17)
RED = (0.85, 0.035, 0.07); YEL = (1.0, 0.70, 0.06); WHITE = (0.93, 0.90, 0.88); GOLD = (0.95, 0.58, 0.08); AQUA = (0.35, 0.85, 1.0)

GLOSS, SATIN, MATTE = 0.2, 0.5, 0.85


def m(name, c, rough=SATIN, metal=0.0):
    return mat(f"C_{name}_{int(rough * 10)}", c, rough, metal)


def candy_mats():
    return [m("pink", PINK, GLOSS), m("mint", MINT, GLOSS), m("sky", SKY, GLOSS), m("yel", YEL, GLOSS), m("lilac", LILAC, GLOSS)]


# ------------------------------------------------------------------ gameplay pieces
TILE = dict(pink=((0.94, 0.34, 0.54), PINKL), cream=((0.90, 0.62, 0.36), CREAM), mint=((0.17, 0.60, 0.40), (0.50, 0.84, 0.64)),
            sky=((0.15, 0.48, 0.85), (0.48, 0.75, 0.97)), lilac=((0.40, 0.24, 0.76), (0.66, 0.52, 0.94)))


def tile(colour, seed):
    """Frosted biscuit tile: biscuit slab, soft icing plate with a groove, a few sprinkles. Top flat at z = 1."""
    k = Kit("C_Tile_" + colour); rnd = random.Random(seed)
    icing, soft = TILE[colour]
    k.box("slab", (4.8, 4.8, 0.78), (0, 0, 0.39), m("bisc", BISC, MATTE), bevel=0.0, smooth=False)
    k.box("groove", (4.8, 4.8, 0.16), (0, 0, 0.86), m("g_" + colour, tuple(c * 0.74 for c in icing), SATIN), bevel=0.0, smooth=False)
    k.box("icing", (4.62, 4.62, 0.12), (0, 0, 0.94), m("i_" + colour, icing, SATIN), bevel=0.055, seg=2)
    k.box("soft", (3.7, 3.7, 0.02), (0, 0, 0.995), m("s_" + colour, tuple((a * 2 + b) / 3 for a, b in zip(icing, soft)), SATIN), bevel=0.0, smooth=False)
    mats = [m("pink", PINKD, SATIN), m("white", WHITE, SATIN), m("yel", YEL, SATIN), m("sky", SKY, SATIN)]
    for i in range(4):
        x, y = rnd.uniform(-2.0, 2.0), rnd.uniform(-2.0, 2.0)
        k.box(f"sp{i}", (0.2, 0.055, 0.025), (x, y, 1.006), mats[rnd.randrange(4)], rot=(0, 0, rnd.uniform(0, 3.14)), bevel=0.0, smooth=False)
    return k, make_vary(0, 1.0, ao=0.12, noise=0.05)


def block():
    """Layer-cake block: sponge, jam and cream layers under a frosted top with drips."""
    k = Kit("C_Block"); rnd = random.Random(6)
    layers = [(0.0, 0.62, "choc", CHOCL, MATTE), (0.62, 0.84, "cream", CREAM, SATIN), (0.84, 1.48, "van", VAN, MATTE), (1.48, 1.70, "pink", PINK, GLOSS), (1.70, 2.12, "choc", CHOCL, MATTE)]
    for i, (z0, z1, n, c, r) in enumerate(layers):
        inset = 0.14 if i % 2 == 0 else 0.06
        k.box(f"l{i}", (4.8 - inset, 4.8 - inset, z1 - z0), (0, 0, (z0 + z1) / 2), m(n, c, r), bevel=0.06, seg=1)
    ice = m("ice", PINKL, GLOSS)
    k.box("top", (4.8, 4.8, 0.3), (0, 0, 2.25), ice, bevel=0.12, seg=2)
    for side in range(4):
        a = side * math.pi / 2
        for j in range(4):
            t = -1.8 + j * 1.2 + rnd.uniform(-0.2, 0.2)
            d = rnd.uniform(0.18, 0.62)
            x, y = (t, 2.32) if side == 0 else (-2.32, t) if side == 1 else (t, -2.32) if side == 2 else (2.32, t)
            k.tube(f"drip{side}{j}", [(x, y, 2.2), (x, y, 2.12 - d * 0.7), (x, y, 2.12 - d)], [0.2, 0.13, 0.18], ice, sides=5)
    return k, make_vary(0, 2.4, ao=0.2, noise=0.05)


def ramp():
    """Wafer ramp with sugar chevrons and candy-stripe kerbs. High end towards Blender -Y."""
    k = Kit("C_Ramp")
    W, L, H = 4.8, 7.2, 2.4
    bm = bmesh.new()
    pts = [(-W / 2, L / 2, 0), (W / 2, L / 2, 0), (W / 2, -L / 2, 0), (-W / 2, -L / 2, 0), (-W / 2, -L / 2, H), (W / 2, -L / 2, H)]
    v = [bm.verts.new(p) for p in pts]
    for f in ((0, 1, 2, 3), (0, 4, 5, 1), (0, 3, 4), (1, 5, 2), (3, 2, 5, 4)):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    k.mesh("wedge", bm, m("ice", (0.98, 0.50, 0.66), SATIN), smooth=False)
    ang = -math.atan2(H, L)  # rotation about X so local +Y runs up towards -Y
    zat = lambda y: H * (L / 2 - y) / L
    cream, white = m("cream", CREAM, SATIN), m("white", WHITE, SATIN)
    for i in range(5):
        y = 2.5 - i * 1.25
        for sx in (-1, 1):
            k.box(f"ch{i}{sx}", (1.05, 0.2, 0.05), (sx * 0.45, y - 0.0, zat(y) + 0.022), cream, rot=(ang, 0, sx * 0.0), bevel=0.0, smooth=False)
    n = 8
    seg = math.hypot(L, H) / n
    for sx in (-1, 1):
        for i in range(n):
            y = L / 2 - (i + 0.5) * L / n
            k.box(f"kerb{sx}{i}", (0.3, seg + 0.01, 0.16), (sx * (W / 2 - 0.15), y, zat(y) + 0.04), white if i % 2 else m("red", RED, GLOSS), rot=(ang, 0, 0), bevel=0.04, seg=1)
        for j, (y0, h) in enumerate(((-2.7, 1.5), (-1.2, 1.1), (0.3, 0.7))):
            k.sphere(f"dot{sx}{j}", 0.3, (sx * (W / 2 + 0.01), y0, h * 0.55), candy_mats()[j], scale=(0.2, 1, 1), seg=8, rings=5)
    return k, make_vary(0, 2.4, ao=0.15, noise=0.04)


def rim():
    """Icing kerb on one outer tile edge (4.8 m along X), hanging outwards (Blender -Y), top at ground level."""
    k = Kit("C_Rim"); rnd = random.Random(15)
    ice, white = m("pink", PINKL, GLOSS), m("white", WHITE, SATIN)
    k.tube("lip", [(-2.4 + i * 1.6, -0.1, -0.12) for i in range(4)], 0.17, ice, sides=6)
    x = -2.15
    i = 0
    while x < 2.2:
        d = rnd.uniform(0.18, 0.72)
        k.tube(f"d{i}", [(x, -0.14, -0.14), (x, -0.13, -0.14 - d * 0.7), (x, -0.12, -0.14 - d)], [0.2, 0.12, 0.16], ice, sides=5)
        if i % 2 == 0:
            k.sphere(f"b{i}", 0.14, (x + 0.4, -0.24, -0.02), white if i % 4 else candy_mats()[i % 5], scale=(1, 0.8, 0.6), seg=6, rings=4)
        x += rnd.uniform(0.85, 1.05); i += 1
    return k, make_vary(-1.0, 1.0, ao=0.25, noise=0.04)


# ------------------------------------------------------------------ architecture and decoration
def cane(k, name, x, y, z, h, r=0.14, hook=True, yaw=0.0, parts=14):
    red, white = m("red", RED, GLOSS), m("white", WHITE, GLOSS)
    pts = [(0, 0, h * i / 8) for i in range(9)]
    if hook:
        R = r * 3.0
        pts += [(R - R * math.cos(a), 0, h + R * math.sin(a)) for a in [math.pi * i / 6 for i in range(1, 7)]]
    c, s = math.cos(yaw), math.sin(yaw)
    pts = [(x + px * c - py * s, y + px * s + py * c, z + pz) for px, py, pz in pts]
    for i in range(len(pts) - 1):
        k.tube(f"{name}{i}", [pts[i], pts[i + 1]], r, red if i % 2 == 0 else white, sides=6, cap=(i == 0 or i == len(pts) - 2))


def gumdrop(k, name, x, y, z, s, mm, seg=8):
    k.lathe(name, [(0.0, 0.0), (0.5 * s, 0.0), (0.52 * s, 0.16 * s), (0.42 * s, 0.5 * s), (0.22 * s, 0.7 * s), (0.0, 0.76 * s)], (x, y, z), mm, seg=seg)


def scallop_roof(k, name, w, d, z, h, mm, trim):
    """Pitched roof (ridge along X) shingled with rows of rounded icing scallops, snowy ridge."""
    ang = math.atan2(h, d / 2)
    slope = math.hypot(d / 2, h)
    for side in (-1, 1):
        k.box(f"{name}p{side}", (w, slope + 0.1, 0.18), (0, side * d / 4, z + h / 2), mm, rot=(-side * ang, 0, 0), bevel=0.04, seg=1)
        for row in range(3):
            f = (row + 0.4) / 3.3
            y = side * (d / 2) * (1 - f)
            zz = z + h * f + 0.12
            n = int(w / 0.66)
            for i in range(n):
                x = -w / 2 + (i + 0.5) * w / n + (0.14 if row % 2 else -0.0)
                k.cyl(f"{name}s{side}{row}{i}", w / n * 0.52, 0.07, (x, y, zz), trim if row % 2 == 0 else mm, rot=(-side * ang, 0, 0), seg=6)
    k.tube(f"{name}ridge", [(-w / 2 - 0.15 + i * (w + 0.3) / 6, 0, z + h + 0.1 + (0.04 if i % 2 else 0)) for i in range(7)], 0.22, m("white", WHITE, SATIN), sides=8)


def gable(k, name, x, w2, z, h, mm):
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in ((x, -w2, z), (x, w2, z), (x, 0, z + h))]
    bm.faces.new(v)
    bm.faces.new([bm.verts.new((p[0] - math.copysign(0.02, x), p[1], p[2])) for p in ((x, -w2, z), (x, 0, z + h), (x, w2, z))])
    k.mesh(name, bm, mm, smooth=False)


def round_window(k, name, x, y, z, r=0.42):
    k.cyl(name + "g", r, 0.12, (x, y, z), m("aqua", AQUA, GLOSS), rot=(math.pi / 2, 0, 0), seg=18)
    k.torus(name + "f", r, 0.09, (x, y - 0.05, z), m("white", WHITE, SATIN), rot=(math.pi / 2, 0, 0), seg=20, sides=6)
    k.box(name + "h", (r * 2, 0.07, 0.07), (x, y - 0.08, z), m("white", WHITE, SATIN), bevel=0.0, smooth=False)
    k.box(name + "v", (0.07, 0.07, r * 2), (x, y - 0.08, z), m("white", WHITE, SATIN), bevel=0.0, smooth=False)


def house(name, wall, wallc, roof, roofc, trimc):
    k = Kit("C_" + name)
    W, D, H = 4.6, 3.8, 2.7
    wm = m(wall, wallc, MATTE); rm = m(roof, roofc, GLOSS); tm = m("trim_" + roof, trimc, SATIN); white = m("white", WHITE, SATIN)
    k.box("base", (W + 0.4, D + 0.4, 0.3), (0, 0, 0.15), m("choc", CHOCL, MATTE), bevel=0.08, seg=2)
    k.box("walls", (W, D, H), (0, 0, 0.25 + H / 2), wm, bevel=0.2, seg=2)
    gable(k, "gl", -W / 2 + 0.12, D / 2 - 0.1, H + 0.2, 1.55, wm); gable(k, "gr", W / 2 - 0.12, D / 2 - 0.1, H + 0.2, 1.55, wm)
    scallop_roof(k, "roof", W + 0.7, D + 1.1, H + 0.1, 1.85, rm, tm)
    # door with icing frame
    k.box("door", (1.0, 0.14, 1.45), (0, -D / 2 - 0.02, 0.98), m("choc", CHOC, GLOSS), bevel=0.05, seg=1)
    k.cyl("doortop", 0.5, 0.14, (0, -D / 2 - 0.02, 1.7), m("choc", CHOC, GLOSS), rot=(math.pi / 2, 0, 0), seg=18)
    k.tube("frame", [(-0.62, -D / 2 - 0.1, 0.3)] + [(-0.62 * math.cos(a), -D / 2 - 0.1, 1.7 + 0.62 * math.sin(a)) for a in [math.pi * i / 10 for i in range(11)]] + [(0.62, -D / 2 - 0.1, 0.3)], 0.09, white, sides=7)
    k.sphere("knob", 0.09, (0.3, -D / 2 - 0.15, 1.1), m("gold", GOLD, 0.3, 0.6), seg=8, rings=5)
    for sx in (-1.5, 1.5):
        round_window(k, f"w{sx}", sx, -D / 2 - 0.02, 1.75)
        cane(k, f"cane{sx}", sx * 1.62, -D / 2 - 0.22, 0.2, 1.9, 0.13, True, 0 if sx < 0 else math.pi)
    round_window(k, "attic", 0, -D / 2 + 0.02, H + 0.55, 0.3) if False else None
    k.box("chim", (0.65, 0.65, 1.5), (1.35, 0.55, H + 1.55), m("choc", CHOCL, MATTE), bevel=0.08, seg=1)
    k.sphere("cream", 0.48, (1.35, 0.55, H + 2.38), white, scale=(1, 1, 0.7), seg=12, rings=8)
    gm = candy_mats()
    for i in range(9):
        x = -W / 2 + 0.25 + i * (W - 0.5) / 8
        if abs(x) > 0.75:
            gumdrop(k, f"gd{i}", x, -D / 2 - 0.35, 0.3, 0.42, gm[i % 5])
    return k, make_vary(0, 5.0, ao=0.2, noise=0.05)


def tower():
    k = Kit("C_Tower")
    white = m("white", WHITE, SATIN)
    k.cyl("foot", 2.0, 0.5, (0, 0, 0.25), m("choc", CHOCL, MATTE), seg=20, bevel=0.1)
    cols = [m("pink", PINK, GLOSS), white, m("pink", PINK, GLOSS), white, m("pink", PINK, GLOSS), white, m("pink", PINK, GLOSS)]
    z = 0.5
    for i, mm in enumerate(cols):
        r0, r1 = 1.55 - i * 0.07, 1.55 - (i + 1) * 0.07
        k.cyl(f"s{i}", r0, 0.85, (0, 0, z + 0.425), mm, seg=20, r2=r1)
        z += 0.85
    k.cyl("balc", 1.75, 0.28, (0, 0, z + 0.1), m("bisc", BISC, MATTE), seg=20, bevel=0.08)
    for i in range(12):
        a = i * math.pi / 6
        gumdrop(k, f"gd{i}", math.cos(a) * 1.55, math.sin(a) * 1.55, z + 0.22, 0.42, candy_mats()[i % 5])
    k.cyl("room", 1.05, 1.5, (0, 0, z + 0.95), m("van", VAN, MATTE), seg=18)
    for i in range(4):
        a = i * math.pi / 2 - math.pi / 2
        k.cyl(f"win{i}", 0.34, 0.12, (math.cos(a) * 1.04, math.sin(a) * 1.04, z + 1.0), m("aqua", AQUA, GLOSS), rot=(math.pi / 2, 0, a + math.pi / 2), seg=14)
        k.torus(f"winf{i}", 0.34, 0.07, (math.cos(a) * 1.09, math.sin(a) * 1.09, z + 1.0), white, rot=(math.pi / 2, 0, a + math.pi / 2), seg=16, sides=5)
    zr = z + 1.7
    k.lathe("roof", [(0.0, 0.0), (1.7, 0.0), (1.55, 0.25), (1.0, 1.2), (0.45, 2.1), (0.1, 2.6), (0.0, 2.65)], (0, 0, zr), m("lilac", LILAC, GLOSS), seg=20)
    for i in range(14):
        a = i * 2 * math.pi / 14
        k.sphere(f"icing{i}", 0.26, (math.cos(a) * 1.55, math.sin(a) * 1.55, zr + 0.05), white, scale=(1, 1, 0.8 if i % 2 else 1.4), seg=8, rings=6)
    k.sphere("cherry", 0.34, (0, 0, zr + 2.85), m("red", RED, GLOSS), seg=14, rings=10)
    k.box("door", (0.8, 0.2, 1.2), (0, -1.52, 1.05), m("choc", CHOC, GLOSS), bevel=0.06, seg=1)
    k.cyl("doortop", 0.4, 0.2, (0, -1.52, 1.65), m("choc", CHOC, GLOSS), rot=(math.pi / 2, 0, 0), seg=16)
    return k, make_vary(0, 11, ao=0.18, noise=0.04)


def swirl_ball(k, name, c, r, a, b, turns=3, seg=18):
    """A lollipop head: a flattened sphere with a spiral band painted by vertex colour (two materials per face)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg * 5 // 9), radius=r)
    for v in bm.verts:
        v.co = Vector((v.co.x, v.co.z * 0.42, v.co.y))
    other = bm.copy()
    def keep(mesh, parity):
        drop = []
        for f in mesh.faces:
            p = f.calc_center_median()
            rad = math.hypot(p.x, p.z) / r
            s = (math.atan2(p.z, p.x) / (2 * math.pi) * 3 + rad * turns) % 1.0
            if (s < 0.5) != parity: drop.append(f)
        bmesh.ops.delete(mesh, geom=drop, context="FACES")
    keep(bm, True); keep(other, False)
    o = k.mesh(name + "a", bm, a); o.location = c
    o = k.mesh(name + "b", other, b); o.location = c


def lollytree():
    k = Kit("C_LollyTree")
    white = m("white", WHITE, SATIN)
    k.tube("stick", [(0, 0, 0), (0.04, 0, 1.2), (0, 0, 2.6)], [0.16, 0.13, 0.11], white, sides=8)
    swirl_ball(k, "head", (0, 0, 3.55), 1.25, m("pink", PINK, GLOSS), white, 3)
    for i, (x, z, r) in enumerate(((-0.55, 1.5, 0.34), (0.55, 2.05, 0.28))):
        swirl_ball(k, f"leaf{i}", (x, 0, z), r, m("mint", MINT, GLOSS), m("yel", YEL, GLOSS), 2, 10)
        k.tube(f"br{i}", [(0, 0, z - 0.45), (x * 0.9, 0, z - 0.1)], 0.06, white, sides=6)
    gm = candy_mats()
    for i in range(6):
        a = i * 1.05
        gumdrop(k, f"g{i}", math.cos(a) * 0.55, math.sin(a) * 0.55, 0, 0.45, gm[i % 5])
    return k, make_vary(0, 4.8, ao=0.15, noise=0.03)


def floss():
    """Cotton-candy tree: striped stick, soft matte clouds."""
    k = Kit("C_Floss"); rnd = random.Random(19)
    cane(k, "trunk", 0, 0, 0, 2.2, 0.16, False)
    a, b, c = m("floss_p", PINKL, MATTE), m("floss_a", (0.55, 0.88, 1.0), MATTE), m("floss_l", (0.76, 0.58, 1.0), MATTE)
    for i, (x, y, z, r, mm) in enumerate(((0, 0, 3.1, 1.15, a), (-0.85, 0.1, 2.7, 0.75, a), (0.85, -0.1, 2.75, 0.7, b), (0.15, 0.2, 4.05, 0.72, c), (-0.45, -0.45, 3.65, 0.6, b), (0.55, 0.4, 3.55, 0.62, a))):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3 if r > 1.0 else 2, radius=r)
        for v in bm.verts:
            v.co *= 1.0 + 0.11 * math.sin(v.co.x * 7 + i) * math.sin(v.co.y * 7) * math.sin(v.co.z * 7 + 1) + rnd.uniform(-0.025, 0.025)
        o = k.mesh(f"puff{i}", bm, mm); o.location = (x, y, z)
    return k, make_vary(0, 4.8, ao=0.22, noise=0.06)


def fountain():
    """Three-tier bubblegum fountain (base radius 1.0 = its collision circle)."""
    k = Kit("C_Fountain")
    stone, gum, gold, white = m("van", VAN, SATIN), m("gum", PINK, 0.1), m("gold", GOLD, 0.3, 0.6), m("white", WHITE, SATIN)
    def bowl(name, R, z, d):
        k.lathe(name, [(0.0, z), (R * 0.45, z), (R * 0.85, z + d * 0.45), (R, z + d), (R * 0.9, z + d + 0.06), (R * 0.82, z + d - 0.04), (0.0, z + d - 0.08)], (0, 0, 0), stone, seg=24)
        k.torus(name + "rim", R * 0.96, 0.07, (0, 0, z + d + 0.02), gold, seg=28, sides=6)
        k.cyl(name + "liq", R * 0.84, 0.05, (0, 0, z + d - 0.01), gum, seg=24)
        n = 10
        for i in range(n):
            a = i * 2 * math.pi / n
            L = 0.55 if i % 2 else 0.8
            k.tube(f"{name}st{i}", [(math.cos(a) * R * 0.93, math.sin(a) * R * 0.93, z + d), (math.cos(a) * R * 1.04, math.sin(a) * R * 1.04, z + d - L * 0.45), (math.cos(a) * R * 1.06, math.sin(a) * R * 1.06, z + d - L)], [0.065, 0.045, 0.085], gum, sides=6)
    k.cyl("plinth", 1.05, 0.3, (0, 0, 0.15), m("choc", CHOCL, MATTE), seg=24, bevel=0.08)
    bowl("b1", 1.12, 0.3, 0.6)
    k.cyl("c1", 0.28, 1.0, (0, 0, 1.35), white, seg=14)
    bowl("b2", 0.8, 1.65, 0.45)
    k.cyl("c2", 0.19, 0.8, (0, 0, 2.45), white, seg=12)
    bowl("b3", 0.52, 2.7, 0.32)
    k.sphere("scoop", 0.42, (0, 0, 3.35), gum, seg=18, rings=12)
    k.sphere("cherry", 0.18, (0, 0, 3.85), m("red", RED, 0.15), seg=12, rings=8)
    for i, (x, y, z, r) in enumerate(((0.55, 0.2, 3.7, 0.13), (-0.5, -0.3, 4.0, 0.09), (-0.2, 0.55, 4.25, 0.11), (0.3, -0.5, 4.5, 0.07))):
        k.sphere(f"bub{i}", r, (x, y, z), m("aqua", (0.7, 0.94, 1.0), 0.05), seg=10, rings=7)
    return k, make_vary(0, 4.0, ao=0.18, noise=0.03)


def bridge():
    """Wafer bridge, 10 m along X, deck top at z = 0, candy-cane posts."""
    k = Kit("C_Bridge")
    a, b = m("bisc", BISC, MATTE), m("choc", CHOCL, MATTE)
    L, n = 10.0, 18
    sag = lambda x: 0.3 * (1 - (2 * x / L) ** 2)
    for i in range(n):
        x = -L / 2 + (i + 0.5) * L / n
        k.box(f"pl{i}", (L / n - 0.05, 2.0, 0.16), (x, 0, sag(x) - 0.08), a if i % 2 else b, bevel=0.04, seg=1)
    for sy in (-1.05, 1.05):
        k.tube(f"rail{sy}", [(-L / 2 + j * L / 10, sy, sag(-L / 2 + j * L / 10) + 0.9) for j in range(11)], 0.09, m("pink", PINK, GLOSS), sides=7)
        for j in range(6):
            x = -L / 2 + j * L / 5
            cane(k, f"post{sy}{j}", x, sy, sag(x) - 0.2, 1.15, 0.09, j in (0, 5), 0 if j == 0 else math.pi)
    return k, make_vary(-0.4, 1.6, ao=0.15, noise=0.05)


def garden():
    """Low cluster of sweets and flowers."""
    k = Kit("C_Garden"); rnd = random.Random(23)
    gm = candy_mats(); white = m("white", WHITE, SATIN)
    for i, (x, y, s) in enumerate(((0, 0, 0.8), (-0.55, 0.15, 0.55), (0.5, -0.2, 0.5), (0.25, 0.45, 0.4))):
        gumdrop(k, f"g{i}", x, y, 0, s, gm[(i * 2) % 5])
    for i, (x, y, h) in enumerate(((-0.25, -0.4, 0.75), (0.6, 0.3, 0.55), (-0.7, -0.15, 0.45))):
        k.tube(f"st{i}", [(x, y, 0), (x, y, h)], 0.035, m("mint", MINTD, SATIN), sides=5)
        for j in range(5):
            a = j * math.pi * 0.4
            k.sphere(f"pe{i}{j}", 0.11, (x + math.cos(a) * 0.13, y + math.sin(a) * 0.13, h), gm[(i + 3) % 5], scale=(1, 1, 0.45), seg=5, rings=3)
        k.sphere(f"co{i}", 0.08, (x, y, h + 0.04), white, seg=5, rings=3)
    return k, make_vary(0, 0.9, ao=0.2, noise=0.04)


def shelf():
    """Floating cake island for the backdrop: frosted top at z = 0 (radius ~8), layered sponge, wafer-cone underside."""
    k = Kit("C_Shelf"); rnd = random.Random(27)
    ice = m("pink", PINKL, SATIN)
    k.cyl("top", 8.2, 0.5, (0, 0, -0.25), ice, seg=24, bevel=0.2)
    k.cyl("lawn", 6.9, 0.06, (0, 0, -0.01), m("mint", (0.55, 0.9, 0.7), MATTE), seg=24)
    z = -0.5
    for i, (h, r0, r1, n, c, rr) in enumerate(((1.3, 7.2, 7.6, "van", VAN, MATTE), (0.45, 7.5, 7.5, "cream", CREAM, SATIN), (1.5, 6.4, 7.0, "choc", CHOCL, MATTE), (0.4, 6.3, 6.3, "pinkd", PINKD, GLOSS))):
        k.cyl(f"l{i}", r0, h, (0, 0, z - h / 2), m(n, c, rr), seg=24, r2=r1)
        z -= h
    k.cyl("cone", 0.6, 7.0, (0, 0, z - 3.5), m("bisc", BISC, MATTE), seg=12, r2=5.8, smooth=False)
    for i in range(18):
        a = i * 2 * math.pi / 18
        d = rnd.uniform(0.5, 2.0)
        x, y = math.cos(a) * 7.95, math.sin(a) * 7.95
        k.tube(f"drip{i}", [(x, y, -0.3), (x, y, -0.4 - d * 0.7), (x, y, -0.4 - d)], [0.75, 0.45, 0.6], ice, sides=5)
        gumdrop(k, f"gd{i}", math.cos(a) * 7.6, math.sin(a) * 7.6, -0.05, rnd.uniform(0.45, 0.8), candy_mats()[i % 5], 6) if i % 2 == 0 else None
    return k, make_vary(-12, 12, ao=0.3, noise=0.05)


PIECES = {f"candy_tile_{c}": (lambda c=c, i=i: tile(c, 30 + i)) for i, c in enumerate(TILE)}
PIECES.update(
    candy_block=block, candy_ramp=ramp, candy_rim=rim, candy_tower=tower, candy_lollytree=lollytree, candy_floss=floss,
    candy_fountain=fountain, candy_bridge=bridge, candy_garden=garden, candy_shelf=shelf,
    candy_house=lambda: house("House", "ginger", GINGER, "pink", PINK, PINKL),
    candy_house_mint=lambda: house("HouseMint", "van", VAN, "mint", MINT, WHITE),
    candy_house_lilac=lambda: house("HouseLilac", "cream", CREAM, "lilac", LILAC, AQUA),
)

want = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for name in (want or PIECES):
    kit, vary = PIECES[name]()
    export(kit, name, name.replace("_", " ").title(), vary=vary)
