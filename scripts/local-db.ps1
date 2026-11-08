<#
  PostgreSQL 17 + PostGIS 3.6 portables para desarrollo en Windows SIN Docker
  (por ejemplo, si la virtualización está desactivada). No necesita permisos de administrador.

  Uso:
    powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1 setup   # descarga, instala e inicializa
    powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1 start
    powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1 stop
    powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1 status

  Todo queda en .local/ (ignorado por git). Escucha en localhost:5433, usuario pc / pc_dev_password,
  base de datos puntos_carga: la misma DATABASE_URL que la opción con Docker.
#>
param([Parameter(Position = 0)][ValidateSet('setup', 'start', 'stop', 'status')][string]$Command = 'status')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Local = Join-Path $Root '.local'
$Downloads = Join-Path $Local 'downloads'
$PgHome = Join-Path $Local 'pgsql'
$PgBin = Join-Path $PgHome 'bin'
$PgData = Join-Path $Local 'pgdata'
$PgLog = Join-Path $Local 'postgres.log'
$Port = 5433

$PgUrl = 'https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip'
$PostgisUrl = 'https://download.osgeo.org/postgis/windows/pg17/postgis-bundle-pg17-3.6.2x64.zip'

function Get-File($Url, $Target) {
  if (Test-Path $Target) { Write-Host "  ya descargado: $(Split-Path -Leaf $Target)"; return }
  Write-Host "  descargando $Url"
  & curl.exe -sSL --fail -o $Target $Url
  if ($LASTEXITCODE -ne 0) { throw "Descarga fallida: $Url" }
}

function Invoke-Setup {
  New-Item -ItemType Directory -Force $Downloads | Out-Null
  if (-not (Test-Path (Join-Path $PgBin 'postgres.exe'))) {
    Write-Host '1/4 PostgreSQL'
    $pgZip = Join-Path $Downloads 'pg.zip'
    Get-File $PgUrl $pgZip
    & tar.exe -xf $pgZip -C $Local --exclude 'pgsql/pgAdmin 4' --exclude 'pgsql/StackBuilder' --exclude 'pgsql/doc'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo descomprimir PostgreSQL' }

    Write-Host '2/4 PostGIS'
    $gisZip = Join-Path $Downloads 'postgis.zip'
    Get-File $PostgisUrl $gisZip
    $tmp = Join-Path $Local 'postgis-tmp'
    New-Item -ItemType Directory -Force $tmp | Out-Null
    & tar.exe -xf $gisZip -C $tmp
    $bundle = Get-ChildItem $tmp -Directory | Select-Object -First 1
    foreach ($dir in 'bin', 'lib', 'share') {
      $src = Join-Path $bundle.FullName $dir
      if (Test-Path $src) { Copy-Item -Recurse -Force (Join-Path $src '*') (Join-Path $PgHome $dir) }
    }
    Remove-Item -Recurse -Force $tmp
  }

  if (-not (Test-Path (Join-Path $PgData 'PG_VERSION'))) {
    Write-Host '3/4 initdb'
    $pw = Join-Path $Local 'pwfile.tmp'
    Set-Content -Path $pw -Value 'pc_dev_password' -NoNewline -Encoding ascii
    & (Join-Path $PgBin 'initdb.exe') -D $PgData -U pc --pwfile=$pw -E UTF8 --no-locale --auth=scram-sha-256 | Out-Host
    Remove-Item $pw
    if ($LASTEXITCODE -ne 0) { throw 'initdb falló' }
  }

  Invoke-Start
  Write-Host '4/4 base de datos puntos_carga'
  $env:PGPASSWORD = 'pc_dev_password'
  $exists = & (Join-Path $PgBin 'psql.exe') -h localhost -p $Port -U pc -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'puntos_carga'"
  if ($exists -ne '1') {
    & (Join-Path $PgBin 'createdb.exe') -h localhost -p $Port -U pc puntos_carga
  }
  Write-Host "Listo: postgres://pc:pc_dev_password@localhost:$Port/puntos_carga"
}

function Invoke-Start {
  & (Join-Path $PgBin 'pg_ctl.exe') -D $PgData status *> $null
  if ($LASTEXITCODE -eq 0) { Write-Host 'PostgreSQL ya está en marcha'; return }
  & (Join-Path $PgBin 'pg_ctl.exe') -D $PgData -l $PgLog -o "-p $Port -c listen_addresses=localhost" -w start
  if ($LASTEXITCODE -ne 0) { throw "No arrancó PostgreSQL; mira $PgLog" }
}

switch ($Command) {
  'setup' { Invoke-Setup }
  'start' { Invoke-Start }
  'stop' { & (Join-Path $PgBin 'pg_ctl.exe') -D $PgData -w stop }
  'status' { & (Join-Path $PgBin 'pg_ctl.exe') -D $PgData status }
}
