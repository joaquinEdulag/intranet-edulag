param(
    [Parameter(Mandatory = $true)]
    [string]$TenantHost,

    [Parameter(Mandatory = $true)]
    [string]$SitePath,

    [string]$ListName = 'SolicitudesAutorizacion',

    [string]$OutputPath = '.\sharepoint-solicitudes-config.json',

    [switch]$UseDeviceAuthentication
)

$ErrorActionPreference = 'Stop'
$connected = $false

function New-TextColumn {
    param(
        [string]$Name,
        [string]$DisplayName,
        [int]$MaxLength = 255,
        [bool]$Required = $false,
        [bool]$Indexed = $false,
        [bool]$Unique = $false,
        [string]$Description = ''
    )

    return @{
        name = $Name
        displayName = $DisplayName
        description = $Description
        required = $Required
        indexed = $Indexed
        enforceUniqueValues = $Unique
        text = @{
            allowMultipleLines = $false
            appendChangesToExistingText = $false
            linesForEditing = 0
            maxLength = $MaxLength
            textType = 'plain'
        }
    }
}

function New-MultilineTextColumn {
    param(
        [string]$Name,
        [string]$DisplayName,
        [bool]$Required = $false,
        [int]$Lines = 6,
        [string]$Description = ''
    )

    return @{
        name = $Name
        displayName = $DisplayName
        description = $Description
        required = $Required
        indexed = $false
        enforceUniqueValues = $false
        text = @{
            allowMultipleLines = $true
            appendChangesToExistingText = $false
            linesForEditing = $Lines
            textType = 'plain'
        }
    }
}

function New-NumberColumn {
    param(
        [string]$Name,
        [string]$DisplayName,
        [ValidateSet('none', 'two')]
        [string]$DecimalPlaces = 'none',
        [bool]$Required = $false,
        [bool]$Indexed = $false,
        [bool]$Unique = $false,
        [Nullable[double]]$Minimum = $null,
        [string]$DefaultValue = $null,
        [string]$Description = ''
    )

    $column = @{
        name = $Name
        displayName = $DisplayName
        description = $Description
        required = $Required
        indexed = $Indexed
        enforceUniqueValues = $Unique
        number = @{
            decimalPlaces = $DecimalPlaces
            displayAs = 'number'
        }
    }

    if ($null -ne $Minimum) {
        $column.number.minimum = $Minimum.Value
    }

    if ($null -ne $DefaultValue) {
        $column.defaultValue = @{ value = $DefaultValue }
    }

    return $column
}

function New-DateColumn {
    param(
        [string]$Name,
        [string]$DisplayName,
        [ValidateSet('dateOnly', 'dateTime')]
        [string]$Format = 'dateTime',
        [bool]$Required = $false,
        [bool]$Indexed = $false,
        [string]$Description = ''
    )

    return @{
        name = $Name
        displayName = $DisplayName
        description = $Description
        required = $Required
        indexed = $Indexed
        enforceUniqueValues = $false
        dateTime = @{
            format = $Format
            displayAs = 'standard'
        }
    }
}

function New-ChoiceColumn {
    param(
        [string]$Name,
        [string]$DisplayName,
        [string[]]$Choices,
        [string]$DefaultValue,
        [bool]$Required = $true,
        [bool]$Indexed = $false,
        [string]$Description = ''
    )

    return @{
        name = $Name
        displayName = $DisplayName
        description = $Description
        required = $Required
        indexed = $Indexed
        enforceUniqueValues = $false
        defaultValue = @{ value = $DefaultValue }
        choice = @{
            allowTextEntry = $false
            displayAs = 'dropDownMenu'
            choices = $Choices
        }
    }
}

function New-BooleanColumn {
    param(
        [string]$Name,
        [string]$DisplayName,
        [bool]$Default = $false,
        [bool]$Indexed = $false,
        [string]$Description = ''
    )

    return @{
        name = $Name
        displayName = $DisplayName
        description = $Description
        required = $true
        indexed = $Indexed
        enforceUniqueValues = $false
        defaultValue = @{ value = $(if ($Default) { '1' } else { '0' }) }
        boolean = @{}
    }
}

if (-not (Get-Command Connect-MgGraph -ErrorAction SilentlyContinue)) {
    throw @'
No se encontró Microsoft Graph PowerShell.
Instálalo con:

Install-Module Microsoft.Graph.Authentication -Scope CurrentUser -Repository PSGallery -Force
'@
}

$columns = @(
    (New-NumberColumn -Name 'SolicitudId' -DisplayName 'ID de solicitud' -Required $true -Indexed $true -Unique $true -Minimum 1 -Description 'ID de solicitudes.id en Supabase.'),
    (New-TextColumn -Name 'TipoClave' -DisplayName 'Clave del tipo' -MaxLength 40 -Required $true -Indexed $true),
    (New-TextColumn -Name 'TipoNombre' -DisplayName 'Tipo de solicitud' -MaxLength 80 -Required $true),
    (New-ChoiceColumn -Name 'EstadoGeneral' -DisplayName 'Estado general' -DefaultValue 'PENDIENTE_JEFE' -Indexed $true -Choices @(
        'PENDIENTE_JEFE',
        'PENDIENTE_RH',
        'CERRADA_APROBADA',
        'CERRADA_RECHAZADA',
        'CANCELADA',
        'ERROR'
    )),
    (New-DateColumn -Name 'FechaSolicitud' -DisplayName 'Fecha de solicitud' -Format 'dateTime' -Required $true -Indexed $true),

    (New-NumberColumn -Name 'SolicitanteId' -DisplayName 'ID del solicitante' -Required $true -Minimum 1),
    (New-TextColumn -Name 'NumeroEmpleado' -DisplayName 'Número de empleado' -MaxLength 20),
    (New-TextColumn -Name 'SolicitanteNombre' -DisplayName 'Solicitante' -MaxLength 255 -Required $true),
    (New-TextColumn -Name 'SolicitanteCorreo' -DisplayName 'Correo del solicitante' -MaxLength 255 -Required $true -Indexed $true),
    (New-NumberColumn -Name 'AreaId' -DisplayName 'ID del área' -Required $true -Minimum 1),
    (New-TextColumn -Name 'AreaNombre' -DisplayName 'Área' -MaxLength 80 -Required $true),
    (New-NumberColumn -Name 'TurnoId' -DisplayName 'ID del turno' -Required $true -Minimum 1),
    (New-TextColumn -Name 'TurnoNombre' -DisplayName 'Turno' -MaxLength 50 -Required $true),

    (New-DateColumn -Name 'FechaEvento' -DisplayName 'Fecha solicitada' -Format 'dateOnly'),
    (New-DateColumn -Name 'FechaInicio' -DisplayName 'Fecha de inicio' -Format 'dateOnly'),
    (New-DateColumn -Name 'FechaFin' -DisplayName 'Fecha de fin' -Format 'dateOnly'),
    (New-DateColumn -Name 'FechaHoraInicio' -DisplayName 'Fecha y hora de inicio' -Format 'dateTime'),
    (New-DateColumn -Name 'FechaHoraFin' -DisplayName 'Fecha y hora de fin' -Format 'dateTime'),
    (New-TextColumn -Name 'HoraSolicitada' -DisplayName 'Hora solicitada' -MaxLength 20),
    (New-NumberColumn -Name 'MinutosSolicitados' -DisplayName 'Minutos solicitados' -Minimum 1),
    (New-NumberColumn -Name 'DiasSolicitados' -DisplayName 'Días solicitados' -DecimalPlaces 'two' -Minimum 0.01),
    (New-MultilineTextColumn -Name 'Motivo' -DisplayName 'Motivo' -Lines 6),
    (New-MultilineTextColumn -Name 'Observaciones' -DisplayName 'Observaciones' -Lines 6),
    (New-MultilineTextColumn -Name 'DetalleJson' -DisplayName 'Detalle técnico JSON' -Lines 10 -Description 'Copia serializada de los campos particulares del tipo de solicitud.'),

    (New-NumberColumn -Name 'ResponsableId' -DisplayName 'ID del responsable' -Required $true -Minimum 1),
    (New-TextColumn -Name 'ResponsableNombre' -DisplayName 'Responsable' -MaxLength 255 -Required $true),
    (New-TextColumn -Name 'ResponsableCorreo' -DisplayName 'Correo del responsable' -MaxLength 255 -Required $true -Indexed $true),
    (New-TextColumn -Name 'CargoResponsable' -DisplayName 'Cargo del responsable' -MaxLength 80),

    (New-TextColumn -Name 'CodigoFormato' -DisplayName 'Código del formato' -MaxLength 50 -Required $true),
    (New-NumberColumn -Name 'NumeroRevision' -DisplayName 'Número de revisión' -Required $true -Minimum 1),
    (New-DateColumn -Name 'FechaRevisionFormato' -DisplayName 'Fecha de revisión del formato' -Format 'dateOnly' -Required $true),

    (New-ChoiceColumn -Name 'ResultadoJefe' -DisplayName 'Resultado del encargado' -DefaultValue 'PENDIENTE' -Choices @(
        'PENDIENTE',
        'APROBADA',
        'RECHAZADA'
    )),
    (New-MultilineTextColumn -Name 'ComentarioJefe' -DisplayName 'Comentario del encargado' -Lines 6),
    (New-DateColumn -Name 'FechaRespuestaJefe' -DisplayName 'Fecha de respuesta del encargado' -Format 'dateTime'),
    (New-TextColumn -Name 'AprobacionMicrosoftId' -DisplayName 'ID de aprobación de Microsoft' -MaxLength 255 -Indexed $true),

    (New-ChoiceColumn -Name 'EstadoRH' -DisplayName 'Estado de RH' -DefaultValue 'NO_APLICA' -Indexed $true -Choices @(
        'NO_APLICA',
        'PENDIENTE',
        'ENTERADO'
    )),
    (New-MultilineTextColumn -Name 'ComentarioRH' -DisplayName 'Comentario de RH' -Lines 6),
    (New-TextColumn -Name 'CorreoRH' -DisplayName 'Correo de RH' -MaxLength 255),
    (New-DateColumn -Name 'FechaEnteradoRH' -DisplayName 'Fecha de enterado de RH' -Format 'dateTime'),

    (New-BooleanColumn -Name 'NotificacionCierreEnviada' -DisplayName 'Notificación de cierre enviada'),
    (New-BooleanColumn -Name 'PendienteSincronizarSupabase' -DisplayName 'Pendiente de sincronizar con Supabase' -Indexed $true),
    (New-DateColumn -Name 'UltimaSincronizacionSupabase' -DisplayName 'Última sincronización con Supabase' -Format 'dateTime'),
    (New-MultilineTextColumn -Name 'ErrorIntegracion' -DisplayName 'Error de integración' -Lines 8),
    (New-NumberColumn -Name 'VersionIntegracion' -DisplayName 'Versión de integración' -Required $true -Minimum 1 -DefaultValue '1'),
    (New-ChoiceColumn -Name 'OrigenRegistro' -DisplayName 'Origen del registro' -DefaultValue 'INTRANET' -Choices @(
        'INTRANET',
        'POWER_APPS',
        'SISTEMA'
    ))
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

    if ([string]::IsNullOrWhiteSpace($normalizedHost)) {
        throw 'TenantHost no puede estar vacío.'
    }

    if ([string]::IsNullOrWhiteSpace($normalizedPath)) {
        throw 'SitePath no puede estar vacío.'
    }

    $siteUri =
        "https://graph.microsoft.com/v1.0/sites/${normalizedHost}:/sites/${normalizedPath}"

    Write-Host 'Buscando el sitio de SharePoint...' -ForegroundColor Cyan

    $site = Invoke-MgGraphRequest `
        -Method GET `
        -Uri $siteUri

    $siteId = $site.id

    if (-not $siteId) {
        throw 'Microsoft Graph no devolvió el identificador del sitio.'
    }

    Write-Host "SITE_ID: $siteId" -ForegroundColor Green

    $listsUri =
        "https://graph.microsoft.com/v1.0/sites/$siteId/lists?`$select=id,displayName,webUrl"

    $lists = Invoke-MgGraphRequest `
        -Method GET `
        -Uri $listsUri

    $list = $lists.value |
        Where-Object {
            $_.displayName -eq $ListName
        } |
        Select-Object -First 1

    if (-not $list) {
        Write-Host "Creando la lista $ListName..." -ForegroundColor Cyan

        $createListBody = @{
            displayName = $ListName
            description =
                'Puente de solicitudes entre Supabase, Power Automate, Approvals y Power Apps.'
            list = @{
                template = 'genericList'
            }
        } | ConvertTo-Json -Depth 10

        $list = Invoke-MgGraphRequest `
            -Method POST `
            -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/lists" `
            -Body $createListBody `
            -ContentType 'application/json'

        Write-Host 'Lista creada.' -ForegroundColor Green
    }
    else {
        Write-Host 'La lista ya existe; se agregarán únicamente columnas faltantes.' -ForegroundColor Yellow
    }

    $listId = $list.id

    if (-not $listId) {
        throw 'Microsoft Graph no devolvió el LIST_ID.'
    }

    $columnsUri =
        "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/columns"

    $currentColumns = Invoke-MgGraphRequest `
        -Method GET `
        -Uri $columnsUri

    $titleColumn = $currentColumns.value |
        Where-Object {
            $_.name -eq 'Title'
        } |
        Select-Object -First 1

    if ($titleColumn) {
        $titleBody = @{
            displayName = 'Folio'
            description = 'Folio único generado por Supabase.'
            required = $true
            indexed = $true
            enforceUniqueValues = $true
        } | ConvertTo-Json -Depth 10

        Invoke-MgGraphRequest `
            -Method PATCH `
            -Uri "$columnsUri/$($titleColumn.id)" `
            -Body $titleBody `
            -ContentType 'application/json' |
            Out-Null

        Write-Host 'La columna Title fue configurada como Folio.' -ForegroundColor Green
    }

    $existingColumns = @{}

    foreach ($currentColumn in $currentColumns.value) {
        $existingColumns[$currentColumn.name.ToLowerInvariant()] = $currentColumn
    }

    $createdCount = 0
    $skippedCount = 0

    foreach ($column in $columns) {
        $key = $column.name.ToLowerInvariant()
        $createdColumn = $null
        $columnType = @(
            'text',
            'number',
            'choice',
            'boolean',
            'dateTime'
        ) | Where-Object {
            $column.ContainsKey($_)
        } | Select-Object -First 1

        if (-not $columnType) {
            throw "No se pudo determinar el tipo de la columna $($column.name)."
        }

        if ($existingColumns.ContainsKey($key)) {
            $createdColumn = $existingColumns[$key]
            Write-Host "Configurando columna existente: $($column.name)..." -ForegroundColor DarkYellow
            $skippedCount++
        }
        else {
            Write-Host "Creando columna: $($column.name)..." -ForegroundColor Cyan

            # SharePoint puede rechazar una columna si se intenta crear el tipo,
            # el índice, la unicidad y la obligatoriedad en una sola petición.
            # Primero se crea únicamente el tipo y luego se configuran las demás
            # propiedades mediante PATCH independientes.
            $createDefinition = @{
                name = $column.name
                hidden = $false
            }

            # Las características del tipo se establecen únicamente durante
            # la creación. En este tenant, Graph rechaza minimum, displayAs y
            # decimalPlaces al crear campos numéricos; el tipo estándar sigue
            # almacenando enteros y decimales y Supabase valida sus rangos.
            if ($columnType -eq 'number') {
                $createDefinition[$columnType] = @{}
            }
            else {
                $createDefinition[$columnType] = $column[$columnType]
            }
            $createBody = $createDefinition | ConvertTo-Json -Depth 20

            $createdColumn = Invoke-MgGraphRequest `
                -Method POST `
                -Uri $columnsUri `
                -Body $createBody `
                -ContentType 'application/json'

            if (-not $createdColumn.id) {
                throw "La columna $($column.name) no devolvió un identificador."
            }

            $existingColumns[$key] = $createdColumn
            $createdCount++
        }

        if (-not $createdColumn.id) {
            throw "La columna $($column.name) no tiene un identificador para configurarla."
        }

        $columnUri = "$columnsUri/$($createdColumn.id)"

        # Propiedades visuales y descripción.
        $metadataDefinition = @{
            displayName = $column.displayName
            description = $column.description
            hidden = $false
        } | ConvertTo-Json -Depth 10

        Invoke-MgGraphRequest `
            -Method PATCH `
            -Uri $columnUri `
            -Body $metadataDefinition `
            -ContentType 'application/json' |
            Out-Null

        # El valor inicial se configura antes de volver obligatoria la columna.
        if ($column.ContainsKey('defaultValue')) {
            $defaultDefinition = @{
                defaultValue = $column.defaultValue
            } | ConvertTo-Json -Depth 10

            Invoke-MgGraphRequest `
                -Method PATCH `
                -Uri $columnUri `
                -Body $defaultDefinition `
                -ContentType 'application/json' |
                Out-Null
        }

        if ($column.required) {
            $requiredDefinition = @{
                required = $true
            } | ConvertTo-Json -Depth 10

            Invoke-MgGraphRequest `
                -Method PATCH `
                -Uri $columnUri `
                -Body $requiredDefinition `
                -ContentType 'application/json' |
                Out-Null
        }

        # SharePoint requiere un índice antes de activar valores únicos.
        if ($column.indexed -or $column.enforceUniqueValues) {
            $indexedDefinition = @{
                indexed = $true
            } | ConvertTo-Json -Depth 10

            Invoke-MgGraphRequest `
                -Method PATCH `
                -Uri $columnUri `
                -Body $indexedDefinition `
                -ContentType 'application/json' |
                Out-Null
        }

        if ($column.enforceUniqueValues) {
            $uniqueDefinition = @{
                enforceUniqueValues = $true
            } | ConvertTo-Json -Depth 10

            Invoke-MgGraphRequest `
                -Method PATCH `
                -Uri $columnUri `
                -Body $uniqueDefinition `
                -ContentType 'application/json' |
                Out-Null
        }
    }

    $finalColumns = Invoke-MgGraphRequest `
        -Method GET `
        -Uri $columnsUri

    $finalNames = @{}

    foreach ($finalColumn in $finalColumns.value) {
        $finalNames[$finalColumn.name.ToLowerInvariant()] = $true
    }

    $missingColumns = @(
        $columns |
            Where-Object {
                -not $finalNames.ContainsKey($_.name.ToLowerInvariant())
            } |
            ForEach-Object {
                $_.name
            }
    )

    if ($missingColumns.Count -gt 0) {
        throw "Faltan columnas después de la creación: $($missingColumns -join ', ')"
    }

    $result = [ordered]@{
        TenantHost = $normalizedHost
        SitePath = "sites/$normalizedPath"
        SiteId = $siteId
        ListName = $ListName
        ListId = $listId
        ListUrl = $list.webUrl
        CustomColumnsExpected = $columns.Count
        CustomColumnsCreatedNow = $createdCount
        CustomColumnsAlreadyPresent = $skippedCount
        TitleInternalName = 'Title'
        TitleDisplayName = 'Folio'
        GeneratedAtUtc = [DateTime]::UtcNow.ToString('o')
    }

    $outputDirectory = Split-Path -Parent $OutputPath

    if ($outputDirectory -and -not (Test-Path $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force |
            Out-Null
    }

    $result |
        ConvertTo-Json -Depth 10 |
        Set-Content -Path $OutputPath -Encoding utf8

    Write-Host ''
    Write-Host 'Configuración terminada correctamente.' -ForegroundColor Green
    Write-Host "SITE_ID: $siteId" -ForegroundColor Green
    Write-Host "LIST_ID: $listId" -ForegroundColor Green
    Write-Host "URL: $($list.webUrl)" -ForegroundColor Green
    Write-Host "Columnas personalizadas esperadas: $($columns.Count)" -ForegroundColor Green
    Write-Host "Columnas creadas ahora: $createdCount" -ForegroundColor Green
    Write-Host "Columnas que ya existían: $skippedCount" -ForegroundColor Green
    Write-Host "Resultado guardado en: $OutputPath" -ForegroundColor Green
}
finally {
    if ($connected) {
        Disconnect-MgGraph `
            -ErrorAction SilentlyContinue `
            -WarningAction SilentlyContinue |
            Out-Null
    }
}
