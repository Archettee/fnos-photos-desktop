# 把构建产物复制到“正常完整性级别”的目录，再分发/安装
#
# 背景：如果构建目录位于带 Low Mandatory Level 的工作区（某些沙箱/隔离目录会这样），
# 生成的 exe 会继承 Low 完整性标签，双击安装时会因为写不进 %LOCALAPPDATA%\Programs
# 而失败，并误报“无法关闭应用”。复制到普通目录即可获得默认的 Medium 级别。
#
# 用法：powershell -ExecutionPolicy Bypass -File scripts\release.ps1 -OutDir D:\releases

param(
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Setup = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not $Setup) {
  $Setup = Get-ChildItem (Join-Path $root "dist") -Filter "FnOS-Photos-Setup-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Setup -or -not (Test-Path -LiteralPath $Setup)) {
  throw "没有找到安装包，请先运行 npm run dist"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$dst = Join-Path $OutDir (Split-Path -Leaf $Setup)
Copy-Item -LiteralPath $Setup -Destination $dst -Force

Write-Host "已复制到: $dst"
Write-Host "--- 完整性标签（应看不到 Low Mandatory Level）---"
icacls $dst | Select-String "Mandatory Label"

$h1 = (Get-FileHash -LiteralPath $Setup -Algorithm SHA256).Hash
$h2 = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
if ($h1 -ne $h2) { throw "复制后哈希不一致，请重试" }
Write-Host "SHA256: $h2"
