$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Axoriin Face Bridge 1.2 - configuração conhecida do CMDPII/CZS.
# Chaves Bridge e credenciais Web/API dos iDFace ficam somente nas variáveis
# do processo atual e não são gravadas neste arquivo.

$env:BRIDGE_HOST = "0.0.0.0"
$env:BRIDGE_PORT = "8787"
$env:AXORIIN_BASE_URL = Read-Host "URL do Axoriin (ex.: https://app.axoriin.com.br)"
$env:BRIDGE_RETRY_MS = "15000"
$env:BRIDGE_COMMAND_POLL_MS = "3000"
$env:BRIDGE_CAPTURE_DELAY_MS = "6000"

$devices = @(
    @{ N="01"; Name="IDFACE 01"; IP="192.168.20.16"; Port="80"; DeviceId="6613665520309965" },
    @{ N="02"; Name="IDFACE 02"; IP="192.168.20.96"; Port="80"; DeviceId="6613047045029379" },
    @{ N="03"; Name="IDFACE 03"; IP="192.168.20.15"; Port="80"; DeviceId="6613665520309907" },
    @{ N="04"; Name="IDFACE 04"; IP="192.168.20.89"; Port="80"; DeviceId="6613665520309913" }
)

function Secure-ToPlain([Security.SecureString]$Secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " AXORIIN FACE BRIDGE 1.2" -ForegroundColor Cyan
Write-Host " Eventos + Cadastro Facial Central" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "As credenciais Control iD abaixo ficam somente nesta execucao." -ForegroundColor Green
Write-Host "Nao sao salvas no projeto, MongoDB ou fila do Bridge." -ForegroundColor Green
Write-Host ""

$apiUser = (Read-Host "Usuario Web/API dos iDFace").Trim()
if ([string]::IsNullOrWhiteSpace($apiUser)) { throw "Usuario Web/API ausente." }
$apiSecure = Read-Host "Senha Web/API dos iDFace" -AsSecureString
$apiPassword = Secure-ToPlain $apiSecure
if ([string]::IsNullOrWhiteSpace($apiPassword)) { throw "Senha Web/API ausente." }

$env:IDFACE_API_USER = $apiUser
$env:IDFACE_API_PASSWORD = $apiPassword
$apiPassword = $null

foreach ($d in $devices) {
    [Environment]::SetEnvironmentVariable("IDFACE_$($d.N)_NAME", $d.Name, "Process")
    [Environment]::SetEnvironmentVariable("IDFACE_$($d.N)_IP", $d.IP, "Process")
    [Environment]::SetEnvironmentVariable("IDFACE_$($d.N)_PORT", $d.Port, "Process")
    [Environment]::SetEnvironmentVariable("IDFACE_$($d.N)_DEVICE_ID", $d.DeviceId, "Process")
    Write-Host ""
    Write-Host "$($d.Name) - $($d.IP):$($d.Port) - device_id $($d.DeviceId)" -ForegroundColor Cyan
    $secure = Read-Host "Cole a chave Bridge gerada no Axoriin para este aparelho" -AsSecureString
    $plain = Secure-ToPlain $secure
    if ([string]::IsNullOrWhiteSpace($plain)) { throw "Chave ausente para $($d.Name)." }
    [Environment]::SetEnvironmentVariable("AXORIIN_DEVICE_KEY_$($d.N)", $plain, "Process")
    $plain = $null
}

Write-Host ""
Write-Host "Iniciando Axoriin Face Bridge 1.2..." -ForegroundColor Green
Write-Host "Cadastro facial central: ATIVO" -ForegroundColor Green
Write-Host ""
node "$PSScriptRoot\axoriin-face-bridge.js"
