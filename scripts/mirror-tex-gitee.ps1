# Mirrors a TeX component release (tag tex-<version>) or an app release (tag v<version>, with -AppVersion) to Gitee,
# for users who cannot reach GitHub quickly. The in-app downloader and updater try Gitee first, then GitHub.
# The Gitee private token is typed at the prompt and used only inside this process; it is never printed or saved.
# Usage: pwsh scripts/mirror-tex-gitee.ps1 -Owner <gitee user> -Repository <repo> [-Version 0.1.1] [-CreateRepository]
#        pwsh scripts/mirror-tex-gitee.ps1 -Owner <gitee user> -Repository <repo> -AppVersion 0.9.8
#        pwsh scripts/mirror-tex-gitee.ps1 -Owner <gitee user> -Repository <repo> -Catalog   (component catalog, tag catalog)
#        Add -Replace to upload every file again even when one of the same size is there (a rebuilt release).
#        Add -SkipVerify when downloads from Gitee are slow: sizes are checked through the API and only files under 1 MB are downloaded back.
param(
  [Parameter(Mandatory)][string]$Owner,
  [Parameter(Mandatory)][string]$Repository,
  [string]$Version = '0.1.1',
  [string]$AppVersion = '',
  [switch]$Catalog,
  [switch]$SkipVerify,
  [switch]$Replace,
  [switch]$CreateRepository
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($Catalog) {
  # The catalog changes in place: same tag, same file names, new content each time, so files are always replaced.
  $tag = 'catalog'
  $folder = Join-Path $root 'dist\releases\catalog'
  $names = @('catalog.json', 'SHA256SUMS-catalog.txt')
  $notes = $null
} elseif ($AppVersion) {
  # Installers, optional components and the checksum list. Gitee rejects attachments over 100 MB, so larger files
  # (currently the Windows installer and ZIP) stay GitHub-only and the app falls back to GitHub for them.
  $tag = "v$AppVersion"
  $folder = Join-Path $root "dist\releases\$AppVersion"
  $names = @(Get-ChildItem -LiteralPath $folder -File | Where-Object { $_.Name -match '\.(apk|hap|exe|zip|txt)$' -and $_.Name -notmatch '-source\.zip$' -and $_.Length -le 100MB } | ForEach-Object Name)
  foreach ($skipped in (Get-ChildItem -LiteralPath $folder -File | Where-Object { $_.Length -gt 100MB })) { Write-Host "超过 Gitee 附件上限，仅保留在 GitHub：$($skipped.Name)" }
  $notes = Join-Path $root "dist\metadata\$AppVersion\release-notes-$AppVersion.md"
} else {
  $tag = "tex-$Version"
  $folder = Join-Path $root "dist\releases\$tag"
  $names = @("Vela-TeX-$Version.zip", "SHA256SUMS-$tag.txt")
  $notes = Join-Path $root "dist\metadata\release-notes-$tag.md"
}
foreach ($name in $names) { if (!(Test-Path -LiteralPath (Join-Path $folder $name))) { throw "缺少文件：$folder\$name（先准备 GitHub 上的同名组件发布）" } }
$api = 'https://gitee.com/api/v5'
$secure = Read-Host '请输入 Gitee 私人令牌（需 projects 权限；输入时不显示）' -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
try {
  $repoUrl = "$api/repos/$Owner/$Repository"
  $exists = $true
  try { Invoke-RestMethod -Uri "$repoUrl`?access_token=$token" -Method Get | Out-Null } catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { $exists = $false } else { throw } }
  if (!$exists) {
    if (!$CreateRepository) { throw "Gitee 上没有 $Owner/$Repository。加 -CreateRepository 可创建公开仓库。" }
    Invoke-RestMethod -Uri "$api/user/repos" -Method Post -Body @{ access_token = $token; name = $Repository; description = '文舟 Vela 的 Gitee 镜像（组件与发布文件）'; private = 'false'; auto_init = 'true' } | Out-Null
    Write-Host "已创建 Gitee 仓库 $Owner/$Repository"
  }
  $release = $null
  try { $release = Invoke-RestMethod -Uri "$repoUrl/releases/tags/$tag`?access_token=$token" -Method Get } catch { if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw } }
  if (!$release -or !$release.id) {
    $branch = (Invoke-RestMethod -Uri "$repoUrl`?access_token=$token" -Method Get).default_branch
    if (!$branch) {
      # A release needs a commit to tag; an empty repository gets a README explaining the mirror.
      $readme = "# 文舟 Vela 镜像`n`n文舟 Vela（https://github.com/KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager）的 Gitee 镜像，提供可选组件等发布文件，方便无法顺畅访问 GitHub 的用户下载。文件与 GitHub 发布逐字节相同，SHA-256 见各发布中的校验清单。`n"
      Invoke-RestMethod -Uri "$repoUrl/contents/README.md" -Method Post -Body @{ access_token = $token; content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($readme)); message = '初始化镜像仓库说明'; branch = 'master' } | Out-Null
      $branch = 'master'
      Write-Host '空仓库：已添加 README.md 作为初始提交'
    }
    $release = Invoke-RestMethod -Uri "$repoUrl/releases" -Method Post -Body @{ access_token = $token; tag_name = $tag; name = $(if ($Catalog) { '文舟组件目录' } elseif ($AppVersion) { "Vela $AppVersion" } else { "Vela TeX 组件 $Version" }); body = $(if ($notes) { Get-Content -LiteralPath $notes -Raw -Encoding utf8 } else { '文舟组件目录：应用从此发布的 catalog.json 读取可下载的组件及其版本、大小和 SHA-256。' }); prerelease = 'false'; target_commitish = $branch }
    Write-Host "已创建 Gitee 发布 $tag"
  }
  # Invoke-RestMethod emits a JSON array as one object; ForEach-Object unrolls it into the attachments.
  $attached = @(Invoke-RestMethod -Uri "$repoUrl/releases/$($release.id)/attach_files?access_token=$token&per_page=100" -Method Get | ForEach-Object { $_ })
  foreach ($name in $names) {
    $file = Get-Item -LiteralPath (Join-Path $folder $name)
    # Every copy of a replaced attachment is deleted, so the fixed download address serves only the new file.
    $existing = @($attached | Where-Object name -eq $name)
    if ($existing.Count -eq 1 -and !$Catalog -and !$Replace -and [int64]$existing[0].size -eq $file.Length) { Write-Host "已存在，跳过：$name"; continue }
    foreach ($old in $existing) { Invoke-RestMethod -Uri "$repoUrl/releases/$($release.id)/attach_files/$($old.id)?access_token=$token" -Method Delete | Out-Null }
    # Gitee ignores access_token as a multipart field (40001); it has to be in the query string here.
    Invoke-RestMethod -Uri "$repoUrl/releases/$($release.id)/attach_files?access_token=$token" -Method Post -Form @{ file = $file } | Out-Null
    Write-Host "已上传：$name（$($file.Length) 字节）"
  }
  if ($SkipVerify) {
    # Slow download paths: compare the sizes Gitee reports instead of downloading large files back.
    $listed = @(Invoke-RestMethod -Uri "$repoUrl/releases/$($release.id)/attach_files?access_token=$token&per_page=100" -Method Get | ForEach-Object { $_ })
    foreach ($name in $names) {
      $size = (Get-Item -LiteralPath (Join-Path $folder $name)).Length; $entry = @($listed | Where-Object name -eq $name)
      if ($entry.Count -ne 1 -or [int64]$entry[0].size -ne $size) { throw "Gitee 上的 $name 大小与本地不一致。" }
      Write-Host "大小一致：$name"
    }
  }
} finally {
  $token = $null
}
# Public check without the token: the fixed download address must return the same bytes.
$expected = @{}; foreach ($line in Get-Content -LiteralPath (Join-Path $folder $(if ($Catalog) { 'SHA256SUMS-catalog.txt' } elseif ($AppVersion) { "SHA256SUMS-$AppVersion.txt" } else { "SHA256SUMS-$tag.txt" }))) { $parts = $line -split '  ', 2; $expected[$parts[1]] = $parts[0] }
$temporary = Join-Path ([IO.Path]::GetTempPath()) "vela-gitee-check-$tag"; New-Item -ItemType Directory -Force -Path $temporary | Out-Null
$failed = 0
foreach ($name in $names) {
  if ($SkipVerify -and (Get-Item -LiteralPath (Join-Path $folder $name)).Length -gt 1MB) { continue }
  $target = Join-Path $temporary $name
  Invoke-WebRequest -Uri "https://gitee.com/$Owner/$Repository/releases/download/$tag/$name" -OutFile $target -UseBasicParsing
  $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower()
  $ok = if ($expected.ContainsKey($name)) { $hash -eq $expected[$name] } else { (Get-Item $target).Length -eq (Get-Item (Join-Path $folder $name)).Length }
  if (!$ok) { $failed++ }
  Write-Host ("{0} {1}" -f $(if ($ok) { 'OK ' } else { 'BAD' }), $name)
}
Remove-Item -Recurse -Force -LiteralPath $temporary
if ($failed) { throw "$failed 个文件从 Gitee 下载后校验不一致。" }
Write-Host "Gitee 镜像完成：https://gitee.com/$Owner/$Repository/releases/tag/$tag"
