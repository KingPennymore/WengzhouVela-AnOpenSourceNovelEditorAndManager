"""Builds promo-serif.woff2 / promo-serif-bold.woff2: Noto Serif SC (SIL OFL 1.1) cut down to the characters this
promo uses. The source is the npm package noto-serif-sc (Google Fonts unicode-range slices), cached in dist/promo.
Usage: python3 promo/0.9.9/fonts/subset.py   (needs: pip install fonttools brotli; npm on PATH)"""
import os, re, pathlib, subprocess, tarfile
from fontTools.ttLib import TTFont
from fontTools.merge import Merger
from fontTools import subset

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE.parents[2] / 'dist' / 'promo' / 'noto-serif-sc'
if not (CACHE / 'package').exists():
    CACHE.mkdir(parents=True, exist_ok=True)
    name = subprocess.run(['npm', 'pack', 'noto-serif-sc@31.0.0', '--silent'], cwd=CACHE, check=True, capture_output=True, text=True, shell=os.name == 'nt').stdout.strip().splitlines()[-1]
    with tarfile.open(CACHE / name) as tar:
        tar.extractall(CACHE, filter='data')
pkg = CACHE / 'package'
text = ''.join((HERE.parent / f).read_text('utf-8') for f in ('scene.html', 'scenes.js', 'lines.js', 'samples/samples.js'))
chars = sorted({c for c in text if ord(c) > 0x2000} | set('0123456789.·，。！？…：；、“”（）'))


def ranges(spec):
    for part in spec.split(','):
        a, _, b = part.strip()[2:].partition('-')
        yield int(a, 16), int(b or a, 16)


for weight, out in (('regular', 'promo-serif.woff2'), ('bold', 'promo-serif-bold.woff2')):
    files = set()
    folder = pkg / f'noto_serif_sc_{weight}'
    for block in re.findall(r'@font-face\s*{[^}]*}', (folder / 'css.css').read_text('utf-8')):
        src = re.search(r'url\(([^)]+)\)', block).group(1).strip('\'"')
        spans = list(ranges(re.search(r'unicode-range:\s*([^;]+);', block).group(1)))
        if any(a <= ord(c) <= b for c in chars for a, b in spans):
            files.add(folder / pathlib.PurePosixPath(src).name)
    tmp = []
    for i, f in enumerate(sorted(files)):
        font = TTFont(f)
        font.flavor = None
        path = CACHE / f'{weight}-{i}.ttf'
        font.save(path)
        tmp.append(str(path))
    merged = Merger().merge(tmp) if len(tmp) > 1 else TTFont(tmp[0])
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(chars))
    sub.subset(merged)
    merged.flavor = 'woff2'
    merged.save(HERE / out)
    print(out, len(files), 'slices', len(chars), 'chars', (HERE / out).stat().st_size // 1024, 'KB')
