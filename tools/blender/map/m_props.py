exec(open(r"C:\Users\User\Desktop\bubble-brawl\tools\blender\map\m_common.py").read())


def glassm(name, color=(0.85, 0.95, 1.0), a=0.28):
    return vmat(name, color, 0.04, 0.0, alpha=a, spec=1.0)


def fountain():
    """The central landmark. Origin = plaza top centre. ~9 m tall, open silhouette (no walls: you can see through it)."""
    k = Kit("M_Fountain")
    cream = vmat("f_cream", C['cream'], 0.45)
    pink = vmat("f_pink", C['pink'], 0.4)
    pinkl = vmat("f_pinkl", C['pinkl'], 0.4)
    stripe = vmat("f_stripe", C['white'], 0.4)
    gold = vmat("f_gold", C['gold'], 0.28, 0.85)
    water = vmat("f_water", (0.35, 0.85, 1.0), 0.05, 0.0, alpha=0.62, emit=(0.2, 0.7, 1.0, 0.6))
    wfall = vmat("f_wfall", (0.7, 0.95, 1.0), 0.05, 0.0, alpha=0.5, emit=(0.4, 0.85, 1.0, 1.2))
    glass = glassm("f_glass", (0.85, 0.85, 1.0), 0.32)
    glass2 = glassm("f_glass2", (1.0, 0.7, 0.9), 0.4)
    glass3 = glassm("f_glass3", (0.6, 0.95, 1.0), 0.4)
    core = vmat("f_core", C['pink'], 0.2, 0.0, emit=(1.0, 0.35, 0.75, 4.0))
    pearl = vmat("f_pearl", C['aqua'], 0.2, 0.0, emit=(0.3, 0.9, 1.0, 3.0))
    # pool: cream wall, pink inner band
    k.lathe("pool", [(2.2, 0.0), (2.62, 0.0), (2.7, 0.12), (2.7, 0.62), (2.58, 0.76), (2.36, 0.76), (2.2, 0.62), (2.14, 0.46), (0.0, 0.46)], (0, 0, 0), cream, seg=64)
    k.torus("poolgold", 2.45, 0.06, (0, 0, 0.78), gold, seg=64, sides=8)
    k.cyl("water0", 2.15, 0.02, (0, 0, 0.62), water, seg=48)
    # first column: swirl-striped bubblegum stem
    k.lathe("stem", [(0.0, 0.46), (1.0, 0.46), (0.85, 0.7), (0.62, 1.2), (0.5, 1.9), (0.46, 2.6), (0.5, 3.1), (0.0, 3.1)], (0, 0, 0), pink, seg=48)
    # basin 1
    k.lathe("b1", [(0.0, 3.0), (0.55, 3.0), (1.3, 3.2), (1.95, 3.55), (2.18, 3.8), (2.1, 3.88), (1.9, 3.78), (1.2, 3.55), (0.0, 3.45)], (0, 0, 0), pinkl, seg=56)
    k.torus("b1gold", 2.14, 0.055, (0, 0, 3.86), gold, seg=56, sides=8)
    k.cyl("water1", 1.95, 0.02, (0, 0, 3.7), water, seg=48)
    # column 2 + basin 2
    k.lathe("stem2", [(0.0, 3.4), (0.5, 3.4), (0.4, 3.9), (0.34, 4.6), (0.4, 5.1), (0.0, 5.1)], (0, 0, 0), pink, seg=40)
    k.lathe("b2", [(0.0, 5.0), (0.4, 5.0), (0.9, 5.15), (1.3, 5.4), (1.42, 5.6), (1.34, 5.66), (1.15, 5.56), (0.8, 5.4), (0.0, 5.3)], (0, 0, 0), cream, seg=48)
    k.torus("b2gold", 1.38, 0.045, (0, 0, 5.64), gold, seg=48, sides=8)
    k.cyl("water2", 1.2, 0.02, (0, 0, 5.5), water, seg=40)
    # column 3
    k.lathe("stem3", [(0.0, 5.3), (0.3, 5.3), (0.24, 5.9), (0.22, 6.3), (0.0, 6.3)], (0, 0, 0), pinkl, seg=32)
    # bubble crown: giant bubble with glowing core + orbiting bubbles
    k.sphere("giant", 1.6, (0, 0, 7.8), glass, seg=36, rings=24)
    k.sphere("giantcore", 0.62, (0, 0, 7.8), core, seg=24, rings=16)
    k.torus("halo", 1.15, 0.035, (0, 0, 7.8), gold, rot=(0.5, 0.2, 0), seg=40, sides=6)
    k.torus("halo2", 1.28, 0.03, (0, 0, 7.8), gold, rot=(-0.6, 0.4, 0), seg=40, sides=6)
    rnd = random.Random(9)
    for i in range(7):
        a = i * 2 * math.pi / 7 + 0.3
        rr = rnd.uniform(1.8, 2.5)
        zz = 6.4 + rnd.uniform(-0.2, 2.5)
        r = rnd.uniform(0.32, 0.62)
        k.sphere(f"ob{i}", r, (math.cos(a) * rr, math.sin(a) * rr, zz), [glass, glass2, glass3][i % 3], seg=24, rings=16)
        if i % 2 == 0:
            k.sphere(f"pe{i}", r * 0.3, (math.cos(a) * rr, math.sin(a) * rr, zz), pearl, seg=10, rings=8)
    # falling water: ribbons from basin 2 -> basin 1 and basin 1 -> pool
    for i in range(10):
        a = i * 2 * math.pi / 10
        ca, sa = math.cos(a), math.sin(a)
        pts = [(ca * 1.32, sa * 1.32, 5.55), (ca * 1.5, sa * 1.5, 5.3), (ca * 1.62, sa * 1.62, 4.6), (ca * 1.7, sa * 1.7, 3.75)]
        k.tube(f"fall1{i}", pts, [0.05, 0.06, 0.06, 0.05], wfall, sides=6, cap=True)
    for i in range(14):
        a = i * 2 * math.pi / 14 + 0.2
        ca, sa = math.cos(a), math.sin(a)
        pts = [(ca * 2.1, sa * 2.1, 3.82), (ca * 2.3, sa * 2.3, 3.4), (ca * 2.42, sa * 2.42, 2.0), (ca * 2.42, sa * 2.42, 0.7)]
        k.tube(f"fall2{i}", pts, [0.05, 0.06, 0.07, 0.06], wfall, sides=6, cap=True)
    # lollipop gumball posts around the pool rim (outside the pool collision)
    cols = [C['pink'], C['aqua'], C['yellow'], C['lilac']]
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        x, y = math.cos(a) * 3.35, math.sin(a) * 3.35
        k.cyl(f"stick{i}", 0.06, 0.9, (x, y, 0.45), cream, seg=8)
        k.sphere(f"gball{i}", 0.3, (x, y, 1.1), vmat(f"gbm{i%4}", cols[i % 4], 0.25, coat=0.6), seg=16, rings=12)
        k.torus(f"gband{i}", 0.3, 0.025, (x, y, 1.1), cream, seg=16, sides=5)
    # crystal clusters at the four diagonals of the plaza
    for q in range(4):
        a = q * math.pi / 2 + math.pi / 4
        for j in range(3):
            aa = a + (j - 1) * 0.28
            rr = 3.8 + (j % 2) * 0.2
            k.crystal(f"cr{q}{j}", 0.22, 0.9 + 0.5 * ((q + j) % 3) / 2, (math.cos(aa) * rr, math.sin(aa) * rr, 0.0), vmat(f"fc{(q+j)%2}", [C['aqua'], C['pink']][(q + j) % 2], 0.15, 0.0, coat=0.6), rot=(0.12 * (j - 1), 0.1, 0), sides=6)

    def stripe_fn(p, n):
        if p.z < 3.2 and math.hypot(p.x, p.y) < 1.1:
            s = math.sin(3 * math.atan2(p.y, p.x) + 2.4 * p.z) > 0
            return (1.0, 1.0, 1.0) if s else (1.0, 0.62, 0.78)
        return (1, 1, 1)
    vary = make_vary(0, 6.0, ao=0.18, noise=0.05, stripe=stripe_fn)
    return k, vary


def gumball():
    """Gumball machine cover: base 1.8 m, globe full of gumballs. ~3 m tall."""
    k = Kit("M_Gumball")
    pink = vmat("g_pink", C['pink'], 0.35, coat=0.4)
    cream = vmat("g_cream", C['cream'], 0.45)
    gold = vmat("g_gold", C['gold'], 0.28, 0.85)
    glass = glassm("g_glass", (0.85, 0.95, 1.0), 0.22)
    navy = vmat("g_navy", C['navy'], 0.5)
    k.cyl("foot", 0.95, 0.18, (0, 0, 0.09), cream, r2=0.95, seg=24)
    k.lathe("base", [(0.0, 0.18), (0.8, 0.18), (0.78, 0.5), (0.7, 1.1), (0.78, 1.25), (0.0, 1.25)], (0, 0, 0), pink, seg=40)
    k.torus("ringg", 0.8, 0.05, (0, 0, 1.25), gold, seg=40, sides=8)
    k.box("chute", (0.5, 0.35, 0.34), (0, -0.78, 0.65), navy, bevel=0.0)
    k.box("flap", (0.4, 0.05, 0.22), (0, -0.97, 0.66), gold, bevel=0.0)
    k.cyl("coin", 0.2, 0.05, (0.0, -0.74, 0.98), gold, rot=(math.pi / 2, 0, 0), seg=16)
    k.sphere("globe", 0.88, (0, 0, 2.15), glass, seg=32, rings=20)
    rnd = random.Random(21)
    cols = [C['pink'], C['aqua'], C['yellow'], C['lilac'], C['mint'], C['orange'], C['white']]
    n = 0
    for i in range(22):
        while True:
            x, y, z = rnd.uniform(-0.7, 0.7), rnd.uniform(-0.7, 0.7), rnd.uniform(-0.75, 0.55)
            if x * x + y * y + z * z < 0.58 ** 2 + 0.2 and z < 0.3 + 0.1 * rnd.random(): break
        k.sphere(f"gb{i}", 0.15, (x, y, 2.15 + z), vmat(f"ggb{i%7}", cols[i % 7], 0.25, coat=0.6), seg=8, rings=6)
    k.lathe("cap", [(0.0, 2.95), (0.35, 2.95), (0.5, 3.05), (0.3, 3.3), (0.0, 3.34)], (0, 0, 0), cream, seg=24)
    k.cyl("capring", 0.56, 0.1, (0, 0, 2.95), gold, r2=0.52, seg=32, bevel=0.02)
    k.sphere("capknob", 0.12, (0, 0, 3.4), pink, seg=12, rings=8)
    k.lathe("neck", [(0.0, 1.25), (0.62, 1.25), (0.55, 1.5), (0.6, 1.6), (0.0, 1.6)], (0, 0, 0), cream, seg=32)
    k.torus("neckring", 0.6, 0.06, (0, 0, 1.55), gold, seg=32, sides=8)
    vary = make_vary(0, 3.0, ao=0.25, noise=0.05)
    return k, vary


def mushroom(variant="pink"):
    """Candy mushroom tree. Stem r ~0.5, cap radius 1.9 high above (you walk under the cap)."""
    k = Kit(f"M_Mush_{variant}")
    cap_c = dict(pink=C['pink'], aqua=C['aqua'], lilac=C['lilac'])[variant]
    cap = vmat(f"m_cap_{variant}", cap_c, 0.35, coat=0.4)
    stem = vmat("m_stem", C['cream'], 0.5)
    spot = vmat("m_spot", C['white'], 0.4)
    under = vmat("m_under", C['cream2'], 0.55)
    k.lathe("stem", [(0.0, 0.0), (0.78, 0.0), (0.6, 0.35), (0.46, 1.2), (0.42, 2.0), (0.5, 2.8), (0.0, 2.8)], (0, 0, 0), stem, seg=28)
    k.lathe("cap", [(0.0, 2.6), (1.6, 2.7), (2.05, 3.1), (2.0, 3.6), (1.5, 4.3), (0.8, 4.65), (0.0, 4.78)], (0, 0, 0), cap, seg=40)
    k.lathe("gills", [(0.0, 2.55), (1.5, 2.62), (1.6, 2.7), (0.0, 2.66)], (0, 0, 0), under, seg=32)
    rnd = random.Random(5)
    for i in range(9):
        a = i * 2.399
        rr = 0.35 + 1.5 * math.sqrt((i + 0.5) / 9)
        z = 4.75 - 0.55 * (rr / 2.0) ** 2 * 1.6 - 0.02
        k.sphere(f"spot{i}", 0.2 + 0.1 * ((i * 3) % 3), (math.cos(a) * rr, math.sin(a) * rr, z), spot, scale=(1, 1, 0.45), seg=10, rings=6)
    vary = make_vary(0, 4.8, ao=0.2, noise=0.06)
    return k, vary


def crystals(variant="pink"):
    k = Kit(f"M_Cry_{variant}")
    cc = dict(pink=C['pink'], aqua=C['aqua'], lilac=C['lilac'])[variant]
    cm = vmat(f"c_{variant}", cc, 0.12, 0.0, coat=0.7, emit=tuple(c * 0.8 for c in cc) + (0.45,))
    cm2 = vmat(f"c2_{variant}", tuple(min(1, c * 0.6 + 0.4) for c in cc), 0.12, 0.0, coat=0.7)
    rock = vmat("c_rock", C['lilacd'], 0.6)
    k.sphere("rock", 0.95, (0, 0, 0.1), rock, scale=(1.15, 1.0, 0.45), seg=14, rings=8)
    rnd = random.Random(8)
    k.crystal("main", 0.42, 2.5, (0, 0, 0.2), cm, rot=(0.06, 0.0, 0), sides=6, tip=0.3)
    for i in range(6):
        a = i * 2 * math.pi / 6 + 0.4
        r = 0.7 + 0.15 * rnd.random()
        k.crystal(f"s{i}", 0.2 + 0.1 * rnd.random(), 1.0 + 0.9 * rnd.random(), (math.cos(a) * r, math.sin(a) * r, 0.15), cm2 if i % 2 else cm, rot=(math.sin(a) * 0.3, -math.cos(a) * 0.3, 0), sides=5, tip=0.35)
    vary = make_vary(0, 2.5, ao=0.2, noise=0.04)
    return k, vary


def boulder():
    """Rock-candy boulder with swirl stripes. ~2.4 m wide, 1.8 m tall."""
    k = Kit("M_Boulder")
    m1 = vmat("bo_a", C['pinkl'], 0.5, coat=0.2)
    m2 = vmat("bo_b", C['lilac'], 0.5)
    k.sphere("body", 1.2, (0, 0, 0.75), m1, scale=(1.05, 0.9, 0.8), seg=28, rings=18)
    ob = k.objs[-1]
    for v in ob.data.vertices:
        n = mnoise.noise(Vector((v.co.x * 1.3 + 3, v.co.y * 1.3, v.co.z * 1.3)))
        v.co *= (1.0 + 0.12 * n)
    k.sphere("lump", 0.6, (0.8, -0.3, 0.35), m2, scale=(1, 1, 0.8), seg=14, rings=10)
    k.sphere("lump2", 0.5, (-0.7, 0.5, 0.3), m2, scale=(1, 1, 0.8), seg=14, rings=10)
    k.sphere("top", 0.5, (0.1, 0.1, 1.5), vmat("bo_c", C['white'], 0.4), scale=(1.2, 1, 0.5), seg=14, rings=8)

    def stripe_fn(p, n):
        s = math.sin(4.0 * (p.x * 0.8 + p.y * 0.6) + 5.0 * p.z) > 0.2
        return (1, 1, 1) if s else (0.82, 0.58, 0.95)
    vary = make_vary(0, 1.8, ao=0.3, noise=0.05, stripe=stripe_fn)
    return k, vary


def pillar():
    """Fluted cream pillar topped by a giant soap bubble. ~3.4 m."""
    k = Kit("M_Pillar")
    cream = vmat("pi_cream", C['cream'], 0.45)
    pink = vmat("pi_pink", C['pink'], 0.4)
    gold = vmat("pi_gold", C['gold'], 0.28, 0.85)
    glass = glassm("pi_glass", (0.9, 0.95, 1.0), 0.24)
    pearl = vmat("pi_pearl", C['pink'], 0.2, 0.0, emit=(1.0, 0.5, 0.85, 2.5))
    k.cyl("plinth", 0.62, 0.3, (0, 0, 0.15), cream, seg=16, bevel=0.04)
    k.lathe("shaft", [(0.0, 0.3), (0.42, 0.3), (0.34, 0.5), (0.3, 1.5), (0.34, 2.3), (0.0, 2.3)], (0, 0, 0), cream, seg=24)
    for i in range(8):
        a = i * math.pi / 4
        k.cyl(f"flute{i}", 0.045, 1.7, (math.cos(a) * 0.3, math.sin(a) * 0.3, 1.4), pink, seg=6)
    k.cyl("cap", 0.5, 0.18, (0, 0, 2.38), gold, r2=0.42, seg=24, bevel=0.02)
    k.sphere("bub", 0.62, (0, 0, 3.0), glass, seg=28, rings=18)
    k.sphere("pearl", 0.2, (0, 0, 3.0), pearl, seg=14, rings=10)
    vary = make_vary(0, 3.4, ao=0.2, noise=0.04)
    return k, vary


def lamp():
    k = Kit("M_Lamp")
    cream = vmat("l_cream", C['cream'], 0.45)
    pk = vmat("l_pink", C['pink'], 0.35, coat=0.4)
    aq = vmat("l_aqua", C['aqua'], 0.35, coat=0.4)
    glow = vmat("l_glow", (1.0, 0.85, 0.5), 0.3, 0.0, emit=(1.0, 0.85, 0.5, 4.0))
    k.cyl("stick", 0.06, 2.1, (0, 0, 1.05), cream, seg=8)
    k.cyl("foot", 0.2, 0.12, (0, 0, 0.06), pk, seg=12, bevel=0.02)
    k.cyl("disc1", 0.52, 0.16, (0, 0, 2.5), pk, rot=(math.pi / 2, 0, 0), seg=28, bevel=0.03)
    k.cyl("disc2", 0.38, 0.2, (0, 0.03, 2.5), aq, rot=(math.pi / 2, 0, 0), seg=24, bevel=0.03)
    k.cyl("disc3", 0.22, 0.22, (0, 0.06, 2.5), cream, rot=(math.pi / 2, 0, 0), seg=18, bevel=0.03)
    k.sphere("bulb", 0.1, (0, 0.18, 2.5), glow, seg=10, rings=8)
    vary = make_vary(0, 3.0, ao=0.2, noise=0.04)
    return k, vary


def cotton_tree():
    k = Kit("M_Cotton")
    wood = vmat("ct_wood", C['wood'], 0.6)
    p1 = vmat("ct_p1", C['pinkl'], 0.8)
    p2 = vmat("ct_p2", C['aqual'], 0.8)
    p3 = vmat("ct_p3", C['lilac'], 0.8)
    k.lathe("trunk", [(0.0, 0.0), (0.45, 0.0), (0.3, 0.6), (0.24, 1.6), (0.2, 2.5), (0.0, 2.5)], (0, 0, 0), wood, seg=14)
    rnd = random.Random(12)
    spec = [(0, 0, 3.4, 1.15, p1), (0.9, 0.2, 2.9, 0.75, p2), (-0.8, 0.5, 3.0, 0.8, p3), (0.2, -0.9, 3.1, 0.75, p1), (-0.2, 0.2, 4.2, 0.7, p2), (0.5, 0.7, 3.8, 0.6, p3)]
    for i, (x, y, z, r, mm) in enumerate(spec):
        k.sphere(f"puff{i}", r, (x, y, z), mm, seg=16, rings=10)
        ob = k.objs[-1]
        for v in ob.data.vertices:
            v.co *= 1.0 + 0.1 * mnoise.noise(Vector((v.co.x * 3 + i, v.co.y * 3, v.co.z * 3)))
    vary = make_vary(0, 4.6, ao=0.2, noise=0.1)
    return k, vary


PIECES = dict(
    bg_fountain=fountain, bg_gumball=gumball, bg_mush_pink=lambda: mushroom("pink"), bg_mush_aqua=lambda: mushroom("aqua"), bg_mush_lilac=lambda: mushroom("lilac"),
    bg_cry_pink=lambda: crystals("pink"), bg_cry_aqua=lambda: crystals("aqua"), bg_cry_lilac=lambda: crystals("lilac"),
    bg_boulder=boulder, bg_pillar=pillar, bg_lamp=lamp, bg_cotton=cotton_tree,
)
