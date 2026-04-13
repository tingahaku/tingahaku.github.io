param(
    [string]$SourcePath = '',
    [string]$TargetPath = 'data/csv/Pokemon.csv'
)

$ErrorActionPreference = 'Stop'

function Read-Cell {
    param($Value)
    if ($null -eq $Value) { return '' }
    return ([string]$Value).Trim()
}

function Parse-Header {
    param([string]$HeaderText)
    $text = Read-Cell $HeaderText
    if ($text -match '^No\.(\d+)(.+)$') {
        return @{
            no = [int]$matches[1]
            name = $matches[2].Trim()
        }
    }
    return @{
        no = $null
        name = $text
    }
}

function Parse-Stats {
    param([string]$Value)
    $m = [regex]::Matches((Read-Cell $Value), '\d+')
    $numbers = @($m | ForEach-Object { [int]$_.Value })
    if ($numbers.Count -lt 6) {
        return @{ hp=''; atk=''; def=''; spa=''; spd=''; spe='' }
    }
    return @{
        hp = $numbers[0]
        atk = $numbers[1]
        def = $numbers[2]
        spa = $numbers[3]
        spd = $numbers[4]
        spe = $numbers[5]
    }
}

function Read-BoolFromCircle {
    param($Value)
    $text = (Read-Cell $Value).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($text)) { return $false }
    $markA = [string][char]0x3007
    $markB = [string][char]0x25CB
    return @($markA, $markB, 'o', 'yes', 'true', '1', 'on') -contains $text
}

function Is-NumberOrDash {
    param([string]$Text)
    $v = Read-Cell $Text
    if ($v -eq '-') { return $true }
    return $v -match '^\d+(\.\d+)?$'
}

function Parse-MoveNames {
    param([string]$Value)
    $raw = Read-Cell $Value
    if ([string]::IsNullOrWhiteSpace($raw)) { return '' }

    function Normalize-MoveName {
        param([string]$Text)
        $normalized = Read-Cell $Text
        $normalized = $normalized.Replace('*', '')
        $normalized = $normalized.Replace([string][char]0x2605, '')
        $normalized = $normalized.Replace([string][char]0x2606, '')
        $normalized = $normalized.Replace([string][char]0x2B50, '')
        $normalized = $normalized.Replace([string][char]0xFE0E, '')
        $normalized = $normalized.Replace([string][char]0xFE0F, '')
        return $normalized.Trim()
    }

    $tokens = @(
        $raw -split "(\r\n|\n|\r)" |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -ne '' }
    )

    $moves = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -le $tokens.Count - 7; $i++) {
        $nameToken = $tokens[$i]
        $label1 = $tokens[$i + 1]
        $value1 = $tokens[$i + 2]
        $label2 = $tokens[$i + 3]
        $value2 = $tokens[$i + 4]
        $label3 = $tokens[$i + 5]
        $value3 = $tokens[$i + 6]

        if (
            -not [string]::IsNullOrWhiteSpace($nameToken) -and
            -not (Is-NumberOrDash $nameToken) -and
            -not (Is-NumberOrDash $label1) -and
            (Is-NumberOrDash $value1) -and
            -not (Is-NumberOrDash $label2) -and
            (Is-NumberOrDash $value2) -and
            ($label3 -eq 'PP') -and
            (Is-NumberOrDash $value3)
        ) {
            $moveName = Normalize-MoveName $nameToken
            if (-not [string]::IsNullOrWhiteSpace($moveName)) {
                [void]$moves.Add($moveName)
            }
        }
    }

    if ($moves.Count -eq 0) {
        $fallback = @(
            $raw -split '[、,／/\s]+' |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -ne '' }
        )
        foreach ($item in $fallback) {
            $moveName = Normalize-MoveName $item
            if (-not (Is-NumberOrDash $item) -and $item -ne 'PP' -and -not [string]::IsNullOrWhiteSpace($moveName)) {
                [void]$moves.Add($moveName)
            }
        }
    }

    $distinct = @($moves | Select-Object -Unique)
    return ($distinct -join '|')
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceFullPath = ''
if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $txtDir = Join-Path $repoRoot 'txt'
    $candidate = Get-ChildItem -LiteralPath $txtDir -Filter '*.csv' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($null -eq $candidate) {
        throw "No CSV found in: $txtDir"
    }
    $sourceFullPath = $candidate.FullName
} else {
    if ([System.IO.Path]::IsPathRooted($SourcePath)) {
        $sourceFullPath = $SourcePath
    } else {
        $sourceFullPath = Join-Path $repoRoot $SourcePath
    }
}
$targetFullPath = Join-Path $repoRoot $TargetPath

if (-not (Test-Path $sourceFullPath)) { throw "Source not found: $sourceFullPath" }

$rows = Import-Csv -LiteralPath $sourceFullPath -Encoding UTF8
if (-not $rows -or $rows.Count -lt 8) {
    throw 'Matrix CSV must contain at least 8 rows.'
}

$headers = @($rows[0].PSObject.Properties.Name)
$nameHeader = $headers[0]
$pokemonColumns = @($headers | Where-Object { $_ -ne $nameHeader })

$type1Row = $rows[0]
$type2Row = $rows[1]
$ability1Row = $rows[2]
$ability2Row = $rows[3]
$ability3Row = $rows[4]
$evioliteRow = $rows[5]
$statsRow = $rows[6]
$movesRow = $rows[7]

$existingRows = @()
if (Test-Path $targetFullPath) {
    $existingRows = @(Import-Csv -LiteralPath $targetFullPath -Encoding UTF8)
    $existingRows = @(
        $existingRows |
        Where-Object {
            $n = Read-Cell $_.name
            $noText = Read-Cell $_.no
            $imageKeyText = Read-Cell $_.imageKey
            ($n -ne '') -and
            ($noText -match '^\d+$') -and
            ($imageKeyText -match '^\d+$')
        }
    )
}

$existingByName = @{}
foreach ($row in $existingRows) {
    $existingByName[[string]$row.name] = $row
}

$numberCounters = @{}
$convertedByName = @{}

foreach ($column in $pokemonColumns) {
    $header = Parse-Header $column
    $name = [string]$header.name
    if ([string]::IsNullOrWhiteSpace($name)) { continue }

    $no = $header.no
    if ($null -eq $no) { continue }
    $type1 = Read-Cell $type1Row.$column
    $type2 = Read-Cell $type2Row.$column
    $ability1 = Read-Cell $ability1Row.$column
    $ability2 = Read-Cell $ability2Row.$column
    $ability3 = Read-Cell $ability3Row.$column
    $stats = Parse-Stats ([string]$statsRow.$column)
    $moves = Parse-MoveNames ([string]$movesRow.$column)
    $eviolite = Read-BoolFromCircle $evioliteRow.$column
    $evioliteText = if ($eviolite) { 'true' } else { 'false' }

    $existing = $existingByName[$name]

    if ($null -ne $no) {
        $counterKey = [string]$no
        if (-not $numberCounters.ContainsKey($counterKey)) {
            $numberCounters[$counterKey] = 0
        }
        $numberCounters[$counterKey] = [int]$numberCounters[$counterKey] + 1
    }

    $generatedKey = if ($null -ne $no) {
        $countForNo = [int]$numberCounters[[string]$no]
        $suffix = if ($countForNo -gt 1) { "-$countForNo" } else { '' }
        ('p{0:d4}{1}' -f $no, $suffix)
    } else {
        ('p-{0}' -f ([guid]::NewGuid().ToString('N').Substring(0, 8)))
    }

    $finalKey = if ($null -ne $existing -and -not [string]::IsNullOrWhiteSpace([string]$existing.key)) { [string]$existing.key } else { $generatedKey }
    $finalNo = if ($null -ne $existing -and -not [string]::IsNullOrWhiteSpace([string]$existing.no)) { [int]$existing.no } else { $no }
    $finalImageKey = if ($null -ne $existing -and -not [string]::IsNullOrWhiteSpace([string]$existing.imageKey)) {
        [string]$existing.imageKey
    } elseif ($null -ne $no) {
        ('{0:d4}' -f $no)
    } else {
        ''
    }

    $types = (@($type1, $type2) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join '|'
    $abilities = (@($ability1, $ability2, $ability3) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join '|'

    $convertedByName[$name] = [pscustomobject]@{
        key = $finalKey
        imageKey = $finalImageKey
        no = $finalNo
        name = $name
        types = $types
        abilities = $abilities
        hp = $stats.hp
        atk = $stats.atk
        def = $stats.def
        spa = $stats.spa
        spd = $stats.spd
        spe = $stats.spe
        evioliteEligible = $evioliteText
        point = if ($null -ne $existing) { [string]$existing.point } else { '' }
        synergyName = if ($null -ne $existing) { [string]$existing.synergyName } else { '' }
        syn_physicalAttacker = if ($null -ne $existing) { [string]$existing.syn_physicalAttacker } else { '' }
        syn_specialAttacker = if ($null -ne $existing) { [string]$existing.syn_specialAttacker } else { '' }
        syn_physicalSweeper = if ($null -ne $existing) { [string]$existing.syn_physicalSweeper } else { '' }
        syn_specialSweeper = if ($null -ne $existing) { [string]$existing.syn_specialSweeper } else { '' }
        syn_physicalWall = if ($null -ne $existing) { [string]$existing.syn_physicalWall } else { '' }
        syn_specialWall = if ($null -ne $existing) { [string]$existing.syn_specialWall } else { '' }
        syn_setup = if ($null -ne $existing) { [string]$existing.syn_setup } else { '' }
        moves = if (-not [string]::IsNullOrWhiteSpace($moves)) { $moves } elseif ($null -ne $existing) { [string]$existing.moves } else { '' }
    }
}

$merged = New-Object System.Collections.Generic.List[object]
foreach ($row in $existingRows) {
    $name = [string]$row.name
    if ($convertedByName.ContainsKey($name)) {
        [void]$merged.Add($convertedByName[$name])
        [void]$convertedByName.Remove($name)
    } else {
        [void]$merged.Add($row)
    }
}
foreach ($item in $convertedByName.Values) {
    [void]$merged.Add($item)
}

$ordered = @(
    $merged |
    Sort-Object @{ Expression = { if ([string]::IsNullOrWhiteSpace([string]$_.no)) { 999999 } else { [int]$_.no } } }, @{ Expression = { [string]$_.name } }
)

$ordered = @(
    $ordered |
    Where-Object {
        $n = Read-Cell $_.name
        $noText = Read-Cell $_.no
        $imageKeyText = Read-Cell $_.imageKey
        ($n -ne '') -and
        ($noText -match '^\d+$') -and
        ($imageKeyText -match '^\d+$')
    }
)

$dir = Split-Path -Parent $targetFullPath
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

$ordered | Export-Csv -LiteralPath $targetFullPath -NoTypeInformation -Encoding UTF8

$cleanupRows = @(Import-Csv -LiteralPath $targetFullPath -Encoding UTF8)
$cleanupRows = @(
    $cleanupRows |
    Where-Object {
        $n = Read-Cell $_.name
        $noText = Read-Cell $_.no
        $imageKeyText = Read-Cell $_.imageKey
        ($n -ne '') -and
        ($noText -match '^\d+$') -and
        ($imageKeyText -match '^\d+$')
    }
)
$cleanupRows | Export-Csv -LiteralPath $targetFullPath -NoTypeInformation -Encoding UTF8

Write-Output "Imported matrix CSV: $sourceFullPath"
Write-Output "Updated Pokemon CSV : $targetFullPath"
Write-Output "Pokemon count       : $($cleanupRows.Count)"
