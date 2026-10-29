param([string]$DevEco = 'D:\DevEco Studio')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
$env:DEVECO_SDK_HOME = Join-Path $DevEco 'sdk'
$env:JAVA_HOME = Join-Path $DevEco 'jbr'
# Build the frontend with the caller's Node. DevEco's bundled Node 18 lacks
# the File API required by the ebook dependencies; retain it only for Hvigor.
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw '编辑器构建失败' }
$env:NODE_HOME = Join-Path $DevEco 'tools\node'
$env:Path = "$env:NODE_HOME;$env:JAVA_HOME\bin;$env:Path"
& (Join-Path $DevEco 'tools\ohpm\bin\ohpm.bat') install
if ($LASTEXITCODE -ne 0) { throw '鸿蒙依赖准备失败' }
& (Join-Path $DevEco 'tools\hvigor\bin\hvigorw.bat') --mode module -p product=default -p module=entry@default assembleHap --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'HAP 构建失败' }
