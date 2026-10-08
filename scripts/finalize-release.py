from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
app = dist / 'Vela-0.9.0-release-signed.app'
appzip = dist / 'Vela-0.9.0-release-signed.app.zip'
with ZipFile(appzip, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    archive.write(app, app.name)
assets = [
    'Vela-0.9.0-android.1-release-signed.apk',
    'Vela-0.9.0-android.1-release-signed.aab',
    'Vela-0.9.0-release-signed.app.zip',
    'Vela-0.9.0-release-signed.hap',
    'Vela-0.9.0-source.zip',
    'Vela-0.9.0-windows-setup-x64.exe',
    'Vela-0.9.0-windows-x64.zip',
]
lines = []
for name in assets:
    path = (dist / name) if (dist / name).exists() else (dist / 'windows' / name)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    lines.append(f'{digest}  {name}')
(dist / 'SHA256SUMS-0.9.0.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
assets.append('SHA256SUMS-0.9.0.txt')
(dist / 'release-assets-0.9.0.json').write_text(json.dumps(assets, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def asset_path(name):
    return (dist / name) if (dist / name).exists() else (dist / 'windows' / name)
print(json.dumps([{'file': name, 'bytes': asset_path(name).stat().st_size,
                   'sha256': hashlib.sha256(asset_path(name).read_bytes()).hexdigest()} for name in assets], ensure_ascii=False, indent=2))
