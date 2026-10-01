param([string]$DevEco = 'D:\DevEco Studio')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
$env:DEVECO_SDK_HOME = Join-Path $DevEco 'sdk'
$env:JAVA_HOME = Join-Path $DevEco 'jbr'
$env:NODE_HOME = Join-Path $DevEco 'tools\node'
$env:Path = "$env:NODE_HOME;$env:JAVA_HOME\bin;$env:Path"
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw '编辑器构建失败' }
& (Join-Path $DevEco 'tools\ohpm\bin\ohpm.bat') install
if ($LASTEXITCODE -ne 0) { throw '鸿蒙依赖准备失败' }
& (Join-Path $DevEco 'tools\hvigor\bin\hvigorw.bat') --mode module -p product=default -p module=entry@default assembleHap --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'HAP 构建失败' }
