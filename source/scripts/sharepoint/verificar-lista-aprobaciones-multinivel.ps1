param(
    [Parameter(Mandatory = $true)]
    [string]$TenantHost,

    [Parameter(Mandatory = $true)]
    [string]$SitePath,

    [string]$ListName = 'SolicitudesAutorizacion',

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

$expectedColumns = @(
    'AltaDireccionId',
    'AltaDireccionNombre',
    'AltaDireccionCorreo',
    'EstadoAltaDireccion',
    'ComentarioAltaDireccion',
    'FechaRespuestaAltaDireccion',
    'AprobacionAltaDireccionMicrosoft',
    'RHId',
    'RHNombre',
    'AprobacionRHMicrosoftId'
)

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
    $normalizedHost = $TenantHost.Trim().ToLowerInvariant()
    $normalizedPath = $SitePath.Trim().Trim('/')

    if ($normalizedPath.StartsWith('sites/')) {
        $normalizedPath = $normalizedPath.Substring(6)
    }

    $site = Invoke-MgGraphRequest `
        -Method GET `
        -Uri "https://graph.microsoft.com/v1.0/sites/${normalizedHost}:/sites/${normalizedPath}"

    $lists = Invoke-MgGraphRequest `
        -Method GET `
        -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists?`$select=id,displayName,webUrl"

    $list = $lists.value |
        Where-Object { $_.displayName -eq $ListName } |
        Select-Object -First 1

    if (-not $list) {
        throw "No se encontró la lista $ListName."
    }

    $columns = Invoke-MgGraphRequest `
        -Method GET `
        -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists/$($list.id)/columns"

    $columnMap = @{}

    foreach ($column in $columns.value) {
        $columnMap[$column.name.ToLowerInvariant()] = $column
    }

    $results = foreach ($columnName in $expectedColumns) {
        $key = $columnName.ToLowerInvariant()
        $column = $columnMap[$key]

        $columnType = $null
        $visibleName = $null

        if ($column) {
            $columnType = @(
                'text',
                'number',
                'choice',
                'boolean',
                'dateTime'
            ) | Where-Object {
                $null -ne $column.$_
            } | Select-Object -First 1

            $visibleName = $column.displayName
        }

        [pscustomobject]@{
            Columna = $columnName
            Existe = [bool]$column
            Tipo = $columnType
            NombreVisible = $visibleName
        }
    }

    Write-Host ''
    $results | Format-Table -AutoSize

    $missingColumns = @(
        $results |
            Where-Object { -not $_.Existe } |
            ForEach-Object { $_.Columna }
    )

    $estadoGeneral = $columnMap['estadogeneral']
    $estadoAltaDireccion = $columnMap['estadoaltadireccion']

    $generalChoices = @($estadoGeneral.choice.choices)
    $altaChoices = @($estadoAltaDireccion.choice.choices)

    $hasPendingAlta =
        $generalChoices -contains 'PENDIENTE_ALTA_DIRECCION'

    $expectedAltaChoices = @(
        'PENDIENTE',
        'APROBADA',
        'RECHAZADA',
        'NO_APLICA'
    )

    $missingAltaChoices = @(
        $expectedAltaChoices |
            Where-Object { $altaChoices -notcontains $_ }
    )

    Write-Host "EstadoGeneral incluye PENDIENTE_ALTA_DIRECCION: $hasPendingAlta"
    Write-Host "Opciones de EstadoAltaDireccion: $($altaChoices -join ', ')"

    if ($missingColumns.Count -gt 0) {
        throw "Faltan columnas: $($missingColumns -join ', ')"
    }

    if (-not $hasPendingAlta) {
        throw 'EstadoGeneral no contiene PENDIENTE_ALTA_DIRECCION.'
    }

    if ($missingAltaChoices.Count -gt 0) {
        throw "Faltan opciones en EstadoAltaDireccion: $($missingAltaChoices -join ', ')"
    }

    Write-Host ''
    Write-Host 'Verificación terminada correctamente.' -ForegroundColor Green
    Write-Host "URL: $($list.webUrl)" -ForegroundColor Green
}
finally {
    if ($connected) {
        Disconnect-MgGraph `
            -ErrorAction SilentlyContinue `
            -WarningAction SilentlyContinue |
            Out-Null
    }
}
