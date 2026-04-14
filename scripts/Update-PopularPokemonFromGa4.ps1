param(
    [string]$PropertyId = $env:GA4_PROPERTY_ID,
    [string]$AccessToken = $env:GA4_ACCESS_TOKEN,
    [int]$Days = 7,
    [int]$TopN = 100,
    [string]$SiteBasePath = "/PokeGraph",
    [string]$OutputPath = "data/popular-pokemon.json",
    [switch]$SyncDocsAndDist
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($PropertyId)) {
    throw "GA4 property ID is required. Set -PropertyId or GA4_PROPERTY_ID."
}

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
    throw "GA4 access token is required. Set -AccessToken or GA4_ACCESS_TOKEN."
}

if ($Days -lt 1) {
    throw "-Days must be 1 or greater."
}

if ($TopN -lt 1) {
    throw "-TopN must be 1 or greater."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$primaryOutputFile = Join-Path $repoRoot $OutputPath
$primaryOutputDir = Split-Path -Parent $primaryOutputFile

if (-not (Test-Path -LiteralPath $primaryOutputDir)) {
    New-Item -ItemType Directory -Path $primaryOutputDir -Force | Out-Null
}

$normalizedBasePath = if ([string]::IsNullOrWhiteSpace($SiteBasePath)) {
    ""
} else {
    "/" + $SiteBasePath.Trim().Trim("/") 
}

$requestBody = @{
    dateRanges = @(
        @{
            startDate = "$($Days)daysAgo"
            endDate = "today"
        }
    )
    dimensions = @(
        @{ name = "pagePath" }
    )
    metrics = @(
        @{ name = "screenPageViews" }
    )
    orderBys = @(
        @{
            metric = @{ metricName = "screenPageViews" }
            desc = $true
        }
    )
    limit = 1000
} | ConvertTo-Json -Depth 10

$headers = @{
    Authorization = "Bearer $AccessToken"
    "Content-Type" = "application/json"
}

$endpoint = "https://analyticsdata.googleapis.com/v1beta/properties/$PropertyId`:runReport"
$response = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $requestBody
$rows = @($response.rows)
$orderedKeys = New-Object System.Collections.Generic.List[string]
$seenKeys = New-Object System.Collections.Generic.HashSet[string]

foreach ($row in $rows) {
    $pagePath = [string]$row.dimensionValues[0].value
    $pokemonKey = $null

    if ($normalizedBasePath -and $pagePath -match "^$([regex]::Escape($normalizedBasePath))/pokemon/(?<key>[^/]+)/?$") {
        $pokemonKey = $Matches["key"]
    } elseif ($pagePath -match "^/pokemon/(?<key>[^/]+)/?$") {
        $pokemonKey = $Matches["key"]
    }

    if ([string]::IsNullOrWhiteSpace($pokemonKey)) {
        continue
    }

    if ($seenKeys.Add($pokemonKey)) {
        $orderedKeys.Add($pokemonKey)
    }

    if ($orderedKeys.Count -ge $TopN) {
        break
    }
}

$popularData = @{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    source = "ga4-data-api"
    propertyId = $PropertyId
    days = $Days
    limit = $TopN
    pokemonKeys = @($orderedKeys)
}

$json = $popularData | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($primaryOutputFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Updated $OutputPath with $($orderedKeys.Count) pokemon keys."

if ($SyncDocsAndDist) {
    $mirrorTargets = @(
        "docs/data/popular-pokemon.json",
        "dist/data/popular-pokemon.json"
    )

    foreach ($target in $mirrorTargets) {
        $targetPath = Join-Path $repoRoot $target
        $targetDir = Split-Path -Parent $targetPath

        if (-not (Test-Path -LiteralPath $targetDir)) {
            continue
        }

        [System.IO.File]::WriteAllText($targetPath, $json, [System.Text.UTF8Encoding]::new($false))
        Write-Output "Synced $target."
    }
}
