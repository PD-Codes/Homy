# Run Homy from source — no pip install, no build/ or *.egg-info in the repo.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
$env:PYTHONPATH = $Root
if (-not $env:FLASK_ENV) { $env:FLASK_ENV = 'development' }
python -m homy.app @args
