exec(open(r"C:\Users\User\Desktop\bubble-brawl\tools\blender\map\m_common.py").read())

SPR = [C['pink'], C['aqua'], C['yellow'], C['white'], C['lilac'], C['orange']]


def tile(variant, seed):
    """4x4 m floating-island tile, top surface at z=1.0, base at z=0."""
    rnd = random.Random(seed)
    k = Kit(f"M_Tile_{variant}")
    top_c = dict(pink=C['pink'], mint=C['mint'], mint2=(0.14, 0.72, 0.58), cream=C['cream'], lilac=C['lilac'], lilac2=(0.95, 0.4, 0.78), sky=C['aqua'], sky2=(0.1, 0.58, 0.95))[variant]
    side = vmat(f"t_side_{variant}", C['cream'], 0.6)
    top = vmat(f"t_top_{variant}", top_c, 0.5)
    k.box("core", (3.9, 3.9, 0.7), (0, 0, 0.35), side, bevel=0.0)
    k.box("cap", (4.0, 4.0, 0.34), (0, 0, 0.83), top, bevel=0.1, seg=2)
    # icing drips down the four sides
    for side_i in range(4):
        a = side_i * math.pi / 2
        for j in range(2):
            t = (j - 0.5) * 2.0 + rnd.uniform(-0.3, 0.3)
            ln = rnd.uniform(1.4, 2.6)
            r = rnd.uniform(0.1, 0.16)
            x, y = (1.98 * math.cos(a) - t * math.sin(a), 1.98 * math.sin(a) + t * math.cos(a))
            k.sphere(f"drip{side_i}{j}", r, (x, y, 0.72 - ln * r * 0.5), top, scale=(1, 1, ln), seg=4, rings=3)
    # decoration
    if variant in ("pink", "lilac", "sky", "lilac2", "sky2"):
        for i in range(5):
            x, y = rnd.uniform(-1.6, 1.6), rnd.uniform(-1.6, 1.6)
            c = SPR[rnd.randrange(len(SPR))]
            m = vmat(f"spr{i%6}", c, 0.4)
            k.cyl(f"spr{i}", 0.035, 0.24, (x, y, 1.03), m, rot=(math.pi / 2, 0, rnd.uniform(0, 3.14)), seg=4)
    elif variant in ("mint", "mint2"):
        for i in range(5):
            x, y = rnd.uniform(-1.6, 1.6), rnd.uniform(-1.6, 1.6)
            fc = [C['pinkl'], C['yellow'], C['white']][i % 3]
            m = vmat(f"fl{i%3}", fc, 0.5)
            k.sphere(f"fl{i}", 0.07, (x, y, 1.05), m, seg=6, rings=4)
        for i in range(3):
            x, y = rnd.uniform(-1.6, 1.6), rnd.uniform(-1.6, 1.6)
            k.sphere(f"tuft{i}", 0.13, (x, y, 1.02), vmat("tuft", C['grass'], 0.6), scale=(1, 1, 0.7), seg=6, rings=4)
    elif variant == "cream":
        for i in range(9):
            x, y = (i % 3 - 1) * 1.2 + rnd.uniform(-0.1, 0.1), (i // 3 - 1) * 1.2 + rnd.uniform(-0.1, 0.1)
            k.box(f"pave{i}", (0.95, 0.95, 0.06), (x, y, 1.0), vmat("pave", C['cream2'], 0.55), rot=(0, 0, rnd.uniform(-0.2, 0.2)), bevel=0.0)
    vary = make_vary(0, 1.0, ao=0.25, noise=0.07)
    return k, vary


def under(seed=3):
    """Rock-candy underside (base z=0 at the bottom tip, top z=2.6 = tile bottom). Very light: one per tile."""
    k = Kit("M_Under")
    rock = vmat("u_rock", C['lilacd'], 0.6)
    rock2 = vmat("u_rock2", C['pink'], 0.55)
    k.cyl("fr", 1.7, 1.9, (0, 0, 1.65), rock, rot=(0, 0, math.pi / 4), r2=2.8, seg=4)
    k.cyl("fr2", 0.7, 0.9, (0, 0, 0.78), rock, rot=(0, 0, math.pi / 4), r2=1.7, seg=4)
    k.crystal("c0", 0.3, 1.0, (0, 0, 0.9), rock2, rot=(math.pi, 0, 0), sides=5, tip=0.5)
    for i in range(3):
        a = i * 2 * math.pi / 3 + 0.4
        k.crystal(f"c{i+1}", 0.14, 0.6, (math.cos(a) * 0.9, math.sin(a) * 0.9, 1.1), rock2, rot=(math.pi, 0, 0), sides=4, tip=0.5)
    vary = make_vary(0, 2.6, ao=0.0, noise=0.1, grad=lambda p, t: (0.55 + 0.6 * t, 0.5 + 0.55 * t, 0.7 + 0.35 * t))
    return k, vary


def bridge(seed=5):
    """Bridge across a 4 m gap, running along Y. Deck top at z=1.0, 3.0 m wide, rails at x=+-1.5."""
    rnd = random.Random(seed)
    k = Kit("M_Bridge")
    pl = [vmat("b_pl0", C['pinkl'], 0.5), vmat("b_pl1", C['cream'], 0.5), vmat("b_pl2", C['aqual'], 0.5)]
    wood = vmat("b_beam", C['wood'], 0.6)
    cane = vmat("b_cane", C['pink'], 0.45)
    cane2 = vmat("b_cane2", C['white'], 0.45)
    rope = vmat("b_rope", C['cream2'], 0.7)
    gold = vmat("b_gold", C['gold'], 0.3, 0.8)
    n = 8
    L = 4.0
    for i in range(n):
        y = -L / 2 + (i + 0.5) * L / n
        k.box(f"plank{i}", (3.0, L / n - 0.05, 0.14), (0, y, 0.93), pl[i % 3], bevel=0.0)
    for sgn in (-1, 1):
        k.box(f"beam{sgn}", (0.22, L, 0.2), (sgn * 1.25, 0, 0.78), wood, bevel=0.0)
        k.box(f"edge{sgn}", (0.16, L, 0.12), (sgn * 1.5, 0, 1.0), cream if False else pl[1], bevel=0.0)
    # candy-cane posts + gumball tops, rope rails
    for sgn in (-1, 1):
        for yy in (-1.85, 0.0, 1.85):
            for q in range(3):
                k.cyl(f"post{sgn}{yy}{q}", 0.1, 0.33, (sgn * 1.5, yy, 1.17 + q * 0.33), cane if q % 2 == 0 else cane2, seg=6)
            k.sphere(f"ball{sgn}{yy}", 0.17, (sgn * 1.5, yy, 2.18), vmat(f"gb{(sgn+1)//2}", [C['aqua'], C['yellow']][(sgn + 1) // 2], 0.25, coat=0.5), seg=10, rings=8)
        pts = [(sgn * 1.5, -1.85, 1.85), (sgn * 1.5, -0.9, 1.7), (sgn * 1.5, 0.0, 1.66), (sgn * 1.5, 0.9, 1.7), (sgn * 1.5, 1.85, 1.85)]
        k.tube(f"rope{sgn}", pts, 0.05, rope, sides=4)
        pts2 = [(x, y, z - 0.45) for x, y, z in pts]
        k.tube(f"rope2{sgn}", pts2, 0.04, rope, sides=4)
    # little bunting flags
    for sgn in (-1, 1):
        for i in range(2):
            yy = -0.9 + i * 1.8
            k.box(f"flag{sgn}{i}", (0.02, 0.24, 0.26), (sgn * 1.5, yy, 1.45), vmat(f"flg{i%3}", [C['pink'], C['yellow'], C['aqua']][i % 3], 0.5), rot=(0.0, 0.0, 0), bevel=0.0)
    vary = make_vary(0.6, 1.8, ao=0.25, noise=0.07)
    return k, vary


def block(seed=1):
    """4x4x1.2 raised deck cell (candy block)."""
    rnd = random.Random(seed)
    k = Kit("M_Block")
    base = vmat("k_base", C['pink'], 0.45)
    trim = vmat("k_trim", C['cream'], 0.5)
    k.box("body", (4.0, 4.0, 1.1), (0, 0, 0.55), base, bevel=0.1, seg=2)
    k.box("cap", (4.06, 4.06, 0.14), (0, 0, 1.13), trim, bevel=0.06, seg=3)
    for i in range(4):
        a = i * math.pi / 2
        for j in range(3):
            t = (j - 1) * 1.15 + rnd.uniform(-0.2, 0.2)
            x, y = (2.03 * math.cos(a) - t * math.sin(a), 2.03 * math.cos(a - math.pi / 2) * 0 + 2.03 * math.sin(a) + t * math.cos(a))
            k.sphere(f"dr{i}{j}", 0.13, (x, y, 0.95 - 0.12), trim, scale=(1, 1, 2.0), seg=8, rings=6)
    vary = make_vary(0, 1.2, ao=0.2, noise=0.06)
    return k, vary


def ramp(w=3.2, ln=6.0, h=1.2):
    """Ascends towards -Y (glTF +Z): low end at +ln/2, high end at -ln/2."""
    k = Kit("M_Ramp")
    pa = vmat("r_a", C['pinkl'], 0.5)
    pb = vmat("r_b", C['cream'], 0.5)
    trim = vmat("r_trim", C['pink'], 0.45)
    n = 12
    for i in range(n):
        y0 = ln / 2 - i * ln / n
        y1 = ln / 2 - (i + 1) * ln / n
        z0 = h * i / n + 0.0
        z1 = h * (i + 1) / n
        bm = bmesh.new()
        v = [bm.verts.new(p) for p in [(-w / 2, y0, z0), (w / 2, y0, z0), (w / 2, y1, z1), (-w / 2, y1, z1),
                                      (-w / 2, y0, 0), (w / 2, y0, 0), (w / 2, y1, 0), (-w / 2, y1, 0)]]
        for f in [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
            bm.faces.new([v[j] for j in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        k.mesh(f"seg{i}", bm, pa if i % 2 == 0 else pb, smooth=False)
    # side curbs following the slope
    for sgn in (-1, 1):
        bm = bmesh.new()
        x0, x1 = sgn * (w / 2 - 0.02), sgn * (w / 2 + 0.2)
        pts = [(x0, ln / 2, 0), (x1, ln / 2, 0), (x1, -ln / 2, 0), (x0, -ln / 2, 0), (x0, ln / 2, 0.28), (x1, ln / 2, 0.28), (x1, -ln / 2, h + 0.28), (x0, -ln / 2, h + 0.28)]
        v = [bm.verts.new(p) for p in pts]
        for f in [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
            bm.faces.new([v[j] for j in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        k.mesh(f"curb{sgn}", bm, trim, bevel=0.04, smooth=True)
        k.sphere(f"knob{sgn}", 0.2, (sgn * (w / 2 + 0.1), -ln / 2 + 0.2, h + 0.4), vmat("r_knob", C['aqua'], 0.3, coat=0.5), seg=14, rings=10)
    vary = make_vary(0, 1.4, ao=0.15, noise=0.05)
    return k, vary


def plaza(apo=5.0, h=1.2):
    """Octagonal raised plaza (flat-to-flat 2*apo), top at z=h."""
    k = Kit("M_Plaza")
    R = apo / math.cos(math.pi / 8)
    base = vmat("p_base", C['cream'], 0.5)
    top = vmat("p_top", C['pinkl'], 0.45)
    ring = vmat("p_ring", C['pink'], 0.4)
    star = vmat("p_star", C['aqua'], 0.4)
    gold = vmat("p_gold", C['gold'], 0.3, 0.8)
    k.cyl("body", R, h - 0.1, (0, 0, (h - 0.1) / 2), base, rot=(0, 0, math.pi / 8), seg=8, bevel=0.06, seg_=1) if False else k.cyl("body", R, h - 0.1, (0, 0, (h - 0.1) / 2), base, rot=(0, 0, math.pi / 8), seg=8)
    k.cyl("topdisc", R - 0.12, 0.16, (0, 0, h - 0.08), top, rot=(0, 0, math.pi / 8), seg=8)
    # inlaid rings + star points
    for rr, tt, mm in ((3.6, 0.07, ring), (2.9, 0.05, gold), (4.35, 0.08, star)):
        k.torus(f"ring{rr}", rr, tt, (0, 0, h + 0.0), mm, seg=32, sides=4)
    for i in range(8):
        a = i * math.pi / 4
        k.box(f"spoke{i}", (0.16, 1.0, 0.05), (math.cos(a) * 3.6, math.sin(a) * 3.6, h + 0.02), star, rot=(0, 0, a + math.pi / 2), bevel=0.02, seg=2)
        k.cyl(f"gem{i}", 0.2, 0.18, (math.cos(a) * 4.35, math.sin(a) * 4.35, h + 0.06), ring if i % 2 else gold, seg=6)
    # hanging icing drips on the 8 flats
    rnd = random.Random(4)
    for i in range(8):
        a = i * math.pi / 4
        for j in range(2):
            t = (j - 0.5) * 2.4 + rnd.uniform(-0.3, 0.3)
            x, y = (apo * math.cos(a) - t * math.sin(a)), (apo * math.sin(a) + t * math.cos(a))
            k.sphere(f"drip{i}{j}", 0.15, (x, y, h - 0.45), vmat("p_drip", C['pinkl'], 0.5), scale=(1, 1, 2.3), seg=6, rings=4)
    vary = make_vary(0, h, ao=0.18, noise=0.05)
    return k, vary


PIECES = dict(
    bg_tile_pink=lambda: tile("pink", 11), bg_tile_mint=lambda: tile("mint", 12), bg_tile_cream=lambda: tile("cream", 13),
    bg_tile_lilac=lambda: tile("lilac", 14), bg_tile_sky=lambda: tile("sky", 15), bg_tile_mint2=lambda: tile("mint2", 16), bg_tile_sky2=lambda: tile("sky2", 17), bg_tile_lilac2=lambda: tile("lilac2", 18),
    bg_under=under, bg_bridge=bridge, bg_block=block, bg_ramp=ramp, bg_ramp4=lambda: ramp(3.2, 4.0, 1.2), bg_plaza=plaza,
)
