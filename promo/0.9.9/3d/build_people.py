"""Builds the promo's people as rigged, low-poly glTF models in Blender (run with Python + the bpy module).

Source: the MakeHuman hm08 base mesh, its shape targets and its default skeleton and weights, all released as CC0
(makehumancommunity/makehuman). The mesh is shaped into an adult man, decimated into large facets in the manner of
Another World, and painted with flat colour blocks per face (skin, hair, shirt, vest, belt, trousers, boots). Faces
carry no features: the eyes are filled with skin. The 163-bone skeleton is reduced to the bones the film animates
(twist and face bones merge into their parents) and every bone's roll is set so that rotating about its local X axis
bends it forwards or back.
Usage: python3 promo/0.9.9/3d/build_people.py   → promo/0.9.9/3d/models/{riga,soldier,havard}.glb"""
import json, math, pathlib, re, sys, urllib.request
import bpy, bmesh
from mathutils import Vector

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE.parents[2] / 'dist' / 'promo' / 'makehuman'
SRC = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/'
FILES = {'base.obj': '3dobjs/base.obj', 'default.mhskel': 'rigs/default.mhskel', 'default_weights.mhw': 'rigs/default_weights.mhw',
         'caucasian-male-young.target': 'targets/macrodetails/caucasian-male-young.target',
         'caucasian-male-old.target': 'targets/macrodetails/caucasian-male-old.target',
         'universal-male-young-maxmuscle-averageweight.target': 'targets/macrodetails/universal-male-young-maxmuscle-averageweight.target',
         'universal-male-young-maxmuscle-minweight.target': 'targets/macrodetails/universal-male-young-maxmuscle-minweight.target',
         'male-young-averagemuscle-averageweight-maxheight.target': 'targets/macrodetails/height/male-young-averagemuscle-averageweight-maxheight.target'}


def fetch(name):
    path = CACHE / name
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(SRC + FILES[name], path)
    return path


# ---------------------------------------------------------------- source data
def load_obj():
    verts, groups, group = [], {}, None
    for line in fetch('base.obj').read_text().splitlines():
        if line.startswith('v '):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            group = line.split()[1]
        elif line.startswith('f '):
            groups.setdefault(group, []).append([int(p.split('/')[0]) - 1 for p in line.split()[1:]])
    return verts, groups


def morph(verts, targets):
    out = [list(v) for v in verts]
    for name, w in targets.items():
        for line in fetch(name).read_text().splitlines():
            if line and not line.startswith('#'):
                i, dx, dy, dz = line.split()
                i = int(i)
                out[i][0] += w * float(dx); out[i][1] += w * float(dy); out[i][2] += w * float(dz)
    return out


# MakeHuman is Y-up in decimetres facing +Z; Blender is Z-up in metres facing -Y.
def to_blender(v):
    return Vector((v[0] / 10, -v[2] / 10, v[1] / 10))


# ---------------------------------------------------------------- skeleton reduction
ALIAS = {'upperarm02': 'upperarm', 'upperarm01': 'upperarm', 'lowerarm01': 'lowerarm', 'lowerarm02': 'lowerarm',
         'upperleg01': 'thigh', 'upperleg02': 'thigh', 'lowerleg01': 'shin', 'lowerleg02': 'shin', 'neck01': 'neck', 'neck02': 'neck',
         'neck03': 'neck', 'shoulder01': 'clavicle', 'wrist': 'hand', 'pelvis': 'root', 'foot': 'foot'}
CHAIN = {'upperarm': ('upperarm01', 'upperarm02'), 'lowerarm': ('lowerarm01', 'lowerarm02'), 'thigh': ('upperleg01', 'upperleg02'),
         'shin': ('lowerleg01', 'lowerleg02'), 'neck': ('neck01', 'neck03'), 'hand': ('wrist', 'metacarpal3'), 'clavicle': ('clavicle', 'shoulder01'),
         'toes': ('toe3-1', 'toe3-3')}
KEEP_PARENT = {'root': None, 'spine05': 'root', 'spine04': 'spine05', 'spine03': 'spine04', 'spine02': 'spine03', 'spine01': 'spine02',
               'neck': 'spine01', 'head': 'neck', 'clavicle': 'spine01', 'upperarm': 'clavicle', 'lowerarm': 'upperarm', 'hand': 'lowerarm',
               'thigh': 'root', 'shin': 'thigh', 'foot': 'shin', 'toes': 'foot'}
FINGERS = [f'finger{f}-{s}' for f in range(1, 6) for s in range(1, 4)]


def split(name):
    m = re.match(r'(.*?)(\.[LR])?$', name)
    return m.group(1), m.group(2) or ''


def kept(name, bones):
    """The reduced bone a MakeHuman bone's weights move to."""
    base, side = split(name)
    if base in FINGERS:
        return name
    if base in ALIAS:
        return ALIAS[base] + side
    if base.startswith('metacarpal'):
        return 'hand' + side
    if base.startswith('toe'):
        return 'toes' + side
    if base in KEEP_PARENT:
        return name
    parent = bones[name]['parent']
    return kept(parent, bones) if parent else 'root'


# ---------------------------------------------------------------- build one character
CHARACTERS = {
    'riga': {'targets': {'caucasian-male-young.target': 1.0, 'universal-male-young-maxmuscle-minweight.target': .35},
             'colors': {'skin': '#c99b7c', 'hair': '#6b4a2f', 'shirt': '#55634e', 'vest': '#6b4a32', 'belt': '#2a211c', 'pants': '#3a3f47', 'boot': '#2a211c'}},
    'soldier': {'targets': {'caucasian-male-young.target': 1.0, 'universal-male-young-maxmuscle-averageweight.target': .3},
                'colors': {'skin': '#b88f73', 'hair': '#2f3433', 'shirt': '#3e4a3c', 'vest': '#3b2c22', 'belt': '#1d1915', 'pants': '#2b3039', 'boot': '#1c1a19'}, 'hat': True},
    'havard': {'targets': {'caucasian-male-young.target': .55, 'caucasian-male-old.target': .45, 'universal-male-young-maxmuscle-averageweight.target': .65,
                           'male-young-averagemuscle-averageweight-maxheight.target': .15},
               'colors': {'skin': '#b98a6a', 'hair': '#4b3a2c', 'beard': '#4f3b2c', 'shirt': '#4a4440', 'vest': '#5a4636', 'belt': '#1d1915', 'pants': '#33302d', 'boot': '#211b17'}, 'beard': True},
}


def hex_rgba(h):
    # Colours go to the glTF as linear values; the renderer converts back to sRGB.
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
    return (lin(int(h[1:3], 16)), lin(int(h[3:5], 16)), lin(int(h[5:7], 16)), 1.0)


def build(name, spec, verts0, groups, skel, weights):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    V = [to_blender(v) for v in morph(verts0, spec['targets'])]
    bones = skel['bones']
    joint = lambda j: sum((V[i] for i in skel['joints'][j]), Vector()) / len(skel['joints'][j])

    # mesh: the body and its eyes (filled with skin, so faces carry no features)
    parts = [('body', 'body'), ('helper-l-eye', 'eye'), ('helper-r-eye', 'eye')]
    used, faces, region = {}, [], []
    for g, tag in parts:
        for f in groups[g]:
            faces.append([used.setdefault(i, len(used)) for i in f]); region.append(tag)
    order = sorted(used, key=used.get)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([V[i] for i in order], [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)

    # weights, merged into the reduced skeleton
    groups_by = {}
    for bone, pairs in weights.items():
        k = kept(bone, bones)
        for vi, w in pairs:
            if vi in used:
                groups_by.setdefault(k, {}).setdefault(used[vi], 0.0)
                groups_by[k][used[vi]] += w
    for k, d in groups_by.items():
        vg = obj.vertex_groups.new(name=k)
        for vi, w in d.items():
            vg.add([vi], min(1.0, w), 'REPLACE')
    vdom = {}
    for k, d in groups_by.items():
        for vi, w in d.items():
            if w > vdom.get(vi, ('', 0))[1]:
                vdom[vi] = (k, w)

    # Another World faces: smooth the features away inside the face (the profile stays), merge the toes into a
    # boot, and cut the mesh along the horizontal lines where belt, vest and boots begin so colour borders are straight
    J0 = lambda b, end='head': joint(bones[b][end])
    eye0 = J0('eye.L')
    for poly, tag in zip(mesh.polygons, region):
        poly.material_index = 1 if tag == 'eye' else 0
    bm = bmesh.new(); bm.from_mesh(mesh)
    dl = bm.verts.layers.deform.verify()
    gidx = {vg.name: vg.index for vg in obj.vertex_groups}
    def owner(v):
        d = v[dl]
        return max(d.items(), key=lambda kv: kv[1])[0] if d else -1
    head_ids = {gidx.get('head'), gidx.get('neck')}
    face = [v for v in bm.verts if owner(v) in head_ids and v.co.y < eye0.y + .03 and eye0.z - .11 < v.co.z < eye0.z + .05]
    for _ in range(14):
        bmesh.ops.smooth_vert(bm, verts=face, factor=.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    feet = [v for v in bm.verts if owner(v) in {gidx.get('foot.L'), gidx.get('foot.R'), gidx.get('toes.L'), gidx.get('toes.R')}]
    for _ in range(10):
        bmesh.ops.smooth_vert(bm, verts=feet, factor=.7, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for z in (J0('spine04').z - .052, J0('spine04').z - .008, J0('spine01').z - .01, lerp(J0('foot.L').z, J0('lowerleg01.L').z, .55)):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(mesh); bm.free()
    region = ['eye' if poly.material_index == 1 else 'body' for poly in mesh.polygons]
    vdom = {}
    for v in mesh.vertices:
        if v.groups:
            g = max(v.groups, key=lambda g: g.weight)
            vdom[v.index] = (obj.vertex_groups[g.group].name, g.weight)

    # colour regions, decided on the full-resolution mesh so their borders follow the anatomy cleanly
    J = lambda b, end='head': joint(bones[b][end])
    eye, chin = J('eye.L'), J('head')
    waist_z, chest_z = J('spine04').z, J('spine01').z
    knee_z, ankle_z = J('lowerleg01.L').z, J('foot.L').z
    col = spec['colors']
    def face_tag(poly, tag):
        if tag == 'eye':
            return 'skin'
        names = [split(vdom.get(v, ('root', 0))[0])[0] for v in poly.vertices]
        best = max(set(names), key=names.count)
        c = poly.center
        if best in ('head', 'neck'):
            scalp = c.z > eye.z + .02 or (c.y > eye.y + .085 and c.z > eye.z - .07)
            if scalp and best == 'head':
                return 'scalp'
            if spec.get('beard') and best == 'head' and c.z < eye.z - .06 and c.y < eye.y + .07:
                return 'jaw'
            return 'skin'
        if best == 'hand' or best.startswith('finger'):
            return 'skin'
        if best in ('foot', 'toes') or (best == 'shin' and c.z < lerp(ankle_z, knee_z, .55)):
            return 'boot'
        if best in ('thigh', 'shin'):
            return 'pants'
        if abs(c.z - (waist_z - .03)) < .022:
            return 'belt'
        if c.z < waist_z - .03:
            return 'pants'
        if best in ('upperarm', 'lowerarm', 'clavicle'):
            return 'shirt'
        return 'vest' if c.z < chest_z - .01 else 'shirt'
    tags = [face_tag(p, t) for p, t in zip(mesh.polygons, region)]

    # hair (and Havard's beard, the soldier's cap) are shells lifted off the scalp and jaw, following the head
    bm = bmesh.new(); bm.from_mesh(mesh); bm.faces.ensure_lookup_table()
    shells = []
    for tag, lift, as_tag in (('scalp', .022 if spec.get('hat') else .007, 'hair'), ('jaw', .006, 'beard'), ('boot', .007, 'boot')):
        bm.faces.ensure_lookup_table()
        sel = [bm.faces[i] for i, t in enumerate(tags) if t == tag]
        if not sel:
            continue
        dup = bmesh.ops.duplicate(bm, geom=sel)
        nv = [g for g in dup['geom'] if isinstance(g, bmesh.types.BMVert)]
        for v in nv:
            v.co += v.normal * lift
        shells += [(f, as_tag) for f in dup['geom'] if isinstance(f, bmesh.types.BMFace)]
    bm.to_mesh(mesh); bm.free()
    tags = [('skin' if t in ('scalp', 'jaw') else t) for t in tags] + [t for _, t in shells]

    # one flat material per colour region; planar decimation inside each region gives Another World's big facets
    names = sorted(set(tags))
    for n in names:
        m = bpy.data.materials.new(n); m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = hex_rgba(col.get(n, col['skin'] if n == 'beard' else '#ff00ff'))
        bsdf.inputs['Roughness'].default_value = 1.0
        mesh.materials.append(m)
    for p, t in zip(mesh.polygons, tags):
        p.material_index = names.index(t)
        p.use_smooth = False
    bpy.context.view_layer.objects.active = obj
    dec = obj.modifiers.new('facets', 'DECIMATE'); dec.decimate_type = 'DISSOLVE'; dec.angle_limit = math.radians(spec.get('facet', 13)); dec.delimit = {'MATERIAL'}
    bpy.ops.object.modifier_apply(modifier='facets')
    tri = obj.modifiers.new('tri', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier='tri')

    # armature
    arm_data = bpy.data.armatures.new(name + '-rig')
    arm = bpy.data.objects.new(name + '-rig', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    def ends(base, side):
        if base in CHAIN:
            a, b = CHAIN[base]
            return joint(bones[a + side]['head']), joint(bones[b + side]['tail'])
        src = base + side
        return joint(bones[src]['head']), joint(bones[src]['tail'])
    made = {}
    for side in ('', '.L', '.R'):
        for base, parent in KEEP_PARENT.items():
            if (side == '') != (base in ('root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck', 'head')):
                continue
            h, t = ends(base, side)
            b = eb.new(base + side); b.head, b.tail = h, t
            made[base + side] = b
        if side:
            for f in FINGERS:
                b = eb.new(f + side); b.head, b.tail = joint(bones[f + side]['head']), joint(bones[f + side]['tail'])
                made[f + side] = b
    for n, b in made.items():
        base, side = split(n)
        parent = KEEP_PARENT.get(base) if base in KEEP_PARENT else None
        if base in FINGERS:
            s = int(base[-1]); parent = f'{base[:-1]}{s - 1}' if s > 1 else 'hand'
        if parent:
            b.parent = made.get(parent + (side if parent not in ('root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck', 'head') else ''))
        # roll: local X across the body so that rotating about X bends forwards or back; feet face up
        b.align_roll(Vector((0, 0, 1)) if base in ('foot', 'toes') else Vector((0, -1, 0)))
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.parent = arm
    mod = obj.modifiers.new('rig', 'ARMATURE'); mod.object = arm

    out = HERE / 'models' / f'{name}.glb'
    out.parent.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=False, export_animations=False, export_apply=False)
    print(name, len(obj.data.polygons), 'faces', len(made), 'bones', out.stat().st_size // 1024, 'KB')


def lerp(a, b, k):
    return a + (b - a) * k


verts0, groups = load_obj()
skel = json.loads(fetch('default.mhskel').read_text())
weights = json.loads(fetch('default_weights.mhw').read_text())['weights']
for name in (sys.argv[1:] or CHARACTERS):
    build(name, CHARACTERS[name], verts0, groups, skel, weights)
