param(
    [string]$SourcePath = "data/Pokemon.json",
    [string]$IndexPath = "data/PokemonIndex.json",
    [string]$OutputDirectory = "data/pokemon"
)

$ErrorActionPreference = "Stop"

$sourceJson = Get-Content $SourcePath -Encoding utf8 -Raw
$pokemonList = $sourceJson | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$searchIndex = foreach ($pokemon in $pokemonList) {
    if (-not $pokemon.key) {
        throw "Pokemon.json の各ポケモンに key を設定してください: $($pokemon.name)"
    }

    if (-not $pokemon.imageKey) {
        throw "Pokemon.json の各ポケモンに imageKey を設定してください: $($pokemon.name)"
    }

    [pscustomobject]@{
        key = $pokemon.key
        imageKey = $pokemon.imageKey
        no = $pokemon.no
        name = $pokemon.name
    }
}

$searchIndex | ConvertTo-Json -Depth 4 | Set-Content $IndexPath -Encoding utf8

foreach ($pokemon in $pokemonList) {
    if (-not $pokemon.key) {
        throw "Pokemon.json の各ポケモンに key を設定してください: $($pokemon.name)"
    }

    $fileName = "$($pokemon.key).json"
    $outputPath = Join-Path $OutputDirectory $fileName
    $pokemon | ConvertTo-Json -Depth 10 | Set-Content $outputPath -Encoding utf8
}

Write-Output "Built Pokemon index and split detail files."
