"""无需 npm，执行 python3 build.py 即可重新生成安装包。"""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'plugin.json').read_text(encoding='utf-8'))
sources = [(ROOT / 'src/core.js').read_text(encoding='utf-8'),
           (ROOT / 'src/i18n.js').read_text(encoding='utf-8'),
           (ROOT / 'src/plugin.js').read_text(encoding='utf-8')]
(ROOT / 'main.js').write_text('/* Acode Writer v' + manifest['version'] + ' - MIT */\n(() => {\n' +
                            '\n'.join(sources) + '\n})();\n', encoding='utf-8')
paths = ['plugin.json', 'main.js', 'readme.md', 'changelogs.md', 'icon.png', *manifest['files']]
output = ROOT.parent / f"Acode-Writer-{manifest['version']}.zip"
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in dict.fromkeys(paths):
        archive.write(ROOT / path, path)
print(output)
