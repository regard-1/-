$ErrorActionPreference = "Stop"
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectPath

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
    $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
}

if (-not $pythonCommand) {
    Write-Host "未找到 Python 3。请先安装 Python 3.10 或更高版本，并将其加入 PATH。" -ForegroundColor Yellow
    exit 1
}

Write-Host "正在启动多特倍斯运营中台：http://localhost:8090" -ForegroundColor Green
if ($pythonCommand.Name -eq "py.exe" -or $pythonCommand.Name -eq "py") {
    & $pythonCommand.Source -3 server.py
} else {
    & $pythonCommand.Source server.py
}
