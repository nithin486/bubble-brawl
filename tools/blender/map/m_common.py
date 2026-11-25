"""Bubblegum Islands: shared palette + vertex-colour variation + export helpers (run in Blender via BlenderMCP)."""
import sys
sys.path.insert(0, r"C:\Users\User\Desktop\bubble-brawl\tools\blender")
import importlib, bb_common as B
importlib.reload(B)
from bb_common import *
from mathutils import noise as mnoise
import random

S = 4.0  # tile edge (m)
MAPDIR = ROOT + r"\assets\phase2\renders\map"
os.makedirs(MAPDIR, exist_ok=True)

C = dict(
    pink=(1.0, 0.3, 0.62), pinkd=(0.85, 0.15, 0.48), pinkl=(1.0, 0.62, 0.8), pinkp=(1.0, 0.8, 0.9),
    mint=(0.22, 0.88, 0.62), mintd=(0.1, 0.65, 0.5), grass=(0.42, 0.85, 0.32),
    cream=(1.0, 0.9, 0.74), cream2=(0.98, 0.8, 0.6), sand=(0.95, 0.76, 0.55),
    lilac=(0.62, 0.42, 1.0), lilacd=(0.48, 0.3, 0.85), purple=(0.42, 0.24, 0.72), purpled=(0.28, 0.16, 0.52),
    aqua=(0.12, 0.78, 1.0), aquad=(0.08, 0.5, 0.9), aqual=(0.6, 0.93, 1.0),
    gold=(1.0, 0.74, 0.2), yellow=(1.0, 0.86, 0.2), orange=(1.0, 0.5, 0.15), red=(0.95, 0.2, 0.28),
    navy=(0.16, 0.14, 0.4), white=(1, 1, 1), brown=(0.45, 0.27, 0.16), wood=(0.78, 0.5, 0.3),
)


def vmat(name, color, rough=0.55, metal=0.0, **kw):
    return mat(name, color, rough, metal, **kw)


def make_vary(z0=0.0, zh=1.0, ao=0.3, noise=0.09, grad=None, stripe=None):
    """Colour variation: low-frequency noise, top-lit/side-dark, ground-contact AO and an optional vertical gradient."""
    def vary(p, n, base):
        f = 1.0 + noise * mnoise.noise(Vector((p.x * 0.55, p.y * 0.55, p.z * 0.55))) + noise * 0.5 * mnoise.noise(Vector((p.x * 2.3, p.y * 2.3, p.z * 2.3)))
        t = max(0.0, min(1.0, (p.z - z0) / max(zh, 1e-4)))
        f *= (1.0 - ao) + ao * t ** 0.7
        if n.z > 0.75: f *= 1.05
        elif n.z < -0.3: f *= 0.8
        r, g, b = base
        if grad:
            gr = grad(p, t)
            r, g, b = (r * gr[0], g * gr[1], b * gr[2])
        if stripe:
            s = stripe(p, n)
            r, g, b = (r * s[0], g * s[1], b * s[2])
        return (r * f, g * f, b * f)
    return vary


def meta(name, title, dims=None):
    import json
    d = dict(name=name, title=title, source="own", author="Bubble Brawl (Blender, Claude Code)", licence="Original work (CC0)", needsCredit=False,
             normalized=dict(pivot="centre x/y, base z=0", forward="-Y (glTF +Z)"))
    with open(MODELS + "\\" + name + ".json", "w") as f:
        json.dump(d, f, indent=1)


def export(kit, name, title, vary=None, merge_mat=True):
    kit.bake(vary=vary)
    kit.export(MODELS + "\\" + name + ".glb")
    meta(name, title)
    lo, hi = bounds(kit.objs)
    print(f"{name}: {kit.tris()} tris, size {hi.x-lo.x:.2f} x {hi.y-lo.y:.2f} x {hi.z-lo.z:.2f}")
    return kit


def stage_view(name, c, d, lens=55, views=("q3",), res=(900, 700)):
    """Render named kit(s) alone."""
    B.show_only(name)
    out = []
    angs = dict(front=(0, -d, d * 0.25), side=(d, 0, d * 0.25), q3=(d * 0.75, -d * 0.75, d * 0.5), back=(0, d, d * 0.3), top=(0.01, -d * 0.2, d * 1.1), qb=(-d * 0.75, d * 0.75, d * 0.45))
    for v in views:
        a = angs[v]
        out.append(B.shoot(f"{name}_{v}", (c[0] + a[0], c[1] + a[1], c[2] + a[2]), c, lens=lens, folder=MAPDIR, res=res))
    return out
