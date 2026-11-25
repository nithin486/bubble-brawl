"""Shared helpers for the Bubble Brawl hero build (run inside Blender via BlenderMCP).
Character faces -Y, Z up, metres, T-pose to match the KayKit rig ("Rig.001")."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

OUT = r"C:\Users\User\Desktop\bubble-brawl\assets\characters\bubble_hero"
COL = "BubbleHero"


def collection():
    c = bpy.data.collections.get(COL)
    if not c:
        c = bpy.data.collections.new(COL)
        bpy.context.scene.collection.children.link(c)
    return c


def link(o):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    collection().objects.link(o)
    return o


def mat(name, color, rough=0.5, metal=0.0, spec=0.5, coat=0.0, emit=None, alpha=1.0, sss=0.0, trans=0.0, ior=1.45):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    def s(k, v):
        if k in b.inputs:
            b.inputs[k].default_value = v
    s("Base Color", (*color[:3], 1))
    s("Roughness", rough); s("Metallic", metal)
    s("Specular IOR Level", spec)
    s("Coat Weight", coat)
    s("Subsurface Weight", sss)
    s("Subsurface Radius", (1.0, 0.35, 0.2))
    s("Transmission Weight", trans); s("IOR", ior)
    s("Alpha", alpha)
    if emit:
        s("Emission Color", (*emit[:3], 1)); s("Emission Strength", emit[3] if len(emit) > 3 else 1.0)
    return m


def finish(o, m=None, subsurf=1, smooth=True, crease=None):
    link(o)
    if m:
        o.data.materials.clear(); o.data.materials.append(m)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    if subsurf:
        md = o.modifiers.new("Subsurf", "SUBSURF")
        md.levels = subsurf; md.render_levels = subsurf
    return o


def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def sphere(name, center, scale, seg=32, rings=20, deform=None, front=False):
    """UV sphere -> scaled ellipsoid; deform(v_unit, v_world) may push vertices."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        u = v.co.copy()
        p = Vector((u.x * scale[0], u.y * scale[1], u.z * scale[2]))
        if deform:
            p = deform(u, p)
        v.co = p + Vector(center)
    if front:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co.y - center[1]) / scale[1] > 0.25], context="VERTS")
    bm.normal_update()
    return new_obj(name, bm)


def tube(name, pts, radii, sides=12, cap=True, twist=0.0):
    """Swept tube along polyline pts (list of Vector-likes) with per-point radius (float or (rx,rz))."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        if i == 0: t = pts[1] - pts[0]
        elif i == n - 1: t = pts[-1] - pts[-2]
        else: t = pts[i + 1] - pts[i - 1]
        t.normalize()
        ref = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
        a = t.cross(ref).normalized(); b = t.cross(a).normalized()
        r = radii[i]
        rx, rz = (r, r) if not isinstance(r, (tuple, list)) else r
        ring = []
        for k in range(sides):
            ang = 2 * math.pi * k / sides + twist * i
            ring.append(bm.verts.new(p + a * math.cos(ang) * rx + b * math.sin(ang) * rz))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
    if cap:
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)


def gauss(x, y, cx, cy, sx, sy):
    return math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2))


def clear_hero():
    for o in list(bpy.data.objects):
        if o.name.startswith("BH_"):
            bpy.data.objects.remove(o, do_unlink=True)


def studio(res=(1200, 1200)):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 40; sc.cycles.use_denoising = True
    try: sc.cycles.device = "GPU"
    except Exception: pass
    sc.view_settings.view_transform = "AgX"
    try: sc.view_settings.look = "AgX - Punchy"
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    w = bpy.data.worlds.get("BHWorld") or bpy.data.worlds.new("BHWorld")
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.62, 0.74, 0.95, 1); bg.inputs[1].default_value = 0.55
    sc.world = w
    for n in ("BH_Key", "BH_Fill", "BH_Rim", "BH_Floor"):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    def light(n, kind, loc, energy, color, size=2.0, tgt=(0, 0, 1.0)):
        d = bpy.data.lights.new(n, kind); d.energy = energy; d.color = color
        if kind == "AREA": d.size = size
        o = bpy.data.objects.new(n, d); bpy.context.scene.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    light("BH_Key", "AREA", (-2.6, -3.0, 3.4), 70, (1.0, 0.95, 0.88), 3.0)
    light("BH_Fill", "AREA", (3.2, -2.2, 1.6), 28, (0.75, 0.85, 1.0), 3.0)
    light("BH_Rim", "AREA", (1.5, 3.0, 2.8), 55, (1.0, 0.85, 0.7), 2.0)
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=2.4, fill_type="NGON", location=(0, 0, -0.005))
    fl = bpy.context.active_object; fl.name = "BH_Floor"
    fm = mat("BH_FloorMat", (0.55, 0.62, 0.8), rough=0.85)
    fl.data.materials.append(fm)


def shoot(name, loc, target, lens=70, res=(1000, 1000), hide=()):
    sc = bpy.context.scene
    cam = bpy.data.objects.get("BH_Cam")
    if not cam:
        cam = bpy.data.objects.new("BH_Cam", bpy.data.cameras.new("BH_Cam"))
        bpy.context.scene.collection.objects.link(cam)
    cam.data.lens = lens
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = res
    os.makedirs(os.path.join(OUT, "renders"), exist_ok=True)
    fp = os.path.join(OUT, "renders", name + ".png")
    sc.render.filepath = fp
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return fp
