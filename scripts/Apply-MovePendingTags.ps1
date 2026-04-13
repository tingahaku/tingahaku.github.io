param(
    [string]$MoveCsvPath = "data/csv/Move.csv",
    [string]$PendingCsvPath = "data/csv/MovePendingTags.csv"
)

$ErrorActionPreference = "Stop"

function Read-TagList {
    param($Value)

    if ($null -eq $Value) { return @() }
    return @(([string]$Value -split "\|") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$moveCsvFullPath = Join-Path $repoRoot $MoveCsvPath
$pendingCsvFullPath = Join-Path $repoRoot $PendingCsvPath

if (-not (Test-Path -LiteralPath $moveCsvFullPath)) {
    throw "Move.csv が見つかりません: $moveCsvFullPath"
}

if (-not (Test-Path -LiteralPath $pendingCsvFullPath)) {
    Write-Output "Pending tag file not found. Skip: $pendingCsvFullPath"
    exit 0
}

$moveRows = @(Import-Csv -LiteralPath $moveCsvFullPath -Encoding UTF8)
$pendingRows = @(
    Import-Csv -LiteralPath $pendingCsvFullPath -Encoding UTF8 |
    Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.name) -and -not [string]::IsNullOrWhiteSpace([string]$_.tags) }
)

$pendingByName = @{}
foreach ($row in $pendingRows) {
    $name = ([string]$row.name).Trim()
    $tags = Read-TagList $row.tags

    if (-not $pendingByName.ContainsKey($name)) {
        $pendingByName[$name] = New-Object System.Collections.Generic.List[string]
    }

    foreach ($tag in $tags) {
        if (-not $pendingByName[$name].Contains($tag)) {
            $pendingByName[$name].Add($tag) | Out-Null
        }
    }
}

$matchedNameSet = @{}
$updatedMoveCount = 0
$hasChanges = $false

foreach ($move in $moveRows) {
    $name = ([string]$move.name).Trim()
    if (-not $pendingByName.ContainsKey($name)) {
        continue
    }

    $matchedNameSet[$name] = $true

    $currentTags = New-Object System.Collections.Generic.List[string]
    foreach ($tag in (Read-TagList $move.tags)) {
        if (-not $currentTags.Contains($tag)) {
            $currentTags.Add($tag) | Out-Null
        }
    }

    $updated = $false
    foreach ($tag in $pendingByName[$name]) {
        if (-not $currentTags.Contains($tag)) {
            $currentTags.Add($tag) | Out-Null
            $updated = $true
        }
    }

    if ($updated) {
        $move.tags = [string]::Join("|", @($currentTags))
        $updatedMoveCount += 1
        $hasChanges = $true
    }
}

if ($hasChanges) {
    $moveRows | Export-Csv -LiteralPath $moveCsvFullPath -NoTypeInformation -Encoding UTF8
}

$unmatchedNames = @($pendingByName.Keys | Where-Object { -not $matchedNameSet.ContainsKey($_) } | Sort-Object)

Write-Output "Applied pending move tags:"
Write-Output " - Pending names : $($pendingByName.Count)"
Write-Output " - Matched names : $($matchedNameSet.Count)"
Write-Output " - Updated moves : $updatedMoveCount"
Write-Output " - Unmatched names: $($unmatchedNames.Count)"

if ($unmatchedNames.Count -gt 0) {
    Write-Output "Unmatched: $([string]::Join(', ', $unmatchedNames))"
}
