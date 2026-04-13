param(
    [string]$CsvDirectory = "data/csv",
    [string]$PokemonOutput = "data/Pokemon.json",
    [string]$AbilityOutput = "data/Ability.json",
    [string]$MoveOutput = "data/Move.json"
)

$ErrorActionPreference = "Stop"

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "Apply-MovePendingTags.ps1")

function Read-OptionalNumber {
    param($Value)
    if ($null -eq $Value) { return $null }
    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return [double]$text
}

function Read-OptionalInt {
    param($Value)
    if ($null -eq $Value) { return $null }
    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return [int]$text
}

function Read-OptionalBool {
    param($Value)
    if ($null -eq $Value) { return $false }
    $text = ([string]$Value).Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($text)) { return $false }
    return @("true", "1", "yes", "y", "on") -contains $text
}

function Read-List {
    param($Value)
    if ($null -eq $Value) { return @() }
    return @(([string]$Value -split "\|") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
}

function Read-Text {
    param($Value, [string]$Default = "")
    if ($null -eq $Value) { return $Default }
    return [string]$Value
}

function Read-NullableModifier {
    param($Value)
    $number = Read-OptionalNumber $Value
    if ($null -eq $number) { return $null }
    return $number
}

$resolvedCsvDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) $CsvDirectory
$pokemonCsvPath = Join-Path $resolvedCsvDirectory "Pokemon.csv"
$abilityCsvPath = Join-Path $resolvedCsvDirectory "Ability.csv"
$moveCsvPath = Join-Path $resolvedCsvDirectory "Move.csv"

if (-not (Test-Path $pokemonCsvPath)) { throw "Pokemon.csv が見つかりません: $pokemonCsvPath" }
if (-not (Test-Path $abilityCsvPath)) { throw "Ability.csv が見つかりません: $abilityCsvPath" }
if (-not (Test-Path $moveCsvPath)) { throw "Move.csv が見つかりません: $moveCsvPath" }

$pokemonRows = Import-Csv -LiteralPath $pokemonCsvPath -Encoding UTF8
$abilityRows = Import-Csv -LiteralPath $abilityCsvPath -Encoding UTF8
$moveRows = Import-Csv -LiteralPath $moveCsvPath -Encoding UTF8

$pokemonList = @(
    $pokemonRows | ForEach-Object {
        [pscustomobject]@{
            key = ([string]$_.key).Trim()
            imageKey = ([string]$_.imageKey).Trim()
            no = Read-OptionalInt $_.no
            name = ([string]$_.name).Trim()
            abilities = @(Read-List $_.abilities)
            baseStats = [pscustomobject]@{
                hp = Read-OptionalInt $_.hp
                atk = Read-OptionalInt $_.atk
                def = Read-OptionalInt $_.def
                spa = Read-OptionalInt $_.spa
                spd = Read-OptionalInt $_.spd
                spe = Read-OptionalInt $_.spe
            }
            evioliteEligible = Read-OptionalBool $_.evioliteEligible
            point = Read-Text $_.point ""
            synergy = [pscustomobject]@{
                name = Read-Text $_.synergyName ""
                modifiers = [pscustomobject]@{
                    physicalAttacker = Read-NullableModifier $_.syn_physicalAttacker
                    specialAttacker = Read-NullableModifier $_.syn_specialAttacker
                    physicalSweeper = Read-NullableModifier $_.syn_physicalSweeper
                    specialSweeper = Read-NullableModifier $_.syn_specialSweeper
                    physicalWall = Read-NullableModifier $_.syn_physicalWall
                    specialWall = Read-NullableModifier $_.syn_specialWall
                    setup = Read-NullableModifier $_.syn_setup
                }
            }
            types = @(Read-List $_.types)
            moves = @(Read-List $_.moves)
        }
    }
)

$abilityList = @(
    $abilityRows | ForEach-Object {
        [pscustomobject]@{
            name = ([string]$_.name).Trim()
            description = Read-Text $_.description ""
            statModifiers = [pscustomobject]@{
                hp = Read-NullableModifier $_.stat_hp
                atk = Read-NullableModifier $_.stat_atk
                def = Read-NullableModifier $_.stat_def
                spa = Read-NullableModifier $_.stat_spa
                spd = Read-NullableModifier $_.stat_spd
                spe = Read-NullableModifier $_.stat_spe
            }
        }
    }
)

$moveList = @(
    $moveRows | ForEach-Object {
        [pscustomobject]@{
            name = ([string]$_.name).Trim()
            type = ([string]$_.type).Trim()
            category = ([string]$_.category).Trim()
            power = Read-OptionalInt $_.power
            accuracy = Read-OptionalInt $_.accuracy
            description = Read-Text $_.description ""
            tags = @(Read-List $_.tags)
        }
    }
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$pokemonOutputPath = Join-Path $repoRoot $PokemonOutput
$abilityOutputPath = Join-Path $repoRoot $AbilityOutput
$moveOutputPath = Join-Path $repoRoot $MoveOutput

$pokemonList | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pokemonOutputPath -Encoding UTF8
$abilityList | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $abilityOutputPath -Encoding UTF8
$moveList | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $moveOutputPath -Encoding UTF8

Write-Output "Imported CSV to JSON:"
Write-Output " - $pokemonOutputPath"
Write-Output " - $abilityOutputPath"
Write-Output " - $moveOutputPath"
