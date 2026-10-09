from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from datetime import datetime, timezone
import hashlib, json, sys, shutil

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['harmonyVersion']
release = dist / 'releases' / version
metadata = dist / 'metadata' / version
release.mkdir(parents=True, exist_ok=True)
metadata.mkdir(parents=True, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
assets = []

def asset_path(name):
    # Prefer fresh build outputs over a previously collected release.
    candidates = [dist / name, dist / 'windows' / name, dist / 'windows-lite' / name,
                  dist / 'tex-components' / name, dist / 'intermediates' / version / name, release / name]
    return next(p for p in candidates if p.is_file())

def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()

for flavor in (['-lite'] if '--lite-only' in sys.argv else ['', '-lite']):
    app = asset_path(f'Vela-{version}{flavor}-release-signed.app')
    appzip = dist / (app.name + '.zip')
    with ZipFile(appzip, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
        archive.write(app, app.name)
    assets += [f'Vela-{version}-android.1{flavor}-release-signed.apk',
               f'Vela-{version}-android.1{flavor}-release-signed.aab',
               appzip.name, f'Vela-{version}{flavor}-release-signed.hap',
               f'Vela-{version}-windows{flavor}-setup-x64.exe',
               f'Vela-{version}-windows{flavor}-x64.zip']
assets += [f'Vela-{version}-source.zip', 'Vela-TeX-0.1.1-engine.zip', 'Vela-TeX-0.1.1-chinese.zip']
lines = []
for name in assets:
    source, target = asset_path(name), release / name
    checksum = digest(source)
    if source != target:
        if target.exists() and digest(target) != checksum:
            previous = dist / 'archive' / version / 'revisions' / stamp / name
            previous.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(previous))
        if source.parent.name == 'tex-components':
            shutil.copy2(source, target)  # Keep canonical component inputs for regression tests.
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
    lines.append(f'{checksum}  {name}')
(release / f'SHA256SUMS-{version}.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
assets.append(f'SHA256SUMS-{version}.txt')
(metadata / f'release-assets-{version}.json').write_text(json.dumps(assets, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
notes = (root / 'RELEASE_NOTES.md').read_text(encoding='utf-8').split('\n# ', 1)[0]
(metadata / f'release-notes-{version}.md').write_text(notes.rstrip() + '\n', encoding='utf-8')
print(json.dumps([{'file': name, 'bytes': (release / name).stat().st_size,
                   'sha256': digest(release / name)} for name in assets], ensure_ascii=False, indent=2))
