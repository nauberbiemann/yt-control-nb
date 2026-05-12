# sync-hf-templates.ps1
# ─────────────────────────────────────────────────────────────────────────────
# Sincroniza os templates HyperFrame do projeto Next.js (fonte da verdade)
# para a pasta de templates do pipeline Python (editor-hyperframes).
#
# Configuração:
#   Defina HF_TEMPLATES_TARGET no arquivo .env.local na raiz do projeto, ex:
#   HF_TEMPLATES_TARGET=D:\onedrive\Downloads\editor-hyperframes\templates
#
# Uso manual:
#   powershell -ExecutionPolicy Bypass -File scripts\sync-hf-templates.ps1
#
# Via npm:
#   npm run sync-hf
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'

# ── 1. Resolve caminhos ───────────────────────────────────────────────────────

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$sourceDir   = Join-Path $projectRoot "lib\hf-templates"
$envFile     = Join-Path $projectRoot ".env.local"

# ── 2. Lê o caminho destino do .env.local ────────────────────────────────────

$targetDir = $null

if (Test-Path $envFile) {
    $lines = Get-Content $envFile
    foreach ($line in $lines) {
        if ($line -match '^\s*HF_TEMPLATES_TARGET\s*=\s*(.+)$') {
            $targetDir = $Matches[1].Trim().Trim('"').Trim("'")
            break
        }
    }
}

# Fallback: verifica variável de ambiente do sistema
if (-not $targetDir) {
    $targetDir = $env:HF_TEMPLATES_TARGET
}

# ── 3. Valida configuração ────────────────────────────────────────────────────

if (-not $targetDir) {
    Write-Host ""
    Write-Host "  ⚠️  CAMINHO DESTINO NÃO CONFIGURADO" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Adicione ao arquivo .env.local:" -ForegroundColor White
    Write-Host "  HF_TEMPLATES_TARGET=D:\caminho\para\editor-hyperframes\templates" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Exemplo real:" -ForegroundColor White
    Write-Host "  HF_TEMPLATES_TARGET=D:\onedrive\Downloads\editor-hyperframes\templates" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

if (-not (Test-Path $sourceDir)) {
    Write-Host ""
    Write-Host "  ❌ Pasta de origem não encontrada: $sourceDir" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ── 4. Cria destino se não existir ───────────────────────────────────────────

if (-not (Test-Path $targetDir)) {
    Write-Host ""
    Write-Host "  📁 Criando pasta destino: $targetDir" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

# ── 5. Copia os templates ─────────────────────────────────────────────────────

$templates = Get-ChildItem -Path $sourceDir -Filter "*.html"

if ($templates.Count -eq 0) {
    Write-Host ""
    Write-Host "  ⚠️  Nenhum template .html encontrado em: $sourceDir" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "  🔄 Sincronizando HyperFrame Templates..." -ForegroundColor Cyan
Write-Host "     Origem:  $sourceDir" -ForegroundColor Gray
Write-Host "     Destino: $targetDir" -ForegroundColor Gray
Write-Host ""

$copied  = 0
$updated = 0

foreach ($file in $templates) {
    $dest = Join-Path $targetDir $file.Name
    $isNew = -not (Test-Path $dest)

    Copy-Item -Path $file.FullName -Destination $dest -Force

    if ($isNew) {
        Write-Host "  ✅ [NOVO]      $($file.Name)" -ForegroundColor Green
        $copied++
    } else {
        Write-Host "  🔁 [ATUALIZADO] $($file.Name)" -ForegroundColor Blue
        $updated++
    }
}

Write-Host ""
Write-Host "  ──────────────────────────────────────────" -ForegroundColor Gray
Write-Host "  ✅ Sincronização concluída!" -ForegroundColor Green
Write-Host "     $copied arquivo(s) novo(s)  |  $updated atualizado(s)" -ForegroundColor White
Write-Host ""
