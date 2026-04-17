param(
    [string]$OutputDirectory = "docs",
    [string]$TemplatePath = "templates/app-shell.html",
    [string]$DefaultPokemonKey = "garchomp",
    [string]$SiteUrl = "",
    [string]$OgImagePath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $repoRoot $OutputDirectory
$templateFullPath = Join-Path $repoRoot $TemplatePath
$dataRoot = Join-Path $repoRoot "data"

if (Test-Path $outputPath) {
    $resolvedOutputPath = [System.IO.Path]::GetFullPath($outputPath)
    $resolvedRepoRoot = [System.IO.Path]::GetFullPath($repoRoot)

    if (-not $resolvedOutputPath.StartsWith($resolvedRepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "出力先がリポジトリ外です: $resolvedOutputPath"
    }

    Remove-Item -LiteralPath $resolvedOutputPath -Recurse -Force
}

New-Item -ItemType Directory -Path $outputPath | Out-Null

$copyTargets = @("assets", "data", "js", "style.css", "guidelines", "privacy")

foreach ($target in $copyTargets) {
    $source = Join-Path $repoRoot $target
    $destination = Join-Path $outputPath $target
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

New-Item -ItemType File -Path (Join-Path $outputPath ".nojekyll") | Out-Null

$template = Get-Content $templateFullPath -Encoding utf8 -Raw
$pokemonIndex = Get-Content (Join-Path $dataRoot "PokemonIndex.json") -Encoding utf8 -Raw | ConvertFrom-Json
$abilityList = Get-Content (Join-Path $dataRoot "Ability.json") -Encoding utf8 -Raw | ConvertFrom-Json
$moveList = Get-Content (Join-Path $dataRoot "Move.json") -Encoding utf8 -Raw | ConvertFrom-Json
$typeChartSource = Get-Content (Join-Path $repoRoot "js/TypeChart.js") -Encoding utf8 -Raw
$typeChartJson = ([regex]::Match($typeChartSource, 'export const TYPE_CHART = (\{[\s\S]*?\});')).Groups[1].Value.TrimEnd(';')
$allTypesJson = ([regex]::Match($typeChartSource, 'export const ALL_TYPES = (\[[\s\S]*?\]);')).Groups[1].Value.TrimEnd(';')
$abilityMap = @{}
$moveMap = @{}

foreach ($ability in $abilityList) {
    $abilityMap[$ability.name] = $ability
}

foreach ($move in $moveList) {
    $moveMap[$move.name] = $move
}

function ConvertTo-NativeValue {
    param($Value)

    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [System.Management.Automation.PSCustomObject]) {
        $result = @{}

        foreach ($property in $Value.PSObject.Properties) {
            $result[[string]$property.Name] = ConvertTo-NativeValue $property.Value
        }

        return $result
    }

    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        return @($Value | ForEach-Object { ConvertTo-NativeValue $_ })
    }

    return $Value
}

$typeChart = ConvertTo-NativeValue (ConvertFrom-Json $typeChartJson)
$allTypes = @(ConvertTo-NativeValue (ConvertFrom-Json $allTypesJson))

function Set-ContentUtf8NoBom {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LiteralPath,
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($LiteralPath, $Value, $utf8NoBom)
}

function Escape-HtmlAttribute {
    param([string]$Value)

    $safeValue = if ($null -eq $Value) { "" } else { $Value }

    return $safeValue.
        Replace("&", "&amp;").
        Replace('"', "&quot;").
        Replace("<", "&lt;").
        Replace(">", "&gt;")
}

function Get-PropertyValue {
    param(
        $Object,
        [string]$Key,
        $Default = $null
    )

    if ($null -eq $Object) {
        return $Default
    }

    if ($Object -is [hashtable]) {
        return $(if ($Object.ContainsKey($Key)) { $Object[$Key] } else { $Default })
    }

    $property = $Object.PSObject.Properties[$Key]
    return $(if ($property) { $property.Value } else { $Default })
}

function Get-ModifierOrDefault {
    param(
        $Value,
        [double]$DefaultValue = 1
    )

    if ($null -eq $Value) {
        return $DefaultValue
    }

    return [double]$Value
}

function Truncate-ToOneDecimal {
    param([double]$Value)

    return [math]::Floor($Value * 10) / 10
}

function Multiply-AndTruncate {
    param([double[]]$Values)

    $result = 1.0

    foreach ($value in $Values) {
        $result = Truncate-ToOneDecimal ($result * [double]$value)
    }

    return $result
}

function Get-TypeMultiplier {
    param(
        [string]$AttackType,
        [string[]]$DefenseTypes,
        [hashtable]$TypeChart
    )

    if (-not $DefenseTypes -or $DefenseTypes.Count -eq 0) {
        return 1
    }

    $multiplier = 1.0
    $attackChart = Get-PropertyValue $TypeChart $AttackType @{}

    foreach ($defenseType in $DefenseTypes) {
        $typeMultiplier = Get-PropertyValue $attackChart $defenseType 1
        $multiplier *= [double]$typeMultiplier
    }

    return $multiplier
}

function Get-ResistanceData {
    param(
        [string[]]$DefenseTypes,
        [hashtable]$TypeChart,
        [string[]]$AllTypes
    )

    $result = @{
        weak4 = New-Object System.Collections.Generic.List[string]
        weak2 = New-Object System.Collections.Generic.List[string]
        resist05 = New-Object System.Collections.Generic.List[string]
        resist025 = New-Object System.Collections.Generic.List[string]
        immune = New-Object System.Collections.Generic.List[string]
    }

    foreach ($attackType in $AllTypes) {
        $multiplier = Get-TypeMultiplier -AttackType $attackType -DefenseTypes $DefenseTypes -TypeChart $TypeChart

        if ($multiplier -eq 4) { $result.weak4.Add($attackType) }
        if ($multiplier -eq 2) { $result.weak2.Add($attackType) }
        if ($multiplier -eq 0.5) { $result.resist05.Add($attackType) }
        if ($multiplier -eq 0.25) { $result.resist025.Add($attackType) }
        if ($multiplier -eq 0) { $result.immune.Add($attackType) }
    }

    return $result
}

function Get-ResistancePoint {
    param($Resistance)

    $resistanceCount = @($Resistance.resist05).Count
    $heavyResistanceCount = @($Resistance.resist025).Count
    $immuneCount = @($Resistance.immune).Count
    $weakCount = @($Resistance.weak2).Count
    $heavyWeakCount = @($Resistance.weak4).Count

    return Truncate-ToOneDecimal (1 + (0.05 * ($resistanceCount + (2 * ($heavyResistanceCount + $immuneCount)) - $weakCount - (2 * $heavyWeakCount))))
}

function Get-DurabilityScore {
    param($BaseStats)

    return Truncate-ToOneDecimal ([math]::Pow(([double]$BaseStats.hp * [double]$BaseStats.def * [double]$BaseStats.spd), (1 / 3)))
}

function Get-BestSuitabilityModifier {
    param(
        [object[]]$Abilities,
        [string]$SuitabilityKey
    )

    $bestValue = 1.0
    $bestNames = New-Object System.Collections.Generic.List[string]

    foreach ($ability in $Abilities) {
        $suitabilityModifiers = Get-PropertyValue $ability "suitabilityModifiers" @{}
        $modifier = Get-ModifierOrDefault (Get-PropertyValue $suitabilityModifiers $SuitabilityKey $null) 1

        if ($modifier -gt $bestValue) {
            $bestValue = $modifier
            $bestNames.Clear()
            $bestNames.Add([string](Get-PropertyValue $ability "name" ""))
        } elseif ($modifier -eq $bestValue -and $modifier -gt 1) {
            $bestNames.Add([string](Get-PropertyValue $ability "name" ""))
        }
    }

    return @{
        value = $bestValue
        names = @($bestNames)
    }
}

function Get-SuitabilityScores {
    param(
        $Pokemon,
        [object[]]$Abilities,
        $ResistancePoint
    )

    $baseStats = $Pokemon.baseStats
    $synergy = Get-PropertyValue $Pokemon "synergy" @{}
    $synergyModifiers = Get-PropertyValue $synergy "modifiers" @{}
    $synergyName = Get-PropertyValue $synergy "name" "シナジー補正"
    $durabilityScore = Get-DurabilityScore $baseStats
    $items = @(
        @{ key = "physicalAttacker"; label = "物理アタッカー適正"; description = "物理技で削り合う適正"; parts = @("攻撃 {atk}", "総合耐久点 {durability}") },
        @{ key = "specialAttacker"; label = "特殊アタッカー適正"; description = "特殊技で削り合う適正"; parts = @("特攻 {spa}", "総合耐久点 {durability}") },
        @{ key = "physicalSweeper"; label = "物理スイーパー適正"; description = "物理技で一掃する適正"; parts = @("攻撃 {atk}", "素早さ {spe}") },
        @{ key = "specialSweeper"; label = "特殊スイーパー適正"; description = "特殊技で一掃する適正"; parts = @("特攻 {spa}", "素早さ {spe}") },
        @{ key = "physicalWall"; label = "物理受け適正"; description = "物理技を耐えきる適正"; parts = @("HP {hp}", "防御 {def}") },
        @{ key = "specialWall"; label = "特殊受け適正"; description = "特殊技を耐えきる適正"; parts = @("HP {hp}", "特防 {spd}") }
    )

    return @($items | ForEach-Object {
        $item = $_
        $bestAbilityModifier = Get-BestSuitabilityModifier -Abilities $Abilities -SuitabilityKey $item.key
        $synergyModifier = Truncate-ToOneDecimal (Get-ModifierOrDefault (Get-PropertyValue $synergyModifiers $item.key $null) 1)
        $lines = New-Object System.Collections.Generic.List[string]
        $baseScore = 0.0
        $value = 0.0

        $lines.Add($item.description)

        switch ($item.key) {
            "physicalAttacker" {
                $baseScore = [double]$baseStats.atk + $durabilityScore
                $lines.Add("- 攻撃 $($baseStats.atk)")
                $lines.Add("- 総合耐久点 $durabilityScore")
                $value = Multiply-AndTruncate @($baseScore, $bestAbilityModifier.value, $synergyModifier)
            }
            "specialAttacker" {
                $baseScore = [double]$baseStats.spa + $durabilityScore
                $lines.Add("- 特攻 $($baseStats.spa)")
                $lines.Add("- 総合耐久点 $durabilityScore")
                $value = Multiply-AndTruncate @($baseScore, $bestAbilityModifier.value, $synergyModifier)
            }
            "physicalSweeper" {
                $baseScore = [double]$baseStats.atk + [double]$baseStats.spe
                $lines.Add("- 攻撃 $($baseStats.atk)")
                $lines.Add("- 素早さ $($baseStats.spe)")
                $value = Multiply-AndTruncate @($baseScore, $bestAbilityModifier.value, $synergyModifier)
            }
            "specialSweeper" {
                $baseScore = [double]$baseStats.spa + [double]$baseStats.spe
                $lines.Add("- 特攻 $($baseStats.spa)")
                $lines.Add("- 素早さ $($baseStats.spe)")
                $value = Multiply-AndTruncate @($baseScore, $bestAbilityModifier.value, $synergyModifier)
            }
            "physicalWall" {
                $baseScore = [double]$baseStats.hp + [double]$baseStats.def
                $lines.Add("- HP $($baseStats.hp)")
                $lines.Add("- 防御 $($baseStats.def)")
                $value = Multiply-AndTruncate @($baseScore, $ResistancePoint, $bestAbilityModifier.value, $synergyModifier)
            }
            "specialWall" {
                $baseScore = [double]$baseStats.hp + [double]$baseStats.spd
                $lines.Add("- HP $($baseStats.hp)")
                $lines.Add("- 特防 $($baseStats.spd)")
                $value = Multiply-AndTruncate @($baseScore, $ResistancePoint, $bestAbilityModifier.value, $synergyModifier)
            }
        }

        $lines.Add("基礎点 = $(Truncate-ToOneDecimal $baseScore)")

        if (($item.key -eq "physicalWall" -or $item.key -eq "specialWall") -and $ResistancePoint -ne 1) {
            $lines.Add("タイプ耐性点 × $ResistancePoint")
        }

        if ($bestAbilityModifier.value -ne 1) {
            $lines.Add("特性補正（$([string]::Join(' / ', $bestAbilityModifier.names))）× $($bestAbilityModifier.value)")
        }

        if ($synergyModifier -ne 1) {
            $lines.Add("$synergyName × $synergyModifier")
        }

        $lines.Add("最終値 = $value")

        @{
            label = $item.label
            value = [math]::Floor($value)
            tooltip = [string]::Join("`n", @($lines))
        }
    })
}

function Get-MoveRangeData {
    param(
        [string[]]$MoveTypes,
        [hashtable]$TypeChart,
        [string[]]$AllTypes
    )

    $activeTypes = @($MoveTypes | Where-Object { $_ -and $_.Trim() -ne "" })
    $cells = @()
    $summary = @{
        weak4 = 0
        weak2 = 0
        resist05 = 0
        resist025 = 0
        immune = 0
    }

    for ($rowIndex = 0; $rowIndex -lt $AllTypes.Count; $rowIndex += 1) {
        $type1 = $AllTypes[$rowIndex]

        for ($columnIndex = $rowIndex; $columnIndex -lt $AllTypes.Count; $columnIndex += 1) {
            $type2 = $AllTypes[$columnIndex]
            $defenseTypes = if ($type1 -eq $type2) { @($type1) } else { @($type1, $type2) }
            $multiplier = 0

            if ($activeTypes.Count -gt 0) {
                $multipliers = @($activeTypes | ForEach-Object { Get-TypeMultiplier -AttackType $_ -DefenseTypes $defenseTypes -TypeChart $TypeChart })
                $multiplier = ($multipliers | Measure-Object -Maximum).Maximum
            }

            $cells += ,@{
                type1 = $type1
                type2 = $type2
                multiplier = $multiplier
            }

            if ($multiplier -eq 4) { $summary.weak4 += 1 }
            if ($multiplier -eq 2) { $summary.weak2 += 1 }
            if ($multiplier -eq 0.5) { $summary.resist05 += 1 }
            if ($multiplier -eq 0.25) { $summary.resist025 += 1 }
            if ($multiplier -eq 0) { $summary.immune += 1 }
        }
    }

    return @{
        cells = $cells
        summary = $summary
    }
}

function Get-AppropriateWidth {
    param(
        [double]$Value,
        [double]$MaxValue
    )

    return [math]::Round((($Value / $MaxValue) * 100), 2)
}

function Floor-Stat {
    param($Value)

    return [math]::Floor([double]$Value)
}

function Apply-StatMultiplier {
    param(
        $BaseStatValue,
        $Multiplier
    )

    return Floor-Stat ((([double]$BaseStatValue + 52) * [double]$Multiplier) - 52)
}

function Get-BestStatModifiers {
    param([object[]]$Abilities)

    $statKeys = @("hp", "atk", "def", "spa", "spd", "spe")
    $modifiers = @{ hp = 1; atk = 1; def = 1; spa = 1; spd = 1; spe = 1 }
    $usedAbilityNames = New-Object System.Collections.Generic.List[string]

    foreach ($ability in $Abilities) {
        $statModifiers = Get-PropertyValue $ability "statModifiers" @{}

        foreach ($statKey in $statKeys) {
            $candidateModifier = Get-PropertyValue $statModifiers $statKey $null

            if ($null -ne $candidateModifier) {
                $modifiers[$statKey] = [math]::Max([double]$modifiers[$statKey], [double]$candidateModifier)
            }
        }
    }

    foreach ($ability in $Abilities) {
        $statModifiers = Get-PropertyValue $ability "statModifiers" @{}
        $isUsed = $false

        foreach ($statKey in $statKeys) {
            $candidateModifier = Get-PropertyValue $statModifiers $statKey $null

            if ($null -ne $candidateModifier -and [double]$candidateModifier -gt 1 -and [double]$candidateModifier -eq [double]$modifiers[$statKey]) {
                $isUsed = $true
            }
        }

        if ($isUsed) {
            $usedAbilityNames.Add([string](Get-PropertyValue $ability "name" ""))
        }
    }

    return @{
        modifiers = $modifiers
        usedAbilityNames = @($usedAbilityNames)
    }
}

function Get-PerformanceGraphState {
    param(
        $Pokemon,
        [object[]]$Abilities
    )

    $baseStats = $Pokemon.baseStats
    $hasEviolite = [bool](Get-PropertyValue $Pokemon "evioliteEligible" $false)
    $bestStatModifierResult = Get-BestStatModifiers -Abilities $Abilities
    $bestStatModifiers = $bestStatModifierResult.modifiers
    $hasAbilityEnhancement = ($bestStatModifiers.hp -ne 1 -or $bestStatModifiers.atk -ne 1 -or $bestStatModifiers.def -ne 1 -or $bestStatModifiers.spa -ne 1 -or $bestStatModifiers.spd -ne 1 -or $bestStatModifiers.spe -ne 1)
    $evioliteMultiplier = if ($hasEviolite) { 1.5 } else { 1 }
    $evioliteStats = @{
        hp = $baseStats.hp
        atk = $baseStats.atk
        def = Apply-StatMultiplier $baseStats.def $evioliteMultiplier
        spa = $baseStats.spa
        spd = Apply-StatMultiplier $baseStats.spd $evioliteMultiplier
        spe = $baseStats.spe
    }
    $abilityBaseStats = $evioliteStats
    $enhancedStats = @{
        hp = Apply-StatMultiplier $abilityBaseStats.hp $bestStatModifiers.hp
        atk = Apply-StatMultiplier $abilityBaseStats.atk $bestStatModifiers.atk
        def = Apply-StatMultiplier $abilityBaseStats.def $bestStatModifiers.def
        spa = Apply-StatMultiplier $abilityBaseStats.spa $bestStatModifiers.spa
        spd = Apply-StatMultiplier $abilityBaseStats.spd $bestStatModifiers.spd
        spe = Apply-StatMultiplier $abilityBaseStats.spe $bestStatModifiers.spe
    }
    $datasets = @(
        @{
            label = "種族値"
            stroke = "#1d72ff"
            fill = "rgba(29,114,255,0.22)"
            values = @($baseStats.hp, $baseStats.atk, $baseStats.def, $baseStats.spa, $baseStats.spd, $baseStats.spe)
        }
    )

    if ($hasEviolite) {
        $datasets += ,@{
            label = "しんかのきせき"
            stroke = "#b28cff"
            fill = "rgba(178,140,255,0.18)"
            values = @($evioliteStats.hp, $evioliteStats.atk, $evioliteStats.def, $evioliteStats.spa, $evioliteStats.spd, $evioliteStats.spe)
        }
    }

    if ($hasAbilityEnhancement) {
        $datasets += ,@{
            label = "特性発動時"
            stroke = "#ff8a1f"
            fill = "rgba(255,138,31,0.18)"
            values = @($enhancedStats.hp, $enhancedStats.atk, $enhancedStats.def, $enhancedStats.spa, $enhancedStats.spd, $enhancedStats.spe)
        }
    }

    return @{
        labels = @("HP", "攻撃", "防御", "特攻", "特防", "素早さ")
        baseValues = @($baseStats.hp, $baseStats.atk, $baseStats.def, $baseStats.spa, $baseStats.spd, $baseStats.spe)
        datasets = $datasets
        maxValue = 200
    }
}

function Round-ToTwoDecimals {
    param($Value)

    return [math]::Round(([double]$Value + [double]::Epsilon), 2)
}

function Format-AxisValue {
    param($Value)

    if ([double]$Value -eq [math]::Floor([double]$Value)) {
        return [string]([math]::Floor([double]$Value))
    }

    return [string](Round-ToTwoDecimals $Value)
}

function Get-PolygonPoints {
    param(
        [double[]]$Values,
        [double]$MaxValue,
        [double]$CenterX,
        [double]$CenterY,
        [double]$Radius
    )

    $startAngle = -90
    return (($Values | ForEach-Object -Begin { $index = 0 } -Process {
        $angle = ($startAngle + ((360 / $Values.Count) * $index)) * ([math]::PI / 180)
        $distance = $Radius * ([double]$_ / $MaxValue)
        $x = $CenterX + ([math]::Cos($angle) * $distance)
        $y = $CenterY + ([math]::Sin($angle) * $distance)
        $index += 1
        "$(Round-ToTwoDecimals $x),$(Round-ToTwoDecimals $y)"
    }) -join " ")
}

function Get-AxisItems {
    param(
        [string[]]$Labels,
        [double[]]$BaseValues,
        [double]$CenterX,
        [double]$CenterY,
        [double]$Radius
    )

    $items = @()
    $startAngle = -90
    $labelDistance = $Radius + 27
    $labelOffsetY = -4
    $valueOffsetY = 24

    for ($index = 0; $index -lt $Labels.Count; $index += 1) {
        $angle = ($startAngle + ((360 / $Labels.Count) * $index)) * ([math]::PI / 180)
        $lineX = $CenterX + ([math]::Cos($angle) * $Radius)
        $lineY = $CenterY + ([math]::Sin($angle) * $Radius)
        $labelX = $CenterX + ([math]::Cos($angle) * $labelDistance)
        $labelY = $CenterY + ([math]::Sin($angle) * $labelDistance)
        $items += ,@{
            label = $Labels[$index]
            value = $BaseValues[$index]
            lineX = Round-ToTwoDecimals $lineX
            lineY = Round-ToTwoDecimals $lineY
            labelX = Round-ToTwoDecimals $labelX
            labelY = Round-ToTwoDecimals ($labelY + $labelOffsetY)
            valueX = Round-ToTwoDecimals $labelX
            valueY = Round-ToTwoDecimals ($labelY + $valueOffsetY)
        }
    }

    return $items
}

function Get-GridPolygons {
    param(
        [int]$ValueCount,
        [double]$MaxValue,
        [double]$CenterX,
        [double]$CenterY,
        [double]$Radius
    )

    $steps = @(0.25, 0.5, 0.75, 1)
    return @($steps | ForEach-Object {
        $values = @(for ($i = 0; $i -lt $ValueCount; $i += 1) { $MaxValue * $_ })
        Get-PolygonPoints -Values $values -MaxValue $MaxValue -CenterX $CenterX -CenterY $CenterY -Radius $Radius
    })
}

function Get-ReorderedGraphState {
    param($GraphState)

    $order = @(0, 1, 2, 5, 4, 3)
    $reorderedDatasets = @()

    foreach ($dataset in $GraphState.datasets) {
        $reorderedValues = @()

        foreach ($orderIndex in $order) {
            $reorderedValues += $dataset.values[$orderIndex]
        }

        $reorderedDatasets += ,@{
            label = $dataset.label
            stroke = $dataset.stroke
            fill = $dataset.fill
            values = $reorderedValues
        }
    }

    return @{
        labels = @("HP", "攻撃", "防御", "素早さ", "特防", "特攻")
        baseValues = @($order | ForEach-Object { $GraphState.baseValues[$_] })
        datasets = $reorderedDatasets
        maxValue = $GraphState.maxValue
    }
}

function Render-PerformanceGraphSvg {
    param($GraphState)

    $displayState = Get-ReorderedGraphState -GraphState $GraphState
    $centerX = 230
    $centerY = 214
    $radius = 160
    $maxValue = [double]$displayState.maxValue
    $gridPolygons = Get-GridPolygons -ValueCount $displayState.labels.Count -MaxValue $maxValue -CenterX $centerX -CenterY $centerY -Radius $radius
    $axisItems = Get-AxisItems -Labels $displayState.labels -BaseValues $displayState.baseValues -CenterX $centerX -CenterY $centerY -Radius $radius
    $datasetMarkup = @($displayState.datasets | ForEach-Object {
        $points = Get-PolygonPoints -Values $_.values -MaxValue $maxValue -CenterX $centerX -CenterY $centerY -Radius $radius
        @"
            <polygon points="$points" fill="$($_.fill)" stroke="$($_.stroke)" stroke-width="3" />
            <polyline points="$points" fill="none" stroke="$($_.stroke)" stroke-width="3" />
"@
    }) -join ""
    $axisMarkup = @($axisItems | ForEach-Object {
        "<line x1=""$centerX"" y1=""$centerY"" x2=""$($_.lineX)"" y2=""$($_.lineY)"" stroke=""rgba(122,100,68,0.3)"" stroke-width=""1.2"" />"
    }) -join ""
    $labelMarkup = for ($index = 0; $index -lt $axisItems.Count; $index += 1) {
        $item = $axisItems[$index]
        $affectedValues = @($displayState.datasets | Select-Object -Skip 1 | ForEach-Object -Begin { $datasetIndex = 0 } -Process {
            if ($_.values[$index] -ne $item.value) {
                $datasetIndex += 1
                "<text x=""$($item.valueX)"" y=""$($item.valueY + ($datasetIndex * 19))"" fill=""$($_.stroke)"" font-size=""16"" font-weight=""800"" text-anchor=""middle"" dominant-baseline=""middle"">$(Escape-HtmlAttribute (Format-AxisValue $_.values[$index]))</text>"
            }
        }) -join ""
@"
            <text x="$($item.labelX)" y="$($item.labelY)" fill="#3f3122" font-size="23" font-weight="800" text-anchor="middle" dominant-baseline="middle">$($item.label)</text>
            <text x="$($item.valueX)" y="$($item.valueY)" fill="#6e5840" font-size="20" font-weight="700" text-anchor="middle" dominant-baseline="middle">$(Escape-HtmlAttribute (Format-AxisValue $item.value))</text>
            $affectedValues
"@
    }

    return @"
<svg viewBox="0 0 460 438" role="img" aria-label="能力グラフ">
    <rect x="0" y="0" width="460" height="438" rx="26" fill="rgba(255,253,248,0.96)" />
    $(@($gridPolygons | ForEach-Object { "<polygon points=""$_"" fill=""none"" stroke=""rgba(122,100,68,0.15)"" stroke-width=""1.2"" />" }) -join "")
    $axisMarkup
    $datasetMarkup
    $(@($labelMarkup) -join "")
</svg>
"@
}

function Get-TypeBadgeTextMarkup {
    param([string[]]$Values)

    if (-not $Values -or $Values.Count -eq 0) {
        return '<p class="resistance-card__empty">-</p>'
    }

    return '<div class="type-icon-list">' + ((@($Values) | ForEach-Object { "<span class=""type-badge"">$(Escape-HtmlAttribute $_)</span>" }) -join "") + '</div>'
}

function Format-ResistanceLabel {
    param([string]$Label)

    switch ($Label) {
        "4倍" { return "★4倍" }
        "2倍" { return "◎2倍" }
        "0.5倍" { return "△0.5倍" }
        "0.25倍" { return "▼0.25倍" }
        "無効" { return "✕0倍" }
        default { return $Label }
    }
}

function Format-HeatmapCellValue {
    param($Multiplier)

    switch ([double]$Multiplier) {
        4 { return "☆" }
        2 { return "○" }
        1 { return "" }
        0.5 { return "△" }
        0.25 { return "▽" }
        0 { return "✕" }
        default { return [string]$Multiplier }
    }
}

function Render-HeatmapCellMark {
    param($Multiplier)

    $symbol = Format-HeatmapCellValue $Multiplier

    if (-not $symbol) {
        return ""
    }

    return "<span class=""heatmap__mark"">$(Escape-HtmlAttribute $symbol)</span>"
}

function Render-ResistanceRowsMarkup {
    param($Resistance)

    $rows = @(
        @{ label = "4倍"; tone = "x4"; values = @($Resistance.weak4) },
        @{ label = "2倍"; tone = "x2"; values = @($Resistance.weak2) },
        @{ label = "0.5倍"; tone = "x05"; values = @($Resistance.resist05) },
        @{ label = "0.25倍"; tone = "x025"; values = @($Resistance.resist025) },
        @{ label = "無効"; tone = "immune"; values = @($Resistance.immune) }
    )

    return @($rows | ForEach-Object {
        $title = if ($_.label -eq "0.5倍") { '<div class="resistance-section-title">耐性</div>' } else { '' }
        $body = Get-TypeBadgeTextMarkup -Values $_.values
@"
$title
<div class="resistance-row" data-tone="$($_.tone)" data-label="$($_.label)">
    <div class="resistance-row__label">$(Format-ResistanceLabel $_.label)</div>
    <div class="resistance-row__body">$body</div>
</div>
"@
    }) -join ""
}

function Build-CanonicalTag {
    param([string]$CanonicalUrl)

    if (-not $CanonicalUrl) {
        return ""
    }

    return "    <link rel=`"canonical`" href=`"$(Escape-HtmlAttribute $CanonicalUrl)`">"
}

function Build-OgImageTag {
    param([string]$ImageUrl)

    if (-not $ImageUrl) {
        return ""
    }

    return "    <meta property=`"og:image`" content=`"$(Escape-HtmlAttribute $ImageUrl)`">"
}

function Build-OgUrlTag {
    param([string]$PageUrl)

    if (-not $PageUrl) {
        return ""
    }

    return "    <meta property=`"og:url`" content=`"$(Escape-HtmlAttribute $PageUrl)`">"
}

function Render-PageTemplate {
    param(
        [string]$Title,
        [string]$Description,
        [string]$BasePath,
        [string]$RouteKey,
        [string]$CanonicalUrl,
        [string]$PageUrl,
        [string]$OgImageUrl,
        [string]$AppHtml = ""
    )

    $routeKeyScript = if ($RouteKey) {
        "        window.__POKEGRAPH_ROUTE_KEY__ = `"$(Escape-HtmlAttribute $RouteKey)`";"
    } else {
        ""
    }

    return $template.
        Replace("{{TITLE}}", (Escape-HtmlAttribute $Title)).
        Replace("{{DESCRIPTION}}", (Escape-HtmlAttribute $Description)).
        Replace("{{BASE_PATH}}", (Escape-HtmlAttribute $BasePath)).
        Replace("{{ROUTE_KEY_SCRIPT}}", $routeKeyScript).
        Replace("{{OG_URL_TAG}}", (Build-OgUrlTag $PageUrl)).
        Replace("{{CANONICAL_TAG}}", (Build-CanonicalTag $CanonicalUrl)).
        Replace("{{OG_IMAGE_TAG}}", (Build-OgImageTag $OgImageUrl)).
        Replace("{{APP_HTML}}", $AppHtml)
}

function Join-SiteUrl {
    param([string]$BaseUrl, [string]$RelativePath)

    if (-not $BaseUrl) {
        return ""
    }

    $normalizedBase = if ($BaseUrl.EndsWith("/")) { $BaseUrl } else { "$BaseUrl/" }
    $baseUri = New-Object System.Uri($normalizedBase)
    $resolvedUri = New-Object System.Uri($baseUri, $RelativePath)
    return $resolvedUri.AbsoluteUri
}

function Build-StaticFallbackHtml {
    param(
        [string]$Heading,
        [string]$Description
    )

    $safeHeading = Escape-HtmlAttribute $Heading
    $safeDescription = Escape-HtmlAttribute $Description

    return @"
<section class="panel">
    <div class="panel__header">
        <h3 class="panel__title">$safeHeading</h3>
    </div>
    <p class="point-text">$safeDescription</p>
</section>
"@
}

function Build-StaticPokemonHtml {
    param(
        $Pokemon,
        [string]$Description,
        [hashtable]$AbilityMap,
        [hashtable]$MoveMap,
        [hashtable]$TypeChart,
        [string[]]$AllTypes,
        [string]$BasePath
    )

    $typeBadges = ""
    $resolvedAbilities = @()
    $resolvedMoves = @()

    foreach ($typeName in $Pokemon.types) {
        $safeTypeName = Escape-HtmlAttribute $typeName
        $typeBadges += "<span class=`"type-badge`" title=`"$safeTypeName`" aria-label=`"$safeTypeName`"><span class=`"type-badge__fallback`">$safeTypeName</span></span>"
    }

    $abilityCards = ""

    foreach ($abilityName in $Pokemon.abilities) {
        $ability = $AbilityMap[$abilityName]
        if ($ability) {
            $resolvedAbilities += $ability
        }
        $safeAbilityName = Escape-HtmlAttribute $abilityName
        $safeAbilityDescription = if ($ability) { Escape-HtmlAttribute $ability.description } else { "-" }
        $abilityCards += @"
<article class="ability-card">
    <h4 class="ability-card__name">$safeAbilityName</h4>
    <p class="ability-card__desc">$safeAbilityDescription</p>
</article>
"@
    }

    $statRows = @(
        @{ Label = "HP"; Value = $Pokemon.baseStats.hp },
        @{ Label = "攻撃"; Value = $Pokemon.baseStats.atk },
        @{ Label = "防御"; Value = $Pokemon.baseStats.def },
        @{ Label = "特攻"; Value = $Pokemon.baseStats.spa },
        @{ Label = "特防"; Value = $Pokemon.baseStats.spd },
        @{ Label = "素早さ"; Value = $Pokemon.baseStats.spe }
    )

    $statItems = ($statRows | ForEach-Object {
        "<div class=`"appropriate-row`"><div class=`"appropriate-row__meta`"><div class=`"appropriate-row__label`">$($_.Label)</div><div class=`"appropriate-row__value`">$($_.Value)</div></div></div>"
    }) -join ""

    $moveItems = ""
    $setupTagItems = @("設置技", "状態異常", "バトン", "対面操作", "妨害", "サポート")
    $moveTagLookup = @{}

    foreach ($moveName in $Pokemon.moves) {
        $move = $MoveMap[$moveName]
        if ($move) {
            $resolvedMoves += $move
        }
        $safeMoveName = Escape-HtmlAttribute $moveName
        $safeMoveDescription = if ($move -and $move.description) { Escape-HtmlAttribute $move.description } else { "通常技" }
        $moveTagsMarkup = ""

        if ($move -and $move.tags) {
            foreach ($tag in @($move.tags)) {
                if (-not $moveTagLookup.ContainsKey($tag)) {
                    $moveTagLookup[$tag] = New-Object System.Collections.Generic.List[string]
                }

                $moveTagLookup[$tag].Add([string]$move.name)
            }
        }

        if ($move -and $move.tags -and $move.tags.Count -gt 0) {
            $safeTagMarkup = (@($move.tags) | ForEach-Object {
                "<span class=""move-card__tag"">$(Escape-HtmlAttribute $_)</span>"
            }) -join ""
            $moveTagsMarkup = "<div class=""move-card__tags"">$safeTagMarkup</div>"
        }

        $moveItems += @"
<article class="move-card">
    <div class="move-card__head">
        <div class="move-card__name-box">
            <h4 class="move-card__name">$safeMoveName</h4>
        </div>
    </div>
    $moveTagsMarkup
    <p class="move-card__desc">$safeMoveDescription</p>
</article>
"@
    }

    $setupOptionsMarkup = ($setupTagItems | ForEach-Object {
        $tag = $_
        $moveNames = if ($moveTagLookup.ContainsKey($tag)) { @($moveTagLookup[$tag]) } else { @() }
        $isActive = $moveNames.Count -gt 0
        $tooltipAttribute = if ($isActive) {
            " data-tooltip=""$(Escape-HtmlAttribute ($moveNames -join "`n"))"""
        } else {
            ""
        }
        $chipClass = if ($isActive) { "setup-chip setup-chip--active" } else { "setup-chip setup-chip--inactive" }

        "<span class=""$chipClass""$tooltipAttribute>$(Escape-HtmlAttribute $tag)</span>"
    }) -join ""
    $resistance = Get-ResistanceData -DefenseTypes @($Pokemon.types) -TypeChart $TypeChart -AllTypes $AllTypes
    $resistancePoint = Get-ResistancePoint -Resistance $resistance
    $suitabilityScores = Get-SuitabilityScores -Pokemon $Pokemon -Abilities $resolvedAbilities -ResistancePoint $resistancePoint
    $performanceGraph = Get-PerformanceGraphState -Pokemon $Pokemon -Abilities $resolvedAbilities
    $performanceGraphSvg = Render-PerformanceGraphSvg -GraphState $performanceGraph
    $performanceLegendMarkup = @($performanceGraph.datasets | ForEach-Object {
        "<span class=""legend__item""><span class=""legend__line"" style=""background:$($_.stroke)""></span>$(Escape-HtmlAttribute $_.label)</span>"
    }) -join ""
    $selectedMoveTypes = @($Pokemon.types[0], $Pokemon.types[1], "", "")
    $moveRange = Get-MoveRangeData -MoveTypes $selectedMoveTypes -TypeChart $TypeChart -AllTypes $AllTypes
    $summary = $moveRange.summary
    $summaryMax = ($AllTypes.Count * ($AllTypes.Count + 1)) / 2
    $appropriateMarkup = ($suitabilityScores | ForEach-Object {
        $score = $_
        $tooltip = Escape-HtmlAttribute $score.tooltip
        $label = Escape-HtmlAttribute $score.label
        $value = [math]::Floor([double]$score.value)
        $width = Get-AppropriateWidth -Value $value -MaxValue 400
@"
<div class="appropriate-row">
    <div class="appropriate-row__meta">
        <div class="appropriate-row__label">$label</div>
        <div class="appropriate-row__value">$value</div>
        <button class="info-dot" type="button" data-tooltip="$tooltip">i</button>
    </div>
    <div class="appropriate-row__bar"><div class="appropriate-row__fill" style="width:${width}%"></div></div>
</div>
"@
    }) -join ""
    $heatmapHeaders = ($AllTypes | ForEach-Object { "<th data-type=""$(Escape-HtmlAttribute $_)"">$(Escape-HtmlAttribute $_)</th>" }) -join ""
    $cellMap = @{}

    foreach ($cell in $moveRange.cells) {
        $cellMap["$($cell.type1)|$($cell.type2)"] = $cell
    }

    $heatmapRows = for ($rowIndex = 0; $rowIndex -lt $AllTypes.Count; $rowIndex += 1) {
        $rowType = $AllTypes[$rowIndex]
        $columns = for ($columnIndex = 0; $columnIndex -lt $AllTypes.Count; $columnIndex += 1) {
            $columnType = $AllTypes[$columnIndex]
            $key = if ($rowIndex -le $columnIndex) { "$rowType|$columnType" } else { "$columnType|$rowType" }
            $cell = $cellMap[$key]
            $multiplier = if ($cell) { $cell.multiplier } else { 1 }
            $tier = if ($multiplier -eq 0) { "0" } else { [string]$multiplier -replace '\.', '' }
            $duplicateClass = if ($rowIndex -gt $columnIndex) { " heatmap__cell--duplicate" } else { "" }
            $primaryType = if ($cell) { $cell.type1 } else { $rowType }
            $secondaryType = if ($cell) { $cell.type2 } else { $columnType }
            $tooltipLabel = if ($primaryType -eq $secondaryType) { $primaryType } else { "$primaryType・$secondaryType" }
            $tooltipText = Escape-HtmlAttribute "$tooltipLabel`n$multiplier倍"
            "<td class=""heatmap__cell$duplicateClass"" data-tier=""$tier"" data-tooltip=""$tooltipText"">$(Render-HeatmapCellMark $multiplier)</td>"
        }
        "<tr><th class=""heatmap__label"" data-type=""$(Escape-HtmlAttribute $rowType)"">$(Escape-HtmlAttribute $rowType)</th>$([string]::Join('', $columns))</tr>"
    }
    $resistanceCards = @(
        @{ label = "4倍"; value = $summary.weak4; tone = "x4" },
        @{ label = "2倍"; value = $summary.weak2; tone = "x2" },
        @{ label = "0.5倍"; value = $summary.resist05; tone = "x05" },
        @{ label = "0.25倍"; value = $summary.resist025; tone = "x025" },
        @{ label = "無効"; value = $summary.immune; tone = "immune" }
    ) | ForEach-Object {
        $width = Get-AppropriateWidth -Value ([double]$_.value) -MaxValue ([double]$summaryMax)
@"
<div class="resistance-card resistance-card--$($_.tone)">
    <h4><span class="resistance-card__title-main">$(Format-ResistanceLabel $_.label)</span></h4>
    <p class="resistance-card__value">$($_.value)</p>
    <div class="resistance-card__meter" aria-hidden="true"><div class="resistance-card__meter-fill resistance-card__meter-fill--$($_.tone)" style="width:${width}%"></div></div>
</div>
"@
    }

    $safeName = Escape-HtmlAttribute $Pokemon.name
    $safeNo = Escape-HtmlAttribute ([string]$Pokemon.no)
    $safeDescription = Escape-HtmlAttribute $Description
    $safePoint = Escape-HtmlAttribute $(if ($null -ne $Pokemon.point) { [string]$Pokemon.point } else { "" })
    $safeImagePath = Escape-HtmlAttribute ("{0}assets/pokemon/{1}.png" -f $BasePath, [string]$Pokemon.imageKey)
    $resistanceRowsMarkup = Render-ResistanceRowsMarkup -Resistance $resistance

    $memoSection = if ($safePoint) {
@"
<section class="panel">
    <div class="panel__header">
        <h3 class="panel__title panel__title--memo">ひとくちメモ</h3>
    </div>
    <p class="point-text">$safePoint</p>
</section>
"@
    } else {
        ""
    }

    return @"
<section class="panel panel--profile">
    <div class="panel__header">
        <h3 class="panel__title">基本情報</h3>
    </div>
    <div class="profile">
        <div class="profile__summary">
                            <div class="profile__media">
                                <div class="profile__identity">
                                    <span class="profile__no">No.$safeNo</span>
                                    <h2 class="profile__name">$safeName</h2>
                                </div>
                                <div class="profile__image-wrap">
                                    <img class="profile__image" src="$safeImagePath" alt="$safeName">
                                </div>
                                <div class="type-list">$typeBadges</div>
                            </div>
                            <div class="profile__details">
                                <div class="profile__abilities-title">特性</div>
                                <div class="profile__abilities">$abilityCards</div>
                            </div>
                        </div>
                        <div class="resistance-panel">
                            <div class="resistance-panel__title">弱点</div>
                            $resistanceRowsMarkup
                        </div>
                        <p class="point-text">$safeDescription</p>
    </div>
</section>
<div class="profile-subgrid">
    <section class="panel chart-card">
        <div class="panel__header">
            <h3 class="panel__title">能力</h3>
        </div>
        <div class="svg-wrap">
            <div class="chart-card__info">
                <button class="info-dot" type="button" data-tooltip="倍率は能力ポイント極振り性格補正無しで計算">i</button>
            </div>
            <div class="chart-card__controls chart-card__controls--in-graph">
                <button class="button-switch button-switch--chart button-switch--summary-off" type="button">HPを統合</button>
                <button class="button-switch button-switch--chart button-switch--summary-off" type="button">種族値のみ</button>
            </div>
            $performanceGraphSvg
            <div class="legend legend--in-chart">$performanceLegendMarkup</div>
        </div>
    </section>
    <section class="panel panel--scores">
        <div class="panel__header">
            <h3 class="panel__title">適正</h3>
        </div>
        <div class="appropriate-list">$appropriateMarkup</div>
        <div class="setup-panel">
            <div class="setup-panel__title-row">
                <div class="setup-panel__title">起点作成</div>
                <button class="info-dot" type="button" data-tooltip="戦局を有利にする適正">i</button>
            </div>
            $setupOptionsMarkup
        </div>
    </section>
    <section class="panel panel--scores">
        <div class="panel__header">
            <h3 class="panel__title">種族値</h3>
        </div>
        <div class="appropriate-list">$statItems</div>
    </section>
    <section class="panel panel--moves">
        <div class="panel__header">
            <h3 class="panel__title">覚える技</h3>
        </div>
        <div class="move-columns"><section class="move-column">$moveItems</section></div>
    </section>
</div>
<section class="panel">
    <div class="panel__header">
        <h3 class="panel__title">技範囲</h3>
    </div>
    <div class="range-top">
        <div class="heatmap-wrap">
            <table class="heatmap">
                <thead>
                    <tr>
                        <th class="heatmap__corner">防御側</th>$heatmapHeaders
                    </tr>
                </thead>
                <tbody>$([string]::Join('', $heatmapRows))</tbody>
            </table>
        </div>
        <div class="resistance-grid resistance-grid--summary">
            $([string]::Join('', $resistanceCards))
        </div>
    </div>
</section>
$memoSection
"@
}

$resolvedOgImageUrl = if ($OgImagePath) { Join-SiteUrl $SiteUrl $OgImagePath } else { "" }

$topPageHtml = Render-PageTemplate `
    -Title "【ポケモンチャンピオンズ】ポケグラフ | グラフでわかるポケモンの強さと特徴" `
    -Description "グラフでわかるポケモンの強さと特徴" `
    -BasePath "./" `
    -RouteKey "" `
    -CanonicalUrl (Join-SiteUrl $SiteUrl "") `
    -PageUrl (Join-SiteUrl $SiteUrl "") `
    -OgImageUrl $resolvedOgImageUrl `
    -AppHtml (Build-StaticFallbackHtml -Heading "ポケグラフ" -Description "グラフでわかるポケモンの強さと特徴")

Set-Content -LiteralPath (Join-Path $outputPath "index.html") -Value $topPageHtml -Encoding utf8

$notFoundBasePath = "/"

if ($SiteUrl) {
    $normalizedSiteUrl = if ($SiteUrl.EndsWith("/")) { $SiteUrl } else { "$SiteUrl/" }
    $siteUri = New-Object System.Uri($normalizedSiteUrl)
    $notFoundBasePath = $siteUri.AbsolutePath

    if (-not $notFoundBasePath.EndsWith("/")) {
        $notFoundBasePath = "$notFoundBasePath/"
    }
}

$notFoundHtmlTemplate = @'
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ページを移動しています | ポケグラフ</title>
    <meta name="robots" content="noindex">
</head>
<body>
<script>
(function () {
    const repoBasePath = "__POKEGRAPH_BASE_PATH__";
    const currentPath = window.location.pathname || "";
    const normalizedPath = currentPath.startsWith(repoBasePath)
        ? currentPath.slice(repoBasePath.length)
        : currentPath.replace(/^\/+/, "");
    const trimmed = normalizedPath.replace(/^\/+|\/+$/g, "");
    const parts = trimmed.split("/").filter(Boolean);

    if (parts[0] === "pokemon" && parts[1]) {
        const pokemonKey = encodeURIComponent(decodeURIComponent(parts[1]));
        window.location.replace(repoBasePath + "pokemon/" + pokemonKey + "/");
        return;
    }

    window.location.replace(repoBasePath);
})();
</script>
</body>
</html>
'@

$notFoundHtml = $notFoundHtmlTemplate.Replace("__POKEGRAPH_BASE_PATH__", $notFoundBasePath)

Set-Content -LiteralPath (Join-Path $outputPath "404.html") -Value $notFoundHtml -Encoding utf8

$siteMapEntries = New-Object System.Collections.Generic.List[object]
$seenSiteMapUrls = @{}

function Add-SiteMapEntry {
    param(
        [System.Collections.Generic.List[object]]$Entries,
        [hashtable]$SeenUrls,
        [string]$Url,
        [string]$LastMod
    )

    if (-not $Url) {
        return
    }

    if ($SeenUrls.ContainsKey($Url)) {
        return
    }

    $safeLastMod = if ($LastMod) { $LastMod } else { (Get-Date).ToString("yyyy-MM-dd") }

    $Entries.Add([PSCustomObject]@{
        loc = $Url
        lastmod = $safeLastMod
    })
    $SeenUrls[$Url] = $true
}

if ($SiteUrl) {
    Add-SiteMapEntry -Entries $siteMapEntries -SeenUrls $seenSiteMapUrls -Url (Join-SiteUrl $SiteUrl "") -LastMod (Get-Date).ToString("yyyy-MM-dd")
    Add-SiteMapEntry -Entries $siteMapEntries -SeenUrls $seenSiteMapUrls -Url (Join-SiteUrl $SiteUrl "privacy/") -LastMod (Get-Item -LiteralPath (Join-Path $repoRoot "privacy/index.html")).LastWriteTime.ToString("yyyy-MM-dd")
    Add-SiteMapEntry -Entries $siteMapEntries -SeenUrls $seenSiteMapUrls -Url (Join-SiteUrl $SiteUrl "guidelines/") -LastMod (Get-Item -LiteralPath (Join-Path $repoRoot "guidelines/index.html")).LastWriteTime.ToString("yyyy-MM-dd")
}

foreach ($pokemon in $pokemonIndex) {
    $detailPath = Join-Path $dataRoot ("pokemon/{0}.json" -f $pokemon.key)
    $detail = Get-Content $detailPath -Encoding utf8 -Raw | ConvertFrom-Json
    if ($detail.types) {
        $typeText = ($detail.types -join "・")
    } else {
        $typeText = ""
    }

    $title = "【ポケモンチャンピオンズ】$($detail.name)の種族値・特性・適正・技範囲 | ポケグラフ"
    if ($typeText) {
        $description = "$($detail.name)（$typeText）の種族値、耐性、特性、技範囲、適正をグラフで確認できるページ。"
    } else {
        $description = "$($detail.name)の種族値、耐性、特性、技範囲、適正をグラフで確認できるページ。"
    }
    $relativePagePath = ("pokemon/{0}/" -f $pokemon.key)
    $pageDirectory = Join-Path $outputPath $relativePagePath

    New-Item -ItemType Directory -Path $pageDirectory -Force | Out-Null

    $pageHtml = Render-PageTemplate `
        -Title $title `
        -Description $description `
        -BasePath "../../" `
        -RouteKey $pokemon.key `
        -CanonicalUrl (Join-SiteUrl $SiteUrl $relativePagePath) `
        -PageUrl (Join-SiteUrl $SiteUrl $relativePagePath) `
        -OgImageUrl $resolvedOgImageUrl `
        -AppHtml (Build-StaticPokemonHtml -Pokemon $detail -Description $description -AbilityMap $abilityMap -MoveMap $moveMap -TypeChart $typeChart -AllTypes $allTypes -BasePath "../../")

    Set-Content -LiteralPath (Join-Path $pageDirectory "index.html") -Value $pageHtml -Encoding utf8

    if ($SiteUrl) {
        Add-SiteMapEntry -Entries $siteMapEntries -SeenUrls $seenSiteMapUrls -Url (Join-SiteUrl $SiteUrl $relativePagePath) -LastMod (Get-Item -LiteralPath $detailPath).LastWriteTime.ToString("yyyy-MM-dd")
    }
}

if ($SiteUrl -and $siteMapEntries.Count -gt 0) {
    $sitemapContent = @(
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        ($siteMapEntries | ForEach-Object {
            "  <url>`n    <loc>$($_.loc)</loc>`n    <lastmod>$($_.lastmod)</lastmod>`n  </url>"
        })
        '</urlset>'
    ) -join "`n"

    Set-ContentUtf8NoBom -LiteralPath (Join-Path $outputPath "sitemap.xml") -Value $sitemapContent

    $robotsContent = @(
        'User-agent: *'
        'Allow: /'
        ''
        "Sitemap: $(Join-SiteUrl $SiteUrl 'sitemap.xml')"
    ) -join "`n"

    Set-ContentUtf8NoBom -LiteralPath (Join-Path $outputPath "robots.txt") -Value $robotsContent
}

Write-Output "Built static pages to $outputPath"
