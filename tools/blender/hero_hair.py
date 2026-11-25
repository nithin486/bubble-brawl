import sys, random
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, hero_common as H
importlib.reload(H)
from hero_common import *

for o in list(bpy.data.objects):
    if o.name.startswith(("BH_Hair", "BH_Band", "BH_Gog", "BH_Knot", "BH_Tail")):
        bpy.data.objects.remove(o, do_unlink=True)

HC = Vector((0, 0, 1.61)); SC = Vector((0.318, 0.30, 0.305))
HAIR = mat("BH_HairMat", (0.20, 0.085, 0.04), rough=0.38, spec=0.6, coat=0.25)
HAIR2 = mat("BH_HairTip", (0.30, 0.13, 0.06), rough=0.38, spec=0.6, coat=0.25)
ORANGE = mat("BH_Orange", (0.95, 0.30, 0.04), rough=0.62, spec=0.3)
ORANGE_D = mat("BH_OrangeDark", (0.70, 0.18, 0.02), rough=0.65)
METAL = mat("BH_Metal", (0.62, 0.64, 0.68), rough=0.28, metal=1.0)
RIM = mat("BH_GogRim", (0.55, 0.22, 0.07), rough=0.35, metal=0.8)
FOAM = mat("BH_Foam", (0.08, 0.06, 0.06), rough=0.9)
GLASS = mat("BH_Glass", (0.40, 0.85, 1.0), rough=0.05, spec=1.0, coat=1.0, alpha=0.55, emit=(0.2, 0.7, 1.0, 0.25))

def unit_to_world(u):
    return HC + Vector((u.x * SC.x, u.y * SC.y, u.z * SC.z))

# ---------- scalp cap ----------
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=56, v_segments=36, radius=1.0)
kill = []
for v in bm.verts:
    u = v.co
    thr = 0.60 - 1.6 * max(0.0, u.y + 0.12)
    thr = max(thr, -0.80)
    # front: keep hair above the band only
    if u.y < -0.12: thr = 0.62
    if u.z < thr: kill.append(v)
bmesh.ops.delete(bm, geom=kill, context="VERTS")
for v in bm.verts:
    v.co = Vector((v.co.x * SC.x * 1.045, v.co.y * SC.y * 1.05, v.co.z * SC.z * 1.045)) + HC
cap = new_obj("BH_HairCap", bm)
finish(cap, HAIR, subsurf=1)
sol = cap.modifiers.new("Solid", "SOLIDIFY"); sol.thickness = 0.02; sol.offset = -1

# ---------- spiky clumps ----------
rnd = random.Random(11)
LS, RS = 0.62, 1.3
def clump(name, u, sweep, L, r0, curl, mat_=HAIR, seg=9):
    L *= LS; r0 *= RS
    u = Vector(u).normalized()
    p0 = unit_to_world(u * 1.03)
    n = Vector((u.x / SC.x, u.y / SC.y, u.z / SC.z)).normalized()
    d = (n + Vector(sweep)).normalized()
    pts, rad = [], []
    for i in range(seg):
        t = i / (seg - 1)
        p = p0 - n * 0.025 + d * (L * t) + Vector(curl) * (L * t * t)
        pts.append(p)
        w = (1 - t) ** 0.55
        rad.append((max(0.004, r0 * w), max(0.003, r0 * 0.62 * w)))
    o = tube(name, pts, rad, sides=8, twist=0.0)
    finish(o, mat_, subsurf=1)
    return o

def U(az, el):  # azimuth 0 = front (-Y), 90deg = +X right side; elevation from horizontal
    a, e = math.radians(az), math.radians(el)
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))

back = Vector((0.0, 0.55, 0.28))
# crown / top spikes sweeping up + back
specs = []
for i, (az, el, L, r) in enumerate([
    (0, 78, 0.25, 0.066), (40, 74, 0.27, 0.070), (-40, 74, 0.26, 0.068), (80, 66, 0.25, 0.066), (-80, 66, 0.24, 0.064),
    (120, 62, 0.27, 0.07), (-120, 62, 0.27, 0.07), (160, 58, 0.26, 0.068), (-160, 58, 0.26, 0.068), (180, 66, 0.28, 0.072),
    (20, 88, 0.30, 0.072), (-25, 90, 0.29, 0.07), (100, 82, 0.27, 0.066), (-100, 82, 0.27, 0.066),
    (140, 78, 0.29, 0.07), (-140, 78, 0.29, 0.07), (0, 60, 0.22, 0.06),
    (145, 38, 0.22, 0.066), (-145, 38, 0.22, 0.066), (180, 40, 0.24, 0.07), (165, 22, 0.2, 0.062), (-165, 22, 0.2, 0.062),
    (180, 18, 0.2, 0.06), (120, 30, 0.18, 0.06), (-120, 30, 0.18, 0.06),
]):
    sw = Vector((rnd.uniform(-0.12, 0.12), 1.0 + rnd.uniform(-0.15, 0.15), 0.12))
    cu = Vector((rnd.uniform(-0.15, 0.15), 0.55, 0.25))
    clump(f"BH_HairSpike{i:02d}", U(az, el), sw, L * rnd.uniform(0.92, 1.08), r, cu, HAIR if i % 3 else HAIR2)

# nape fringe: a few big swept clumps hide the cap edge (many small ones decimate into blobs)
for i, az in enumerate(range(100, 261, 20)):
    clump(f"BH_HairNape{i:02d}", U(az, -38 + (i % 2) * 14), Vector((0, 0.5, -0.8)), 0.2, 0.078, Vector((0, 0.1, -0.15)), HAIR if i % 2 else HAIR2)

# front bangs above the band, flicking forward and up
bangs = [(-48, 58, 0.22), (-24, 62, 0.25), (0, 64, 0.26), (24, 62, 0.25), (48, 58, 0.22)]
for i, (az, el, L) in enumerate(bangs):
    clump(f"BH_HairBang{i}", U(az, el), Vector((az / 160.0, -0.28, 0.55)), L, 0.056, Vector((0, 0.15, 0.55)), HAIR2 if i % 2 else HAIR)

# side tufts framing ears (sweep down/back)
for s in (-1, 1):
    clump(f"BH_HairSide{'L' if s<0 else 'R'}A", U(s * 88, 34), Vector((s * 0.15, 0.5, -0.65)), 0.17, 0.05, Vector((0, 0.1, -0.1)))
    clump(f"BH_HairSide{'L' if s<0 else 'R'}B", U(s * 74, 46), Vector((s * 0.1, 0.1, -0.45)), 0.14, 0.045, Vector((0, 0.0, -0.1)))

# ---------- headband (closed loop around head, orange fabric) ----------
def closed_band(name, zc, rx, ry, w, th, n=64, tilt=0.0):
    bm = bmesh.new()
    rings = []
    for i in range(n):
        a = 2 * math.pi * i / n
        px, py = math.cos(a) * rx, math.sin(a) * ry
        pz = zc + tilt * (-math.sin(a)) * -1 * 0.0 + tilt * (math.sin(a))
        nrm = Vector((math.cos(a) / rx, math.sin(a) / ry, 0)).normalized()
        c = Vector((px, py, pz))
        ring = []
        for (dz, dn) in ((-w / 2, 0.0), (-w / 2 * 0.98, th), (0, th * 1.25), (w / 2 * 0.98, th), (w / 2, 0.0)):
            ring.append(bm.verts.new(c + nrm * dn + Vector((0, 0, dz))))
        # inner side
        for (dz, dn) in ((w / 2, -th * 0.2), (-w / 2, -th * 0.2)):
            ring.append(bm.verts.new(c + nrm * dn + Vector((0, 0, dz))))
        rings.append(ring)
    m = len(rings[0])
    for i in range(n):
        for k in range(m):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % m], rings[(i + 1) % n][(k + 1) % m], rings[(i + 1) % n][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)

band = closed_band("BH_Band", 0, 1, 1, 1, 1) if False else None
bandz = 1.61 + 0.30 * 0.62
# head cross-section radii at that height (ellipsoid)
k = math.sqrt(1 - 0.62 ** 2)
rx, ry = SC.x * k * 1.012 + 0.006, SC.y * k * 1.012 + 0.006
band = closed_band("BH_Band", bandz, rx, ry, 0.062, 0.014, n=72)
# slight forward-down tilt: shear z by y
for v in band.data.vertices:
    v.co.z += -0.035 * (v.co.y / ry) * -1 * 0.6 + 0.0
finish(band, ORANGE, subsurf=1)

# knot at back + two tails
kz = bandz - 0.002
knot = sphere("BH_Knot", (0.0, ry + 0.035, kz), (0.05, 0.04, 0.045), 24, 14)
finish(knot, ORANGE, subsurf=1)
for i, s in enumerate((-1, 1)):
    pts = []
    for j in range(8):
        t = j / 7
        pts.append((s * (0.02 + 0.07 * t + 0.02 * math.sin(t * 3.0)), ry + 0.05 + 0.15 * t, kz - 0.02 - 0.25 * t * (0.9 + 0.1 * i) + 0.02 * math.sin(t * 5)))
    rad = [(0.006 + 0.026 * (1 - 0.35 * j / 7), 0.011) for j in range(8)]
    tail = tube(f"BH_Tail{i}", pts, [(0.008, 0.03 * (1 - 0.3 * j / 7)) for j in range(8)], sides=6)
    finish(tail, ORANGE_D if i else ORANGE, subsurf=1)

# ---------- goggles on the headband ----------
def ring_loop(name, c, r, tube_r, n=40, m=10):
    pts = []
    bm = bmesh.new()
    rings = []
    for i in range(n):
        a = 2 * math.pi * i / n
        ctr = Vector((math.cos(a) * r, 0, math.sin(a) * r))
        nr = Vector((math.cos(a), 0, math.sin(a)))
        ring = []
        for k in range(m):
            b = 2 * math.pi * k / m
            ring.append(bm.verts.new(c + ctr + nr * math.cos(b) * tube_r + Vector((0, 1, 0)) * math.sin(b) * tube_r))
        rings.append(ring)
    for i in range(n):
        for k in range(m):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % m], rings[(i + 1) % n][(k + 1) % m], rings[(i + 1) % n][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)

gz = bandz + 0.045
gy = -(ry + 0.028)
tilt = math.radians(-14)
parts = []
for s, side in ((-1, "L"), (1, "R")):
    cx = s * 0.092
    c = Vector((cx, 0, 0))
    rim = ring_loop(f"BH_GogRim_{side}", c, 0.058, 0.0125); finish(rim, RIM, subsurf=1); parts.append(rim)
    rim2 = ring_loop(f"BH_GogRim2_{side}", c + Vector((0, 0.012, 0)), 0.052, 0.009); finish(rim2, METAL, subsurf=1); parts.append(rim2)
    lens = sphere(f"BH_GogGlass_{side}", c + Vector((0, 0.002, 0)), (0.054, 0.020, 0.054), 28, 14); finish(lens, GLASS, subsurf=0); parts.append(lens)
    foam = sphere(f"BH_GogFoam_{side}", c + Vector((0, 0.028, 0)), (0.060, 0.016, 0.060), 28, 12); finish(foam, FOAM, subsurf=0); parts.append(foam)
    for a in (35, 215):
        bolt = sphere(f"BH_GogBolt_{side}{a}", c + Vector((math.cos(math.radians(a)) * 0.071, -0.012, math.sin(math.radians(a)) * 0.071)), (0.007, 0.007, 0.007), 10, 6); finish(bolt, METAL, subsurf=0); parts.append(bolt)
bridge = tube("BH_GogBridge", [(-0.04, 0, 0), (0, -0.004, 0.004), (0.04, 0, 0)], [0.009, 0.011, 0.009], sides=8); finish(bridge, RIM, subsurf=1); parts.append(bridge)
M = Matrix.Translation((0, gy, gz)) @ Matrix.Rotation(tilt, 4, "X")
for o in parts:
    o.matrix_world = M @ o.matrix_world

H.studio()
_shoot = (lambda *a, **k: None) if globals().get("NORENDER") else H.shoot
bpy.context.scene.cycles.samples = 20
_shoot("test_hair_34", (-1.5, -1.6, 1.95), (0, 0, 1.62), lens=80, res=(700, 700))
_shoot("test_hair_back", (1.4, 1.7, 1.9), (0, 0, 1.62), lens=80, res=(700, 700))
