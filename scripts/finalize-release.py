from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, sys

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['harmonyVersion']
assets = []
for flavor in (['-lite'] if '--lite-only' in sys.argv else ['', '-lite']):
    app = dist / f'Vela-{version}{flavor}-release-signed.app'
    appzip = app.with_suffix('.app.zip')
    with ZipFile(appzip, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
        archive.write(app, app.name)
    assets += [f'Vela-{version}-android.1{flavor}-release-signed.apk',
               f'Vela-{version}-android.1{flavor}-release-signed.aab',
               appzip.name, f'Vela-{version}{flavor}-release-signed.hap',
               f'Vela-{version}-windows{flavor}-setup-x64.exe',
               f'Vela-{version}-windows{flavor}-x64.zip']
assets += [f'Vela-{version}-source.zip', 'Vela-TeX-0.1.1-engine.zip', 'Vela-TeX-0.1.1-chinese.zip']
def asset_path(name):
    return next(p for p in [dist / name, dist / 'windows' / name, dist / 'windows-lite' / name, dist / 'tex-components' / name] if p.is_file())
lines = []
for name in assets:
    path = asset_path(name)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    lines.append(f'{digest}  {name}')
(dist / f'SHA256SUMS-{version}.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
assets.append(f'SHA256SUMS-{version}.txt')
(dist / f'release-assets-{version}.json').write_text(json.dumps(assets, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps([{'file': name, 'bytes': asset_path(name).stat().st_size,
                   'sha256': hashlib.sha256(asset_path(name).read_bytes()).hexdigest()} for name in assets], ensure_ascii=False, indent=2))
