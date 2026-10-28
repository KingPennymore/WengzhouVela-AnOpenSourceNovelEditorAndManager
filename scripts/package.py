"""Package the reviewable source tree and the already compiled unsigned HAP."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import shutil
import argparse
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--signed-hap', type=Path)
parser.add_argument('--signed-app', type=Path)
parser.add_argument('--source-only', action='store_true', help='Package source without copying native artifacts')
args = parser.parse_args()

root = Path(__file__).resolve().parent.parent
out = root / "dist"
out.mkdir(exist_ok=True)
# Refuse to publish a source archive without its ready-to-build editor resources.
resources = root / "entry/src/main/resources/rawfile/web"
state = json.loads((resources / "build-manifest.json").read_text(encoding="utf-8"))
# Keep the manifest and archive gate on the same authoritative input list.
source_hash = subprocess.run(["node", "--input-type=module", "-e",
    "import {sourceDigest} from './scripts/frontend-state.mjs'; process.stdout.write(sourceDigest(process.cwd()));"],
    cwd=root, capture_output=True, text=True, check=True).stdout.strip()
if state.get("source") != source_hash:
    raise SystemExit("编辑器资源与源码不一致，请先重新构建 HAP。")
for name in ["index.html", "app.js", "style.css", "editor.css", "licenses.js", "version.json"]:
    if name not in state["outputs"]:
        raise SystemExit(f"源码包缺少编辑器资源：{name}")
for name, expected in state["outputs"].items():
    file = resources / name
    if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
        raise SystemExit(f"编辑器资源不完整，请重新构建：{name}")
package_info = json.loads((root / "package.json").read_text(encoding="utf-8"))
version = package_info.get("harmonyVersion", package_info["version"])
source = out / f"Vela-{version}-source.zip"
folders = [".github", "web", "scripts", "tests", "vendor", "hvigor", "AppScope", "entry/src", "previews", "android", "windows", "docs", "examples", "components", "测试文件"]
files = ["package.json", "package-lock.json", "oh-package.json5", "build-profile.json5", "hvigorfile.ts", ".gitignore", ".gitattributes", ".prettierrc.json", "eslint.config.mjs", "jsconfig.core.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "VALIDATION.md", "RELEASE_NOTES.md", "entry/oh-package.json5", "entry/build-profile.json5", "entry/hvigorfile.ts"]
# build-profile.json5 holds the local HarmonyOS signing configuration once DevEco has signed a build; the source
# package always carries the committed version instead.
clean_profile = subprocess.run(["git", "show", "HEAD:build-profile.json5"], cwd=root, capture_output=True, check=True).stdout
with ZipFile(source, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for name in files:
        file = root / name
        if name == "build-profile.json5":
            archive.writestr(f"Vela/{name}", clean_profile)
            continue
        archive.write(file, f"Vela/{name}")
    for name in folders:
        for file in sorted((root / name).rglob("*")):
            if not file.is_file():
                continue
            relative = file.relative_to(root).as_posix()
            if any(part in file.relative_to(root).parts for part in ["node_modules", "__pycache__", ".gradle", "build"]):
                continue
            if relative == "android/local.properties" or relative.startswith("android/app/src/main/assets/web/"):
                continue
            if file.suffix.lower() in [".jks", ".keystore", ".p12", ".cer", ".p7b"]:
                continue
            archive.write(file, "Vela/" + relative)
if args.source_only:
    manifest = [{"file": source.name, "bytes": source.stat().st_size, "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}]
    (out / "release.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    raise SystemExit(0)
hap = args.signed_hap or root / "entry/build/default/outputs/default/entry-default-unsigned.hap"
if not hap.is_file():
    raise SystemExit("请先构建 HAP。")
target = out / f"Vela-{version}-{'release-signed' if args.signed_hap else 'unsigned'}.hap"
shutil.copyfile(hap, target)
outputs = [source, target]
if args.signed_app:
    app = out / f"Vela-{version}-release-signed.app"
    shutil.copyfile(args.signed_app, app)
    outputs.append(app)
manifest = []
for file in outputs:
    manifest.append({"file": file.name, "bytes": file.stat().st_size, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
(out / "release.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(manifest, ensure_ascii=False, indent=2))
