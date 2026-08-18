param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$ApplicationId,

    [string]$ApplicationDisplayName =
        'EDULAG - Sincronización de usuarios',

    [string]$ConfigPath =
        '.\sharepoint-solicitudes-config.json',

    [switch]$UseDeviceAuthentication
)

$ErrorActionPreference = 'Stop'
$connected = $false

if (-not (Get-Command Connect-MgGraph -ErrorAction SilentlyContinue)) {
    throw @'
No se encontró Microsoft Graph PowerShell.
Instálalo con:

Install-Module Microsoft.Graph.Authentication -Scope CurrentUser -Repository PSGallery -Force
'@
}

if (-not (Test-Path $ConfigPath)) {
    throw "No se encontró el archivo de configuración: $ConfigPath"
}

$config = Get-Content `
    -Path $ConfigPath `
    -Raw |
    ConvertFrom-Json

if (-not $config.SiteId) {
    throw 'El archivo no contiene SiteId.'
}

if (-not $config.ListId) {
    throw 'El archivo no contiene ListId.'
}

try {
    Write-Host 'Iniciando sesión en Microsoft Graph...' -ForegroundColor Cyan

    if ($UseDeviceAuthentication) {
        Connect-MgGraph `
            -Scopes 'Sites.Manage.All' `
            -ContextScope Process `
            -UseDeviceAuthentication `
            -NoWelcome
    }
    else {
        Connect-MgGraph `
            -Scopes 'Sites.Manage.All' `
            -ContextScope Process `
            -NoWelcome
    }

    $connected = $true

    $siteId = $config.SiteId
    $listId = $config.ListId

    $uri =
        "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/permissions"

    $currentPermissions = Invoke-MgGraphRequest `
        -Method GET `
        -Uri $uri

    $existingPermission = $currentPermissions.value |
        Where-Object {
            $_.grantedToV2.application.id -eq $ApplicationId
        } |
        Select-Object -First 1

    if ($existingPermission) {
        Write-Host ''
        Write-Host 'La aplicación ya tiene permiso sobre esta lista.' -ForegroundColor Green
        Write-Host "Aplicación: $ApplicationDisplayName" -ForegroundColor Green
        Write-Host "Lista: $($config.ListName)" -ForegroundColor Green
        Write-Host "Rol actual: $($existingPermission.roles -join ', ')" -ForegroundColor Green
        Write-Host "Permission ID: $($existingPermission.id)" -ForegroundColor Green
        return
    }

    $body = @{
        grantedToV2 = @{
            application = @{
                id = $ApplicationId
                displayName = $ApplicationDisplayName
            }
        }
        roles = @('write')
    } | ConvertTo-Json -Depth 10

    Write-Host 'Concediendo acceso write exclusivamente a la lista...' -ForegroundColor Cyan

    $permission = Invoke-MgGraphRequest `
        -Method POST `
        -Uri $uri `
        -Body $body `
        -ContentType 'application/json'

    Write-Host ''
    Write-Host 'Permiso concedido correctamente.' -ForegroundColor Green
    Write-Host "Aplicación: $ApplicationDisplayName" -ForegroundColor Green
    Write-Host "Application ID: $ApplicationId" -ForegroundColor Green
    Write-Host "Lista: $($config.ListName)" -ForegroundColor Green
    Write-Host "Rol: $($permission.roles -join ', ')" -ForegroundColor Green
    Write-Host "Permission ID: $($permission.id)" -ForegroundColor Green
}
finally {
    if ($connected) {
        Disconnect-MgGraph `
            -ErrorAction SilentlyContinue `
            -WarningAction SilentlyContinue |
            Out-Null
    }
}
