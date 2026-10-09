"""Archive previous outputs without deleting files or touching active build directories."""
from pathlib import Path
from datetime import datetime, timezone
import json, re, shutil

root = Path(__file__).resolve().parent.parent
dist = (root / 'dist').resolve()
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['harmonyVersion']
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
records = []

def move(source, target):
    source, target = source.resolve(), target.resolve()
    if source == dist or not source.is_relative_to(dist) or not target.is_relative_to(dist):
        raise RuntimeError('Refusing to move outside dist')
    if target.exists():
        target = target.parent / ('previous-' + stamp) / target.name
    target.parent.mkdir(parents=True, exist_ok=True)
    record = {'from': source.relative_to(dist).as_posix(), 'to': target.relative_to(dist).as_posix(), 'kind': 'directory' if source.is_dir() else 'file'}
    if source.is_file():
        record['bytes'] = source.stat().st_size
    shutil.move(str(source), str(target))
    records.append(record)

for item in sorted(dist.iterdir()):
    if not item.is_file() or item.name in ['README.md', 'organization-index.json']:
        continue
    match = re.search(r'(?<!\d)(\d+\.\d+\.\d+(?:\.\d+)?)(?!\d)', item.name)
    found = match.group(1) if match else None
    if found and found != version:
        target = dist / 'archive' / found / item.name
    elif item.suffix in ['.json', '.md', '.txt']:
        target = dist / 'metadata' / version / item.name
    else:
        target = dist / ('intermediates' if found == version else 'archive') / (version if found == version else 'misc') / item.name
    move(item, target)

for name in ['windows', '开源发布版', 'android-completion-fix', 'plugin-api-v3-4efcadb', 'reading-fix', 'store-screenshots-0.4.2']:
    item = dist / name
    if item.exists():
        move(item, dist / 'archive' / 'builds' / name)

index = dist / 'organization-index.json'
history = json.loads(index.read_text(encoding='utf-8')) if index.exists() else []
history.append({'time': stamp, 'moves': records})
index.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(dist / 'README.md').write_text(f'''# dist 文件索引

- `releases/{version}/`：本次 GitHub 发布的精简版安装包、源码、两个排版组件和 SHA-256 清单。
- `archive/<版本>/`：历史版本文件；`archive/builds/` 保存旧构建目录，`archive/misc/` 保存旧工具与未标版本的文件。
- `intermediates/{version}/`：本轮未发布的完整版、未签名包、原始 APP 等中间文件。
- `metadata/{version}/`：发布说明、附件清单、签名与上传结果。
- `web/`、`windows-lite/`：当前构建工作目录。
- `tex-components/`：供导入与测试使用的原始排版组件；`plugins/`：插件包。

整理只移动文件，不删除历史产物。`organization-index.json` 记录每次移动前后的路径。
重新构建后运行 `python scripts/finalize-release.py --lite-only` 收集发布文件，再运行 `python scripts/organize-dist.py` 归档余下产物。
''', encoding='utf-8')
print(json.dumps({'moved': len(records), 'index': str(index)}, ensure_ascii=False))
