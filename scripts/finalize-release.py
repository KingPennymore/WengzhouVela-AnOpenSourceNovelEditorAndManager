from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['harmonyVersion']
app = dist / f'Vela-{version}-release-signed.app'
appzip = dist / f'Vela-{version}-release-signed.app.zip'
with ZipFile(appzip, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    archive.write(app, app.name)
assets = [
    f'Vela-{version}-android.1-release-signed.apk',
    f'Vela-{version}-android.1-release-signed.aab',
    f'Vela-{version}-release-signed.app.zip',
    f'Vela-{version}-release-signed.hap',
    f'Vela-{version}-source.zip',
    f'Vela-{version}-windows-setup-x64.exe',
    f'Vela-{version}-windows-x64.zip',
]
lines = []
for name in assets:
    path = (dist / name) if (dist / name).exists() else (dist / 'windows' / name)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    lines.append(f'{digest}  {name}')
(dist / f'SHA256SUMS-{version}.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
assets.append(f'SHA256SUMS-{version}.txt')
(dist / f'release-assets-{version}.json').write_text(json.dumps(assets, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def asset_path(name):
    return (dist / name) if (dist / name).exists() else (dist / 'windows' / name)
print(json.dumps([{'file': name, 'bytes': asset_path(name).stat().st_size,
                   'sha256': hashlib.sha256(asset_path(name).read_bytes()).hexdigest()} for name in assets], ensure_ascii=False, indent=2))
