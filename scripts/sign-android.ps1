param([string]$SigningDirectory = '', [switch]$CreateKey, [switch]$Lite)
$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User') }
$jdk = if ($env:ANDROID_JAVA_HOME) { $env:ANDROID_JAVA_HOME } else { [Environment]::GetEnvironmentVariable('ANDROID_JAVA_HOME', 'User') }
if (!$jdk) { $jdk = $env:JAVA_HOME }
if (!$sdk -or !$jdk) { throw '请配置 ANDROID_HOME 和完整 JDK 的 ANDROID_JAVA_HOME。' }
if (!$SigningDirectory) { $SigningDirectory = Join-Path (Split-Path -Parent $sdk) 'Signing\Wenzhou' }
$SigningDirectory = [IO.Path]::GetFullPath($SigningDirectory)
if ($SigningDirectory.Equals($repository, [StringComparison]::OrdinalIgnoreCase) -or $SigningDirectory.StartsWith($repository + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '签名密钥必须存储在仓库外。' }
$key = Join-Path $SigningDirectory 'Wenzhou-release.p12'
$passwordFile = Join-Path $SigningDirectory 'keystore-password.txt'
$certificate = Join-Path $SigningDirectory 'Wenzhou-release-public.cer'
$alias = 'wenzhou-release'
$version = [regex]::Match((Get-Content -LiteralPath (Join-Path $repository 'android\app\build.gradle') -Raw), "versionName '([^']+)'").Groups[1].Value
if (!$version) { throw '无法读取安卓版本。' }
$artifactVersion = if ($Lite) { $version + '-lite' } else { $version }
$distribution = Join-Path $repository 'dist'
$inputApk = Join-Path $distribution "Vela-$artifactVersion-release-unsigned.apk"
$inputBundle = Join-Path $distribution "Vela-$artifactVersion-release-unsigned.aab"
if (!(Test-Path -LiteralPath $inputApk) -or !(Test-Path -LiteralPath $inputBundle)) { throw '请先运行 node scripts/build-android.mjs --release。' }
if (!(Test-Path -LiteralPath $key) -and !$CreateKey) { throw '发布密钥不存在。首次创建请显式使用 -CreateKey；更新版本必须使用原密钥。' }

function Protect-SigningPath([string]$path) {
  $directory = Test-Path -LiteralPath $path -PathType Container
  $acl = if ($directory) { [Security.AccessControl.DirectorySecurity]::new() } else { [Security.AccessControl.FileSecurity]::new() }
  $acl.SetAccessRuleProtection($true, $false)
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  $inherit = if ($directory) { [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
  foreach ($principal in @($identity, $system)) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal, [Security.AccessControl.FileSystemRights]::FullControl, $inherit, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
  }
  if ($directory) { [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($path), $acl) }
  else { [IO.FileSystemAclExtensions]::SetAccessControl([IO.FileInfo]::new($path), $acl) }
}
function Invoke-SigningTool([string]$program, [string[]]$arguments) {
  & $program @arguments
  if ($LASTEXITCODE -ne 0) { throw "签名工具执行失败：$([IO.Path]::GetFileName($program))，退出码 $LASTEXITCODE" }
}

if (!(Test-Path -LiteralPath $SigningDirectory)) { [void](New-Item -ItemType Directory -Path $SigningDirectory); Protect-SigningPath $SigningDirectory }
if (!(Test-Path -LiteralPath $passwordFile)) {
  if (Test-Path -LiteralPath $key) { throw '密钥已存在但密码文件缺失，请恢复原密码文件；不会重新生成密钥。' }
  $random = [byte[]]::new(48)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($random) } finally { $generator.Dispose() }
  [IO.File]::WriteAllText($passwordFile, [Convert]::ToBase64String($random), [Text.UTF8Encoding]::new($false))
}
Protect-SigningPath $passwordFile
$previousPassword = $env:WENZHOU_KEYSTORE_PASSWORD
$previousJava = $env:JAVA_HOME
try {
  $env:JAVA_HOME = $jdk
  $env:WENZHOU_KEYSTORE_PASSWORD = [IO.File]::ReadAllText($passwordFile).Trim()
  if (!$env:WENZHOU_KEYSTORE_PASSWORD) { throw '签名密码文件为空。' }
  $keytool = Join-Path $jdk 'bin\keytool.exe'
  if (!(Test-Path -LiteralPath $key)) {
    Invoke-SigningTool $keytool @('-genkeypair', '-alias', $alias, '-keyalg', 'RSA', '-keysize', '4096', '-sigalg', 'SHA256withRSA', '-validity', '10000', '-dname', 'CN=Wenzhou Release, O=Wenzhou, C=CN', '-storetype', 'PKCS12', '-keystore', $key, '-storepass:env', 'WENZHOU_KEYSTORE_PASSWORD', '-keypass:env', 'WENZHOU_KEYSTORE_PASSWORD', '-noprompt')
  }
  Protect-SigningPath $key
  Invoke-SigningTool $keytool @('-exportcert', '-alias', $alias, '-keystore', $key, '-storepass:env', 'WENZHOU_KEYSTORE_PASSWORD', '-file', $certificate)
  $outputApk = Join-Path $distribution "Vela-$artifactVersion-release-signed.apk"
  $outputBundle = Join-Path $distribution "Vela-$artifactVersion-release-signed.aab"
  $tools = Join-Path $sdk 'build-tools\36.0.0'
  Invoke-SigningTool (Join-Path $tools 'apksigner.bat') @('sign', '--ks', $key, '--ks-key-alias', $alias, '--ks-pass', 'env:WENZHOU_KEYSTORE_PASSWORD', '--key-pass', 'env:WENZHOU_KEYSTORE_PASSWORD', '--v1-signing-enabled', 'false', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true', '--v4-signing-enabled', 'false', '--out', $outputApk, $inputApk)
  Invoke-SigningTool (Join-Path $tools 'apksigner.bat') @('verify', '--verbose', '--print-certs', $outputApk)
  Invoke-SigningTool (Join-Path $tools 'zipalign.exe') @('-c', '-P', '16', '4', $outputApk)
  $jarsigner = Join-Path $jdk 'bin\jarsigner.exe'
  Invoke-SigningTool $jarsigner @('-keystore', $key, '-storepass:env', 'WENZHOU_KEYSTORE_PASSWORD', '-keypass:env', 'WENZHOU_KEYSTORE_PASSWORD', '-digestalg', 'SHA-256', '-sigalg', 'SHA256withRSA', '-signedjar', $outputBundle, $inputBundle, $alias)
  Invoke-SigningTool $jarsigner @('-verify', '-strict', '-keystore', $key, '-storepass:env', 'WENZHOU_KEYSTORE_PASSWORD', $outputBundle)
  $publicKey = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificate)
  $manifest = [ordered]@{ version = $version; package = 'me.wenzhou.write'; variant = 'release'; signed = $true; certificateSha256 = $publicKey.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256); files = @() }
  foreach ($file in @($outputApk, $outputBundle)) { $manifest.files += @{ file = [IO.Path]::GetFileName($file); bytes = (Get-Item -LiteralPath $file).Length; sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() } }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $distribution $(if ($Lite) { 'android-release-lite-signed.json' } else { 'android-release-signed.json' })) -Encoding utf8
  Write-Host "已生成发布签名 APK 和 AAB：$distribution"
  Write-Host "请安全备份密钥和密码文件：$SigningDirectory"
} finally {
  $env:WENZHOU_KEYSTORE_PASSWORD = $previousPassword
  $env:JAVA_HOME = $previousJava
}
