"""Shared Blender toolkit for Bubble Brawl phase 2 (weapons + Bubblegum Islands). Run inside Blender via BlenderMCP.
Conventions: Z up, metres, export with +Y up (glTF). Weapons point along +X, upright items stand on Z."""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, Euler

ROOT = r"C:\Users\User\Desktop\bubble-brawl"
MODELS = ROOT + r"\assets\models"
RENDERS = ROOT + r"\assets\phase2\renders"
os.makedirs(RENDERS, exist_ok=True)

# ---------------------------------------------------------------- palette (one universe)
PAL = dict(
    pink=(1.0, 0.36, 0.66), pink_d=(0.78, 0.16, 0.45), pink_l=(1.0, 0.72, 0.86),
    aqua=(0.22, 0.84, 1.0), aqua_d=(0.05, 0.46, 0.78), aqua_l=(0.76, 0.97, 1.0),
    cream=(1.0, 0.94, 0.82), navy=(0.13, 0.12, 0.38), navy_l=(0.26, 0.24, 0.6),
    gold=(1.0, 0.72, 0.18), gold_d=(0.72, 0.42, 0.06), orange=(1.0, 0.47, 0.12), red=(0.92, 0.18, 0.2),
    yellow=(1.0, 0.86, 0.16), lime=(0.55, 0.9, 0.22), violet=(0.55, 0.3, 1.0), steel=(0.72, 0.76, 0.84),
    white=(1, 1, 1), mint=(0.45, 0.95, 0.75), purple=(0.42, 0.22, 0.85),
)


import time
GEN = [time.time()]


def mat(name, color, rough=0.45, metal=0.0, emit=None, alpha=1.0, coat=0.0, spec=0.5):
    m = bpy.data.materials.get(name)
    if m:
        if m.get("gen") == GEN[0]:
            return m  # already built for this asset (same name = same material)
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m["gen"] = GEN[0]
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    def s(k, v):
        if k in b.inputs:
            b.inputs[k].default_value = v
    s("Base Color", (*color[:3], 1)); s("Roughness", rough); s("Metallic", metal)
    s("Specular IOR Level", spec); s("Coat Weight", coat); s("Alpha", alpha)
    if emit:
        s("Emission Color", (*emit[:3], 1)); s("Emission Strength", emit[3] if len(emit) > 3 else 1.0)
    if alpha < 1.0:
        try: m.surface_render_method = "BLENDED"
        except Exception: pass
        try: m.blend_method = "BLEND"
        except Exception: pass
    return m


def coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


class Kit:
    """Collects parts for one asset, builds them in a collection, applies modifiers, joins per material."""
    def __init__(self, name):
        GEN[0] = time.time()
        self.name = name
        self.c = coll(name)
        self.c.hide_viewport = False; self.c.hide_render = False
        lc = bpy.context.view_layer.layer_collection.children.get(name)
        if lc: lc.hide_viewport = False; lc.exclude = False
        for o in list(self.c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        self.objs = []

    def _add(self, o, m, bevel=0.0, smooth=True, seg=3, subsurf=0):
        for c in list(o.users_collection):
            c.objects.unlink(o)
        self.c.objects.link(o)
        if m is not None:
            o.data.materials.clear(); o.data.materials.append(m)
        if smooth:
            for p in o.data.polygons:
                p.use_smooth = True
        if bevel:
            md = o.modifiers.new("Bevel", "BEVEL"); md.width = bevel; md.segments = seg; md.limit_method = "ANGLE"; md.angle_limit = math.radians(35)
        if subsurf:
            md = o.modifiers.new("Sub", "SUBSURF"); md.levels = subsurf; md.render_levels = subsurf
        self.objs.append(o)
        return o

    def mesh(self, name, bm, m, **kw):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return self._add(o, m, **kw)

    def box(self, name, size, loc=(0, 0, 0), m=None, rot=(0, 0, 0), bevel=0.02, **kw):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        o = self.mesh(name, bm, m, bevel=bevel, **kw)
        o.location = loc; o.rotation_euler = rot
        return o

    def sphere(self, name, r, loc=(0, 0, 0), m=None, scale=(1, 1, 1), seg=24, rings=16, rot=(0, 0, 0), **kw):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
        for v in bm.verts:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
        o = self.mesh(name, bm, m, **kw)
        o.location = loc; o.rotation_euler = rot
        return o

    def cyl(self, name, r, h, loc=(0, 0, 0), m=None, rot=(0, 0, 0), seg=24, r2=None, bevel=0.0, **kw):
        """Cylinder/cone along local Z (r at bottom, r2 at top)."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=(r if r2 is None else r2), depth=h)
        o = self.mesh(name, bm, m, bevel=bevel, **kw)
        o.location = loc; o.rotation_euler = rot
        return o

    def lathe(self, name, prof, loc=(0, 0, 0), m=None, rot=(0, 0, 0), seg=32, **kw):
        """Surface of revolution about local Z. prof = [(radius, z), ...] bottom->top (radius 0 = closed on axis)."""
        bm = bmesh.new()
        rings = []
        for (r, z) in prof:
            if r < 1e-5:
                rings.append([bm.verts.new((0, 0, z))])
            else:
                rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)])
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            if len(a) == 1:
                for k in range(seg):
                    bm.faces.new((a[0], b[(k + 1) % seg], b[k]))
            elif len(b) == 1:
                for k in range(seg):
                    bm.faces.new((a[k], a[(k + 1) % seg], b[0]))
            else:
                for k in range(seg):
                    bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
        # close open ends with caps
        if len(rings[0]) > 1: bm.faces.new(rings[0][::-1])
        if len(rings[-1]) > 1: bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = self.mesh(name, bm, m, **kw)
        o.location = loc; o.rotation_euler = rot
        return o

    def tube(self, name, pts, radii, m, sides=10, cap=True, **kw):
        pts = [Vector(p) for p in pts]
        bm = bmesh.new(); rings = []; n = len(pts)
        for i, p in enumerate(pts):
            t = (pts[1] - pts[0]) if i == 0 else (pts[-1] - pts[-2]) if i == n - 1 else (pts[i + 1] - pts[i - 1])
            t.normalize()
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
            a = t.cross(ref).normalized(); b = t.cross(a).normalized()
            r = radii[i] if isinstance(radii, (list, tuple)) else radii
            rx, rz = (r, r) if not isinstance(r, (tuple, list)) else r
            rings.append([bm.verts.new(p + a * math.cos(2 * math.pi * k / sides) * rx + b * math.sin(2 * math.pi * k / sides) * rz) for k in range(sides)])
        for i in range(n - 1):
            for k in range(sides):
                bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
        if cap:
            bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self.mesh(name, bm, m, **kw)

    def torus(self, name, R, r, loc=(0, 0, 0), m=None, rot=(0, 0, 0), seg=32, sides=12, **kw):
        pts = [(R * math.cos(2 * math.pi * i / seg), R * math.sin(2 * math.pi * i / seg), 0) for i in range(seg)]
        bm = bmesh.new(); rings = []
        for i, p in enumerate(pts):
            c = Vector(p); rad = c.normalized()
            rings.append([bm.verts.new(c + rad * math.cos(2 * math.pi * k / sides) * r + Vector((0, 0, math.sin(2 * math.pi * k / sides) * r))) for k in range(sides)])
        for i in range(seg):
            a, b = rings[i], rings[(i + 1) % seg]
            for k in range(sides):
                bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = self.mesh(name, bm, m, **kw)
        o.location = loc; o.rotation_euler = rot
        return o

    def crystal(self, name, r, h, loc=(0, 0, 0), m=None, rot=(0, 0, 0), sides=6, tip=0.35, **kw):
        """Hexagonal crystal point: prism with a pyramid tip, base at z=0."""
        bm = bmesh.new()
        base = [bm.verts.new((r * math.cos(2 * math.pi * k / sides), r * math.sin(2 * math.pi * k / sides), 0)) for k in range(sides)]
        mid = [bm.verts.new((r * 0.92 * math.cos(2 * math.pi * k / sides), r * 0.92 * math.sin(2 * math.pi * k / sides), h * (1 - tip))) for k in range(sides)]
        top = bm.verts.new((0, 0, h))
        bm.faces.new(base[::-1])
        for k in range(sides):
            bm.faces.new((base[k], base[(k + 1) % sides], mid[(k + 1) % sides], mid[k]))
            bm.faces.new((mid[k], mid[(k + 1) % sides], top))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = self.mesh(name, bm, m, smooth=False, **kw)
        o.location = loc; o.rotation_euler = rot
        return o

    # -------------------------------------------------------------- finish
    def bake(self, vary=None):
        """Apply all modifiers, then join parts per material. vary(world_pos, normal, base_rgb) -> rgb enables vertex-colour baking."""
        dg = bpy.context.evaluated_depsgraph_get()
        for o in self.objs:
            if o.modifiers:
                ev = o.evaluated_get(dg)
                me = bpy.data.meshes.new_from_object(ev)
                old = o.data
                o.modifiers.clear(); o.data = me
                bpy.data.meshes.remove(old)
        if vary:
            for o in self.objs:
                vcolorize(o, vary)
        by = {}
        for o in self.objs:
            key = o.data.materials[0].name if o.data.materials else "none"
            by.setdefault(key, []).append(o)
        out = []
        for key, lst in by.items():
            bpy.ops.object.select_all(action="DESELECT")
            for o in lst: o.select_set(True)
            bpy.context.view_layer.objects.active = lst[0]
            if len(lst) > 1:
                bpy.ops.object.join()
            o = bpy.context.view_layer.objects.active
            o.name = f"{self.name}__{key}"
            out.append(o)
        self.objs = out
        return out

    def tris(self):
        n = 0
        for o in self.objs:
            o.data.calc_loop_triangles(); n += len(o.data.loop_triangles)
        return n

    def move(self, loc=(0, 0, 0), rot=None):
        for o in self.objs:
            o.location = Vector(o.location) + Vector(loc)

    def export(self, path, parent_name=None):
        bpy.ops.object.select_all(action="DESELECT")
        for o in self.objs:
            o.select_set(True); o.location = o.location  # noqa
        bpy.context.view_layer.objects.active = self.objs[0]
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_yup=True,
                                  export_apply=True, export_materials="EXPORT", export_cameras=False, export_lights=False,
                                  export_texcoords=True, export_normals=True, export_animations=False)


def vcolorize(o, vary):
    """Bake a per-corner colour attribute 'Col' = vary(pos, normal, base) and wire it into the material (opaque, non-emissive only)."""
    me = o.data
    m = o.data.materials[0] if o.data.materials else None
    if m is None: return
    b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if b is None: return
    em = b.inputs["Emission Strength"].default_value if "Emission Strength" in b.inputs else 0
    if b.inputs["Alpha"].default_value < 0.999 or em > 0.01:
        return
    base = tuple(b.inputs["Base Color"].default_value)[:3]
    if "Col" in me.color_attributes:
        me.color_attributes.remove(me.color_attributes["Col"])
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    mw = o.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    for lp in me.loops:
        v = me.vertices[lp.vertex_index]
        p = mw @ v.co
        n = (nm @ v.normal).normalized()
        c = vary(p, n, base)
        ca.data[lp.index].color = (max(0, c[0]), max(0, c[1]), max(0, c[2]), 1.0)
    nt = m.node_tree
    if not any(n.type == "VERTEX_COLOR" for n in nt.nodes):
        vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
        nt.links.new(vc.outputs["Color"], b.inputs["Base Color"])
    else:
        next(n for n in nt.nodes if n.type == "VERTEX_COLOR").layer_name = "Col"


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


# ---------------------------------------------------------------- render
def studio(res=(900, 900), samples=36, world=(0.62, 0.74, 0.95), strength=0.6):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples; sc.cycles.use_denoising = True
    try: sc.cycles.device = "GPU"
    except Exception: pass
    sc.view_settings.view_transform = "AgX"
    try: sc.view_settings.look = "AgX - Punchy"
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res
    w = bpy.data.worlds.get("BBWorld") or bpy.data.worlds.new("BBWorld")
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (*world, 1); bg.inputs[1].default_value = strength
    sc.world = w
    for n in ("BB_Key", "BB_Fill", "BB_Rim", "BB_Cam"):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    def light(n, loc, energy, color, size, tgt):
        d = bpy.data.lights.new(n, "AREA"); d.energy = energy; d.color = color; d.size = size
        o = bpy.data.objects.new(n, d); bpy.context.scene.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    light("BB_Key", (-2.2, -2.6, 3.0), 90, (1.0, 0.95, 0.88), 3.0, (0, 0, 0.3))
    light("BB_Fill", (3.0, -2.0, 1.4), 35, (0.75, 0.85, 1.0), 3.0, (0, 0, 0.3))
    light("BB_Rim", (1.0, 3.0, 2.4), 60, (1.0, 0.9, 0.95), 2.0, (0, 0, 0.3))


def shoot(name, loc, target, lens=70, res=None, folder=None, hide=None):
    sc = bpy.context.scene
    if res:
        sc.render.resolution_x, sc.render.resolution_y = res
    cam = bpy.data.objects.get("BB_Cam")
    if not cam:
        cd = bpy.data.cameras.new("BB_Cam"); cam = bpy.data.objects.new("BB_Cam", cd)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.lens = lens
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    d = folder or RENDERS
    os.makedirs(d, exist_ok=True)
    sc.render.filepath = os.path.join(d, name + ".png")
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def floor(size=6, z=0.0, color=(0.9, 0.82, 0.95), name="BB_Floor"):
    if name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    o = bpy.context.active_object; o.name = name
    o.data.materials.append(mat("BB_FloorMat", color, rough=0.9))
    return o


def show_only(prefix):
    """Hide every kit collection except the one called prefix."""
    for c in bpy.data.collections:
        c.hide_render = (c.name != prefix) and c.name not in ("BB_Stage",)
        c.hide_viewport = c.hide_render
