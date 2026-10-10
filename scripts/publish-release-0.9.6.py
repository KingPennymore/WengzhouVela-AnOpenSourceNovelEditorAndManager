import concurrent.futures, hashlib, json, pathlib, subprocess, urllib.error, urllib.parse, urllib.request, os, re

root = pathlib.Path(__file__).resolve().parent.parent
dist = root / 'dist'
metadata = dist / 'metadata' / '0.9.6'
metadata.mkdir(parents=True, exist_ok=True)
def metadata_path(name):
    return metadata / name if (metadata / name).is_file() else dist / name
repo = 'KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager'
api_root = f'https://api.github.com/repos/{repo}'
credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, cwd=root, check=True)
fields = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
token = fields.get('password', '')
if not token:
    raise SystemExit('GitHub authentication unavailable')
headers = {'Authorization': 'Bearer ' + token, 'User-Agent': 'Vela-release-0.9.6', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}

def api(url, method='GET', data=None):
    body = None if data is None else json.dumps(data).encode()
    request_headers = {**headers, 'Content-Type': 'application/json'}
    with urllib.request.urlopen(urllib.request.Request(url, data=body, method=method, headers=request_headers), timeout=120) as response:
        payload = response.read()
        return json.loads(payload) if payload else None

head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
tag_commit = subprocess.check_output(['git', 'rev-list', '-n', '1', 'v0.9.6'], cwd=root, text=True).strip()
if head != tag_commit:
    raise RuntimeError('release tag does not identify the current commit')
remote_tag = api(api_root + '/git/ref/tags/v0.9.6')['object']
if remote_tag['type'] == 'tag':
    remote_tag = api(remote_tag['url'])['object']
if remote_tag['sha'] != head:
    raise RuntimeError('remote release tag does not match the verified commit')

assets = json.loads(metadata_path('release-assets-0.9.6.json').read_text(encoding='utf-8'))
release_list = api(api_root + '/releases?per_page=100')
release = next((item for item in release_list if item['tag_name'] == 'v0.9.6' or item['name'] == 'Vela 0.9.6'), None)
if release and not release['draft']:
    print('Updating the already published v0.9.6 asset set after the final tag verification.')
if not release:
    release = api(api_root + '/releases', 'POST', {'tag_name': 'v0.9.6', 'name': 'Vela 0.9.6', 'body': metadata_path('release-notes-0.9.6.md').read_text(encoding='utf-8'), 'draft': True, 'prerelease': False, 'generate_release_notes': False})
else:
    release = api(api_root + '/releases/' + str(release['id']), 'PATCH', {'tag_name': 'v0.9.6', 'target_commitish': head, 'name': 'Vela 0.9.6', 'body': metadata_path('release-notes-0.9.6.md').read_text(encoding='utf-8')})
release_url = api_root + '/releases/' + str(release['id'])
upload_url = release['upload_url'].split('{', 1)[0]

def local_path(name):
    path = dist / name
    return next(p for p in [dist / 'releases' / '0.9.6' / name, path, dist / 'windows' / name, dist / 'windows-lite' / name, dist / 'tex-components' / name] if p.exists())

def upload(name):
    path = local_path(name)
    digest = 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()
    existing = next((item for item in api(release_url + '/assets') if item['name'] == name), None)
    if existing:
        if existing['state'] == 'uploaded' and existing['size'] == path.stat().st_size and existing.get('digest') == digest:
            return {'name': name, 'size': existing['size'], 'digest': existing['digest'], 'reused': True}
        api(api_root + '/releases/assets/' + str(existing['id']), 'DELETE')
    uploaded = subprocess.run(['node', str(root / 'scripts/upload-release.mjs')],
                              input=json.dumps({'url': upload_url + '?name=' + urllib.parse.quote(name),
                                                'token': token, 'path': str(path)}),
                              text=True, stdout=subprocess.PIPE, cwd=root, check=True)
    item = json.loads(uploaded.stdout)
    if item['state'] != 'uploaded' or item['size'] != path.stat().st_size or item.get('digest') != digest:
        raise RuntimeError(f'asset verification failed: {name}')
    return {'name': name, 'size': item['size'], 'digest': item['digest'], 'reused': False}

# Remove only the six full packages explicitly excluded from this release.
full_packages = {'Vela-0.9.6-release-signed.hap', 'Vela-0.9.6-release-signed.app.zip',
                 'Vela-0.9.6-android.1-release-signed.apk', 'Vela-0.9.6-android.1-release-signed.aab',
                 'Vela-0.9.6-windows-setup-x64.exe', 'Vela-0.9.6-windows-x64.zip'}
for item in api(release_url + '/assets'):
    if item['name'] in full_packages and item['name'] not in assets:
        api(api_root + '/releases/assets/' + str(item['id']), 'DELETE')

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
ci_commit = os.environ.get('VELA_VERIFIED_CI_COMMIT', head)
if not re.fullmatch('[0-9a-f]{40}', ci_commit):
    raise RuntimeError('invalid verified commit')
if ci_commit != head:
    subprocess.run(['git', 'merge-base', '--is-ancestor', ci_commit, head], cwd=root, check=True)
    changed = set(subprocess.check_output(['git', 'diff', '--name-only', ci_commit, head, '--'], cwd=root, text=True).splitlines())
    release_only = {'README.md', 'RELEASE_NOTES.md', 'VALIDATION.md', 'scripts/finalize-release.py', 'scripts/publish-release-0.9.6.py'}
    if not changed <= release_only:
        raise RuntimeError('application or test code changed after the verified commit')
runs = api(api_root + '/actions/runs?head_sha=' + ci_commit)['workflow_runs']
verify_runs = [run for run in runs if run['name'] == 'Verify' and run['head_sha'] == ci_commit]
if not verify_runs or verify_runs[0]['status'] != 'completed' or verify_runs[0]['conclusion'] != 'success':
    raise RuntimeError('Assets verified; keeping the release draft until Verify succeeds for this commit')
published = api(release_url, 'PATCH', {'tag_name': 'v0.9.6', 'target_commitish': head, 'draft': False, 'prerelease': False, 'make_latest': 'true'})
latest = api(api_root + '/releases/latest')
if published['draft'] or published['tag_name'] != 'v0.9.6' or latest['tag_name'] != 'v0.9.6':
    raise RuntimeError('release publication verification failed')
result = {'url': published['html_url'], 'id': published['id'], 'tag': published['tag_name'], 'assets': uploaded}
(metadata / 'release-0.9.6-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
