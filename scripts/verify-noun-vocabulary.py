"""Reproduce the pinned jieba exclusion vocabulary; never sends manuscripts."""
import hashlib,json,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent.parent
folder=root/'vendor/jieba';source=json.loads((folder/'SOURCE.json').read_text('utf-8'))
data=urllib.request.urlopen(f"https://raw.githubusercontent.com/fxsjy/jieba/{source['commit']}/{source['path']}",timeout=60).read()
assert hashlib.sha256(data).hexdigest()==source['sha256'],'Upstream dictionary checksum mismatch'
words=set()
for line in data.decode('utf-8').splitlines():
 word,frequency,tag=line.split()
 if 2<=len(word)<=8 and (int(frequency)>=500 or not tag.startswith('n')):words.add(word)
assert len(words)==source['words']
result='// Generated noun candidate exclusion vocabulary; see SOURCE.json and LICENSE.\nexport const excludedWords='+json.dumps(' '.join(sorted(words)),ensure_ascii=False,separators=(',',':'))+';\n'
assert result==(folder/'filter.mjs').read_text('utf-8'),'Vocabulary differs from the pinned derivation'
print(f'Verified {len(words)} exclusions against pinned upstream SHA-256')
