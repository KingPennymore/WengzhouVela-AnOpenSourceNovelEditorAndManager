import concurrent.futures, hashlib, json, pathlib, subprocess, urllib.error, urllib.parse, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
dist = root / 'dist'
repo = 'KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager'
api_root = f'https://api.github.com/repos/{repo}'
credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, cwd=root, check=True)
fields = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
token = fields.get('password', '')
if not token:
    raise SystemExit('GitHub authentication unavailable')
headers = {'Authorization': 'Bearer ' + token, 'User-Agent': 'Vela-release-0.9.1', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}

def api(url, method='GET', data=None):
    body = None if data is None else json.dumps(data).encode()
    request_headers = {**headers, 'Content-Type': 'application/json'}
    with urllib.request.urlopen(urllib.request.Request(url, data=body, method=method, headers=request_headers), timeout=120) as response:
        payload = response.read()
        return json.loads(payload) if payload else None

assets = json.loads((dist / 'release-assets-0.9.1.json').read_text(encoding='utf-8'))
release_list = api(api_root + '/releases?per_page=100')
release = next((item for item in release_list if item['tag_name'] == 'v0.9.1'), None)
if release and not release['draft']:
    print('Updating the already published v0.9.1 asset set after the final tag verification.')
if not release:
    release = api(api_root + '/releases', 'POST', {'tag_name': 'v0.9.1', 'name': 'Vela 0.9.1', 'body': (dist / 'release-notes-0.9.1.md').read_text(encoding='utf-8'), 'draft': True, 'prerelease': False, 'generate_release_notes': False})
else:
    release = api(api_root + '/releases/' + str(release['id']), 'PATCH', {'name': 'Vela 0.9.1', 'body': (dist / 'release-notes-0.9.1.md').read_text(encoding='utf-8')})
release_url = api_root + '/releases/' + str(release['id'])
upload_url = release['upload_url'].split('{', 1)[0]

def local_path(name):
    path = dist / name
    return path if path.exists() else dist / 'windows' / name

def upload(name):
    path = local_path(name)
    digest = 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()
    existing = next((item for item in api(release_url + '/assets') if item['name'] == name), None)
    if existing:
        if existing['state'] == 'uploaded' and existing['size'] == path.stat().st_size and existing.get('digest') == digest:
            return {'name': name, 'size': existing['size'], 'digest': existing['digest'], 'reused': True}
        api(api_root + '/releases/assets/' + str(existing['id']), 'DELETE')
    with path.open('rb') as handle:
        request = urllib.request.Request(upload_url + '?name=' + urllib.parse.quote(name), data=handle, method='POST', headers={**headers, 'Content-Type': 'application/octet-stream', 'Content-Length': str(path.stat().st_size)})
        with urllib.request.urlopen(request, timeout=300) as response:
            item = json.load(response)
    if item['state'] != 'uploaded' or item['size'] != path.stat().st_size or item.get('digest') != digest:
        raise RuntimeError(f'asset verification failed: {name}')
    return {'name': name, 'size': item['size'], 'digest': item['digest'], 'reused': False}

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    uploaded = list(pool.map(upload, assets))
server_assets = api(release_url + '/assets')
if {item['name'] for item in server_assets} != set(assets):
    raise RuntimeError('release asset set mismatch')
for name in assets:
    item = next(item for item in server_assets if item['name'] == name)
    path = local_path(name)
    expected = 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()
    if item['size'] != path.stat().st_size or item.get('digest') != expected:
        raise RuntimeError('release hash mismatch: ' + name)
published = api(release_url, 'PATCH', {'draft': False, 'prerelease': False, 'make_latest': 'true'})
latest = api(api_root + '/releases/latest')
if published['draft'] or latest['tag_name'] != 'v0.9.1':
    raise RuntimeError('release publication verification failed')
result = {'url': published['html_url'], 'id': published['id'], 'tag': published['tag_name'], 'assets': uploaded}
(dist / 'release-0.9.1-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
