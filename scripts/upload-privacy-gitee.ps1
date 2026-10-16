# Uploads docs/PRIVACY.md to the Gitee mirror repository as PRIVACY.md (creates or updates it).
# The Gitee private token (projects permission) is typed at the prompt and never printed or saved.
# Usage: pwsh scripts/upload-privacy-gitee.ps1 [-Owner kingpennymore] [-Repository wenzhou-vela-mirror-repository]
param([string]$Owner = 'kingpennymore', [string]$Repository = 'wenzhou-vela-mirror-repository', [string]$Branch = 'master')
$ErrorActionPreference = 'Stop'
$file = Join-Path (Split-Path -Parent $PSScriptRoot) 'docs\PRIVACY.md'
$content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(((Get-Content -LiteralPath $file -Raw -Encoding utf8) -replace "`r`n", "`n")))
$secure = Read-Host '请输入 Gitee 私人令牌（输入时不显示）' -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$api = "https://gitee.com/api/v5/repos/$Owner/$Repository/contents/PRIVACY.md"
$sha = $null
try { $sha = (Invoke-RestMethod -Uri "$api`?access_token=$token&ref=$Branch").sha } catch { if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw } }
$body = @{ access_token = $token; content = $content; message = '更新隐私政策'; branch = $Branch }
# Gitee needs an explicit content type for PUT; JSON works for both create and update.
if ($sha) { $body.sha = $sha }
Invoke-RestMethod -Uri $api -Method $(if ($sha) { 'Put' } else { 'Post' }) -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json))) | Out-Null
Write-Host "已上传：https://gitee.com/$Owner/$Repository/blob/$Branch/PRIVACY.md"
