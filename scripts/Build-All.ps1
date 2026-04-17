param(
    [switch]$FromCsv,
    [string]$SiteUrl = "https://tingahaku.github.io/",
    [string]$OutputDirectory = "docs"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "Apply-MovePendingTags.ps1")

if ($FromCsv) {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "Import-CsvData.ps1")
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "Build-PokemonData.ps1")
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "Build-StaticPages.ps1") -OutputDirectory $OutputDirectory -SiteUrl $SiteUrl

Write-Output "Build-All completed."
