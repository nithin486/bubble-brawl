exec(open(r"C:\Users\User\Desktop\bubble-brawl\tools\blender\map\m_common.py").read())


def _base(k, R, depth, seed, grass, rimc):
    """Floating island body: grass cap with icing rim, layered rock-candy underside with stalactite crystals."""
    rnd = random.Random(seed)
    g = vmat("is_grass", grass, 0.6)
    rim = vmat("is_rim", rimc, 0.5)
    rock = vmat("is_rock", C['lilacd'], 0.6)
    rock2 = vmat("is_rock2", C['pink'], 0.5)
    prof = [(0.0, -0.4), (R * 0.97, -0.4), (R * 1.0, -0.1), (R * 0.98, 0.0), (R * 0.8, 0.12), (R * 0.4, 0.16), (0.0, 0.16)]
    k.lathe("grass", [(r, z - 0.0) for r, z in prof], (0, 0, 0), g, seg=28)
    k.lathe("rimring", [(R * 0.98, -0.2), (R * 1.04, -0.5), (R * 1.0, -1.0), (R * 0.95, -1.0), (R * 0.95, -0.2)], (0, 0, 0), rim, seg=28)
    k.lathe("rockA", [(0.0, -depth), (R * 0.22, -depth * 0.85), (R * 0.55, -depth * 0.45), (R * 0.88, -1.0), (R * 0.9, -0.6), (0.0, -0.6)], (0, 0, 0), rock, seg=14)
    for i in range(6):
        a = i * math.pi / 3 + rnd.random() * 0.4
        rr = R * rnd.uniform(0.35, 0.7)
        L = depth * rnd.uniform(0.35, 0.65)
        k.crystal(f"st{i}", 0.45 + rnd.random() * 0.35, L, (math.cos(a) * rr, math.sin(a) * rr, -L - 0.8), rock2 if i % 2 else rock, rot=(math.pi, 0, 0), sides=5, tip=0.5)
    # grass tufts/flowers on the cap
    for i in range(10):
        a = rnd.uniform(0, 6.28); rr = R * math.sqrt(rnd.random()) * 0.85
        k.sphere(f"fl{i}", 0.22, (math.cos(a) * rr, math.sin(a) * rr, 0.2), vmat(f"is_f{i%3}", [C['pinkl'], C['yellow'], C['white']][i % 3], 0.5), seg=6, rings=4)
    return rnd


def _wfall(k, R, ang, drop=26):
    wm = vmat("is_water", (0.7, 0.95, 1.0), 0.05, 0.0, alpha=0.55, emit=(0.4, 0.85, 1.0, 1.0))
    ca, sa = math.cos(ang), math.sin(ang)
    pts = [(ca * (R - 0.3), sa * (R - 0.3), 0.1), (ca * (R + 0.4), sa * (R + 0.4), -0.5), (ca * (R + 0.9), sa * (R + 0.9), -3.0), (ca * (R + 1.1), sa * (R + 1.1), -drop)]
    k.tube("wf", pts, [(0.5, 0.12), (0.55, 0.12), (0.6, 0.1), (0.55, 0.08)], wm, sides=6)
    k.sphere("foam", 1.3, (ca * (R + 1.1), sa * (R + 1.1), -drop), vmat("is_foam", (1, 1, 1), 0.4, 0.0, emit=(0.8, 0.95, 1.0, 0.6)), scale=(1, 1, 0.5), seg=10, rings=6)


def islet(kind):
    k = Kit(f"M_Islet_{kind}")
    R = 7.0
    rnd = _base(k, R, 8.5, {"a": 1, "b": 2, "c": 3}[kind], C['mint'] if kind != 'c' else C['grass'], C['pinkl'] if kind != 'b' else C['cream'])
    cream = vmat("is_cream", C['cream'], 0.5)
    pk = vmat("is_pk", C['pink'], 0.4)
    aq = vmat("is_aq", C['aqua'], 0.4)
    gold = vmat("is_gold", C['gold'], 0.3, 0.8)
    if kind == "a":  # candy forest
        for i, (x, y, r, cc) in enumerate([(-2.5, 1.0, 1.0, C['pink']), (1.5, -2.2, 0.8, C['aqua']), (2.8, 2.2, 0.9, C['lilac'])]):
            cap = vmat(f"is_cap{i}", cc, 0.4)
            k.lathe(f"stem{i}", [(0.0, 0.0), (0.5 * r, 0.0), (0.32 * r, 1.0 * r), (0.4 * r, 2.2 * r), (0.0, 2.2 * r)], (x, y, 0.1), cream, seg=12)
            k.lathe(f"cap{i}", [(0.0, 2.0 * r), (1.5 * r, 2.2 * r), (1.9 * r, 2.8 * r), (1.3 * r, 3.5 * r), (0.0, 3.8 * r)], (x, y, 0.1), cap, seg=18)
            k.sphere(f"sp{i}", 0.25 * r, (x + 0.4 * r, y + 0.3 * r, 0.1 + 3.65 * r), cream, scale=(1, 1, 0.5), seg=8, rings=5)
        for i, (x, y) in enumerate([(-0.5, -2.8), (-3.4, -1.5), (0.8, 3.0)]):
            k.lathe(f"tr{i}", [(0.0, 0.0), (0.3, 0.0), (0.18, 2.0), (0.0, 2.0)], (x, y, 0.1), vmat("is_wood", C['wood'], 0.6), seg=8)
            for j, (dx, dy, dz, rr) in enumerate([(0, 0, 2.6, 1.0), (0.7, 0.2, 2.2, 0.65), (-0.6, 0.3, 2.3, 0.7)]):
                k.sphere(f"puff{i}{j}", rr, (x + dx, y + dy, 0.1 + dz), vmat(f"is_puff{(i+j)%3}", [C['pinkl'], C['aqual'], C['lilac']][(i + j) % 3], 0.8), seg=10, rings=7)
        _wfall(k, R, 0.9)
    elif kind == "b":  # candy castle
        k.cyl("keep", 1.9, 3.8, (0, 0, 1.9), cream, seg=14, bevel=0.0)
        k.cyl("keeproof", 2.3, 0.2, (0, 0, 3.9), gold, seg=14)
        k.cyl("roof", 2.1, 3.0, (0, 0, 5.4), pk, r2=0.02, seg=14)
        k.sphere("fin", 0.3, (0, 0, 7.05), gold, seg=8, rings=6)
        for i in range(4):
            a = i * math.pi / 2 + math.pi / 4
            x, y = math.cos(a) * 3.8, math.sin(a) * 3.8
            k.cyl(f"tw{i}", 0.85, 2.8, (x, y, 1.4), cream, seg=10)
            k.cyl(f"twr{i}", 1.0, 1.8, (x, y, 3.7), aq if i % 2 else pk, r2=0.02, seg=10)
            k.sphere(f"twb{i}", 0.17, (x, y, 4.7), gold, seg=6, rings=4)
        for i in range(8):
            a = i * math.pi / 4
            k.box(f"wall{i}", (2.0, 0.4, 1.2), (math.cos(a) * 3.8 * 0.92, math.sin(a) * 3.8 * 0.92, 0.6), cream, rot=(0, 0, a + math.pi / 2), bevel=0.0) if i % 2 else None
        k.box("gate", (1.0, 0.3, 1.5), (0, -1.95, 0.75), pk, bevel=0.0)
        _wfall(k, R, -2.0)
    else:  # crystal garden
        for i in range(7):
            a = i * 2 * math.pi / 7
            rr = 0.0 if i == 0 else rnd.uniform(1.4, 2.8)
            h = 5.5 if i == 0 else rnd.uniform(1.8, 4.0)
            cc = [C['pink'], C['aqua'], C['lilac']][i % 3]
            cm = vmat(f"is_cry{i%3}", cc, 0.12, 0.0, coat=0.7, emit=tuple(c * 0.8 for c in cc) + (0.5,))
            k.crystal(f"cry{i}", 0.7 + 0.4 * rnd.random(), h, (math.cos(a) * rr, math.sin(a) * rr, 0.1), cm, rot=(math.sin(a) * 0.15, -math.cos(a) * 0.15, 0), sides=6, tip=0.3)
        k.torus("arch", 2.2, 0.35, (-3.2, 2.5, 0.1), cream, rot=(math.pi / 2, 0, 0.6), seg=24, sides=8)
        k.cyl("hide1", 0.0001, 0.0001, (0, 0, -9), cream, seg=3)
        k.sphere("gbl", 0.8, (3.2, -2.4, 1.0), vmat("is_gb", C['pink'], 0.3, coat=0.5), seg=14, rings=10)
        _wfall(k, R, 2.4)
    vary = make_vary(-8, 8, ao=0.0, noise=0.1, grad=lambda p, t: (0.55 + 0.6 * t, 0.5 + 0.55 * t, 0.65 + 0.4 * t))
    # keep the top bright: gradient applies to the underside only
    def v2(p, n, base):
        c = vary(p, n, base)
        if p.z > -0.5:
            return base[0] * 1.0, base[1] * 1.0, base[2] * 1.0
        return c
    return k, v2


PIECES = dict(bg_islet_a=lambda: islet("a"), bg_islet_b=lambda: islet("b"), bg_islet_c=lambda: islet("c"))
