import { calculateResistance } from "./Resistance.js";
import { calculateMoveRange } from "./MoveRange.js";
import { TYPE_CHART, ALL_TYPES } from "./TypeChart.js";
import { resolveAppUrl } from "./AppPaths.js";

const SUITABILITY_DESCRIPTIONS = {
    physicalAttacker: "物理技で削り合う適正",
    specialAttacker: "特殊技で削り合う適正",
    physicalSweeper: "物理技で一掃する適正",
    specialSweeper: "特殊技で一掃する適正",
    physicalWall: "物理技を耐えきる適正",
    specialWall: "特殊技を耐えきる適正"
};

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS = { hp: "HP", atk: "攻撃", def: "防御", spa: "特攻", spd: "特防", spe: "素早さ" };
const SUITABILITY_ITEMS = [
    { key: "physicalAttacker", label: "物理アタッカー適正" },
    { key: "specialAttacker", label: "特殊アタッカー適正" },
    { key: "physicalSweeper", label: "物理スイーパー補正" },
    { key: "specialSweeper", label: "特殊スイーパー補正" },
    { key: "physicalWall", label: "物理受け適正" },
    { key: "specialWall", label: "特殊受け適正" }
];
const SETUP_TAG_ITEMS = ["設置技", "状態異常", "バトン", "対面操作", "妨害", "サポート"];
const MOVE_CATEGORY_LABELS = { physical: "物理", special: "特殊", status: "変化" };
const TYPE_IMAGE_NAMES = {
    "ノーマル": "normal",
    "ほのお": "fire",
    "みず": "water",
    "でんき": "electric",
    "くさ": "grass",
    "こおり": "ice",
    "かくとう": "fighting",
    "どく": "poison",
    "じめん": "ground",
    "ひこう": "flying",
    "エスパー": "psychic",
    "むし": "bug",
    "いわ": "rock",
    "ゴースト": "ghost",
    "ドラゴン": "dragon",
    "あく": "dark",
    "はがね": "steel",
    "フェアリー": "fairy"
};

function normalizeList(value) {
    if (Array.isArray(value)) {
        return value.filter((item) => item != null && String(item).trim() !== "").map((item) => String(item));
    }

    if (typeof value === "string") {
        const text = value.trim();
        return text === "" ? [] : [text];
    }

    return [];
}

function truncateToOneDecimal(value) {
    return Math.floor(Number(value) * 10) / 10;
}

function floorStat(value) {
    return Math.floor(Number(value));
}

function applyStatMultiplier(baseStatValue, multiplier) {
    return floorStat((Number(baseStatValue) + 52) * Number(multiplier) - 52);
}

function calculateRootDurability(hp, defenseLikeStat) {
    return floorStat(Math.sqrt(Number(hp) * Number(defenseLikeStat)));
}

function getPokemonImagePath(imageKey) {
    return resolveAppUrl(`assets/pokemon/${String(imageKey)}.png`);
}

function getTypeImagePath(typeName) {
    const typeFileName = TYPE_IMAGE_NAMES[typeName];
    return typeFileName ? resolveAppUrl(`assets/types/${typeFileName}.png`) : "";
}

function getSelectedStatModifiers(abilities, selectedAbilityName) {
    const modifiers = { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
    const bestAbilityNamesByStat = { hp: [], atk: [], def: [], spa: [], spd: [], spe: [] };

    const defaultAbility = abilities.find((ability) =>
        STAT_KEYS.some((statKey) => (ability.statModifiers?.[statKey] ?? 1) > 1)
    ) ?? abilities[0] ?? null;

    const selectedAbility = selectedAbilityName === ""
        ? null
        : abilities.find((ability) => ability.name === selectedAbilityName) ?? (selectedAbilityName == null ? defaultAbility : null);

    if (!selectedAbility) {
        return { modifiers, selectedAbilityName: "", bestAbilityNamesByStat };
    }

    STAT_KEYS.forEach((statKey) => {
        const candidateModifier = selectedAbility.statModifiers?.[statKey] ?? 1;
        modifiers[statKey] = Math.max(1, candidateModifier);
        if (modifiers[statKey] > 1) {
            bestAbilityNamesByStat[statKey] = [selectedAbility.name];
        }
    });

    return {
        modifiers,
        selectedAbilityName: selectedAbility.name,
        bestAbilityNamesByStat
    };
}

function buildAbilityActivatedLabel(abilityNames) {
    const names = [...new Set((abilityNames ?? []).filter(Boolean))];
    return names.length > 0 ? `${names.join(" / ")}発動時` : "";
}

function applyConditionalAbilityTypeBonus(modifiers, bestAbilityNamesByStat, selectedAbilityName, pokemonTypes) {
    const nextModifiers = { ...modifiers };
    const hasIceType = pokemonTypes.includes("こおり");
    const hasRockType = pokemonTypes.includes("いわ");

    if (selectedAbilityName === "ゆきふらし" && hasIceType) {
        nextModifiers.def = Math.max(nextModifiers.def, 1.5);
        bestAbilityNamesByStat.def = [selectedAbilityName];
    }

    if ((selectedAbilityName === "すなおこし" || selectedAbilityName === "すなはき") && hasRockType) {
        nextModifiers.spd = Math.max(nextModifiers.spd, 1.5);
        bestAbilityNamesByStat.spd = [selectedAbilityName];
    }

    return nextModifiers;
}

function createDisplayStats(stats) {
    return STAT_KEYS.map((statKey) => ({
        key: statKey,
        label: STAT_LABELS[statKey],
        value: floorStat(stats[statKey])
    }));
}

function sortMovesByPower(leftMove, rightMove) {
    const powerDifference = (rightMove.power ?? -1) - (leftMove.power ?? -1);

    if (powerDifference !== 0) {
        return powerDifference;
    }

    return leftMove.name.localeCompare(rightMove.name, "ja");
}

function getAdjustedMovePower(move, pokemonTypes) {
    const power = Number(move.power ?? 0);

    if (!Number.isFinite(power)) {
        return 0;
    }

    return pokemonTypes.includes(move.type) ? power * 1.5 : power;
}

function buildMoveGroups(moves, pokemonTypes) {
    const groups = { physical: [], special: [], status: [] };

    moves.forEach((move) => {
        groups[move.category].push(move);
    });

    ["physical", "special"].forEach((category) => {
        groups[category].sort((leftMove, rightMove) => {
            const powerDifference = getAdjustedMovePower(rightMove, pokemonTypes) - getAdjustedMovePower(leftMove, pokemonTypes);

            if (powerDifference !== 0) {
                return powerDifference;
            }

            return leftMove.name.localeCompare(rightMove.name, "ja");
        });
    });

    groups.status.sort((leftMove, rightMove) => leftMove.name.localeCompare(rightMove.name, "ja"));

    return Object.entries(groups).map(([categoryKey, categoryMoves]) => ({
        key: categoryKey,
        label: MOVE_CATEGORY_LABELS[categoryKey],
        moves: categoryMoves
    }));
}

function buildSelectedTypeMoveSuggestions(moves, selectedMoveTypes) {
    return selectedMoveTypes.map((typeName) => {
        if (!typeName) {
            return { type: "", moves: [] };
        }

        const matchingMoves = moves.filter((move) => move.type === typeName && move.category !== "status");
        const physicalMoves = matchingMoves.filter((move) => move.category === "physical").sort(sortMovesByPower);
        const specialMoves = matchingMoves.filter((move) => move.category === "special").sort(sortMovesByPower);

        const chosenMoves = [
            ...physicalMoves.slice(0, 2),
            ...specialMoves.slice(0, 2)
        ];

        if (chosenMoves.length < 4) {
            const usedMoveNames = new Set(chosenMoves.map((move) => move.name));
            const fallbackMoves = matchingMoves
                .filter((move) => !usedMoveNames.has(move.name))
                .sort(sortMovesByPower)
                .slice(0, 4 - chosenMoves.length);

            chosenMoves.push(...fallbackMoves);
        }

        return {
            type: typeName,
            moves: chosenMoves.slice(0, 4).map((move) => ({
                name: move.name,
                type: move.type,
                category: move.category,
                power: move.power ?? "-",
                tags: normalizeList(move.tags)
            }))
        };
    });
}

function buildSetupOptions(moves) {
    return SETUP_TAG_ITEMS.map((tag) => ({
        label: tag,
        active: moves.some((move) => normalizeList(move.tags).includes(tag)),
        moveNames: moves
            .filter((move) => normalizeList(move.tags).includes(tag))
            .map((move) => move.name)
    }));
}

function buildPerformanceGraph(baseStats, evioliteStats, enhancedStats, hasEviolite, hasAbilityEnhancement, performanceMode, abilityEnhancementLabel, bestAbilityNamesByStat) {
    const standardLabels = ["HP", "攻撃", "防御", "特攻", "特防", "素早さ"];
    const tankLabels = ["攻撃", "物理耐久", "特攻", "特殊耐久", "素早さ"];

    if (performanceMode === "standard") {
        const datasets = [
            { label: "種族値", stroke: "#1d72ff", fill: "rgba(29,114,255,0.22)", values: [baseStats.hp, baseStats.atk, baseStats.def, baseStats.spa, baseStats.spd, baseStats.spe] }
        ];

        if (hasEviolite) {
            datasets.push({ label: "しんかのきせき", stroke: "#b28cff", fill: "rgba(178,140,255,0.18)", values: [evioliteStats.hp, evioliteStats.atk, evioliteStats.def, evioliteStats.spa, evioliteStats.spd, evioliteStats.spe] });
        }

        if (hasAbilityEnhancement) {
            datasets.push({
                label: abilityEnhancementLabel,
                stroke: "#ff8a1f",
                fill: "rgba(255,138,31,0.18)",
                values: [enhancedStats.hp, enhancedStats.atk, enhancedStats.def, enhancedStats.spa, enhancedStats.spd, enhancedStats.spe],
                infoLabels: [
                    buildAbilityActivatedLabel(bestAbilityNamesByStat.hp),
                    buildAbilityActivatedLabel(bestAbilityNamesByStat.atk),
                    buildAbilityActivatedLabel(bestAbilityNamesByStat.def),
                    buildAbilityActivatedLabel(bestAbilityNamesByStat.spa),
                    buildAbilityActivatedLabel(bestAbilityNamesByStat.spd),
                    buildAbilityActivatedLabel(bestAbilityNamesByStat.spe)
                ]
            });
        }

        return {
            labels: standardLabels,
            baseValues: [baseStats.hp, baseStats.atk, baseStats.def, baseStats.spa, baseStats.spd, baseStats.spe],
            datasets,
            maxValue: 200,
            tickLabels: [
                { label: "50", y: 182 },
                { label: "100", y: 149 },
                { label: "150", y: 116 },
                { label: "200", y: 83 }
            ]
        };
    }

    const baseTankValues = [
        baseStats.atk,
        calculateRootDurability(baseStats.hp, baseStats.def),
        baseStats.spa,
        calculateRootDurability(baseStats.hp, baseStats.spd),
        baseStats.spe
    ];
    const tankDatasets = [
        { label: "種族値", stroke: "#1d72ff", fill: "rgba(29,114,255,0.22)", values: baseTankValues.map((value) => floorStat(value)) }
    ];

    if (hasEviolite) {
        tankDatasets.push({
            label: "しんかのきせき",
            stroke: "#b28cff",
            fill: "rgba(178,140,255,0.18)",
            values: [
                evioliteStats.atk,
                calculateRootDurability(evioliteStats.hp, evioliteStats.def),
                evioliteStats.spa,
                calculateRootDurability(evioliteStats.hp, evioliteStats.spd),
                evioliteStats.spe
            ].map((value) => floorStat(value))
        });
    }

    if (hasAbilityEnhancement) {
        tankDatasets.push({
            label: abilityEnhancementLabel,
            stroke: "#ff8a1f",
            fill: "rgba(255,138,31,0.18)",
            values: [
                enhancedStats.atk,
                calculateRootDurability(enhancedStats.hp, enhancedStats.def),
                enhancedStats.spa,
                calculateRootDurability(enhancedStats.hp, enhancedStats.spd),
                enhancedStats.spe
            ].map((value) => floorStat(value)),
            infoLabels: [
                buildAbilityActivatedLabel(bestAbilityNamesByStat.atk),
                buildAbilityActivatedLabel([...bestAbilityNamesByStat.hp, ...bestAbilityNamesByStat.def]),
                buildAbilityActivatedLabel(bestAbilityNamesByStat.spa),
                buildAbilityActivatedLabel([...bestAbilityNamesByStat.hp, ...bestAbilityNamesByStat.spd]),
                buildAbilityActivatedLabel(bestAbilityNamesByStat.spe)
            ]
        });
    }

    return {
        labels: tankLabels,
        baseValues: baseTankValues,
        datasets: tankDatasets,
        maxValue: 200,
        tickLabels: [
            { label: "50", y: 182 },
            { label: "100", y: 149 },
            { label: "150", y: 116 },
            { label: "200", y: 83 }
        ]
    };
}

function getSuitabilityFormulaText(scoreKey) {
    if (scoreKey === "physicalAttacker") {
        return "cbrt(攻撃×物理耐久×特殊耐久)";
    }

    if (scoreKey === "specialAttacker") {
        return "cbrt(特攻×物理耐久×特殊耐久)";
    }

    if (scoreKey === "physicalSweeper") {
        return "sqrt(攻撃×素早さ)";
    }

    if (scoreKey === "specialSweeper") {
        return "sqrt(特攻×素早さ)";
    }

    if (scoreKey === "physicalWall") {
        return "sqrt(HP×防御)";
    }

    return "sqrt(HP×特防)";
}

function calculateSuitabilityScoreValue(scoreKey, stats) {
    const physicalDurability = Math.round(Math.sqrt(stats.hp * stats.def));
    const specialDurability = Math.round(Math.sqrt(stats.hp * stats.spd));

    if (scoreKey === "physicalAttacker") {
        return Math.round(Math.cbrt(stats.atk * physicalDurability * specialDurability));
    }

    if (scoreKey === "specialAttacker") {
        return Math.round(Math.cbrt(stats.spa * physicalDurability * specialDurability));
    }

    if (scoreKey === "physicalSweeper") {
        return Math.round(Math.sqrt(stats.atk * stats.spe));
    }

    if (scoreKey === "specialSweeper") {
        return Math.round(Math.sqrt(stats.spa * stats.spe));
    }

    if (scoreKey === "physicalWall") {
        return physicalDurability;
    }

    return specialDurability;
}

function buildSuitabilityScores(baseStats, evioliteStats, enhancedStats, hasEviolite, hasAbilityEnhancement) {

    return SUITABILITY_ITEMS.map((item) => {
        const formulaText = getSuitabilityFormulaText(item.key);
        const baseValue = calculateSuitabilityScoreValue(item.key, baseStats);
        const evioliteValue = hasEviolite ? calculateSuitabilityScoreValue(item.key, evioliteStats) : null;
        const abilityValue = hasAbilityEnhancement ? calculateSuitabilityScoreValue(item.key, enhancedStats) : null;
        let activeValue = baseValue;
        let activeTone = "base";

        if (evioliteValue != null) {
            activeValue = evioliteValue;
            if (evioliteValue !== baseValue) {
                activeTone = "eviolite";
            }
        }

        if (abilityValue != null) {
            const valueBeforeAbility = evioliteValue ?? baseValue;
            activeValue = abilityValue;
            if (abilityValue !== valueBeforeAbility) {
                activeTone = "ability";
            }
        }

        return {
            key: item.key,
            label: item.label,
            value: activeValue,
            baseValue,
            evioliteValue,
            abilityValue,
            activeTone,
            formula: formulaText,
            tooltip: `${SUITABILITY_DESCRIPTIONS[item.key] ?? ""}\n${formulaText}`
        };
    });
}

export function createInitialMoveTypes(types) {
    return [types[0] ?? "", types[1] ?? "", "", ""];
}

export function buildPokemonViewModel(pokemon, dataStore, options = {}) {
    if (!pokemon) {
        return { found: false, notFoundMessage: "該当するポケモンが見つかりません" };
    }

    const errors = [];
    const abilities = pokemon.abilities.map((abilityName) => {
        const ability = dataStore.abilityMap.get(abilityName);

        if (!ability) {
            errors.push(`特性「${abilityName}」が Ability.json に存在しないため非表示にしました。`);
        }

        return ability;
    }).filter(Boolean);

    const moves = pokemon.moves.map((moveName) => {
        const move = dataStore.moveMap.get(moveName);

        if (!move) {
            errors.push(`技「${moveName}」が Move.json に存在しないため非表示にしました。`);
        }

        return move;
    }).filter(Boolean);

    const baseStats = { ...pokemon.baseStats };
    const applyEvioliteBonus = options.applyEvioliteBonus ?? true;
    const hasEviolite = pokemon.evioliteEligible && applyEvioliteBonus;
    const evioliteMultiplier = hasEviolite ? 1.5 : 1;
    const evioliteStats = {
        hp: baseStats.hp,
        atk: baseStats.atk,
        def: applyStatMultiplier(baseStats.def, evioliteMultiplier),
        spa: baseStats.spa,
        spd: applyStatMultiplier(baseStats.spd, evioliteMultiplier),
        spe: baseStats.spe
    };

    const selectedStatModifierResult = getSelectedStatModifiers(abilities, options.selectedAbilityName);
    const bestStatModifiers = applyConditionalAbilityTypeBonus(
        selectedStatModifierResult.modifiers,
        selectedStatModifierResult.bestAbilityNamesByStat,
        selectedStatModifierResult.selectedAbilityName,
        pokemon.types
    );
    const hasAbilityEnhancement = STAT_KEYS.some((statKey) => bestStatModifiers[statKey] !== 1);
    const abilityEnhancementLabel = selectedStatModifierResult.selectedAbilityName
        ? `${selectedStatModifierResult.selectedAbilityName}発動時`
        : "特性発動時";
    const abilityBaseStats = evioliteStats;
    const enhancedStats = {
        hp: applyStatMultiplier(abilityBaseStats.hp, bestStatModifiers.hp),
        atk: applyStatMultiplier(abilityBaseStats.atk, bestStatModifiers.atk),
        def: applyStatMultiplier(abilityBaseStats.def, bestStatModifiers.def),
        spa: applyStatMultiplier(abilityBaseStats.spa, bestStatModifiers.spa),
        spd: applyStatMultiplier(abilityBaseStats.spd, bestStatModifiers.spd),
        spe: applyStatMultiplier(abilityBaseStats.spe, bestStatModifiers.spe)
    };

    const resistance = calculateResistance(pokemon.types, TYPE_CHART, ALL_TYPES);
    const resistancePoint = truncateToOneDecimal(1 + (0.05 * (
        resistance.resist05.length + (2 * (resistance.resist025.length + resistance.immune.length)) - resistance.weak2.length - (2 * resistance.weak4.length)
    )));
    const suitabilityScores = buildSuitabilityScores(baseStats, evioliteStats, enhancedStats, hasEviolite, hasAbilityEnhancement);
    const setupOptions = buildSetupOptions(moves);

    const selectedMoveTypes = options.selectedMoveTypes ?? createInitialMoveTypes(pokemon.types);
    const selectedOwnMoveTypes = selectedMoveTypes.filter((type) => pokemon.types.includes(type));
    const baseMoveTypes = selectedOwnMoveTypes.length > 0 ? selectedOwnMoveTypes : [];
    const baseMoveRange = calculateMoveRange(baseMoveTypes, TYPE_CHART, ALL_TYPES);
    const moveRange = calculateMoveRange(selectedMoveTypes, TYPE_CHART, ALL_TYPES);
    const mismatchEnhancedKeys = moveRange.cells
        .filter((cell, index) => cell.multiplier > (baseMoveRange.cells[index]?.multiplier ?? 1))
        .map((cell) => `${cell.type1}|${cell.type2}`);
    const selectedTypeMoveSuggestions = buildSelectedTypeMoveSuggestions(moves, selectedMoveTypes);
    const performanceMode = options.performanceMode ?? "standard";

    const performanceGraph = buildPerformanceGraph(
        baseStats,
        evioliteStats,
        enhancedStats,
        hasEviolite,
        hasAbilityEnhancement,
        performanceMode,
        abilityEnhancementLabel,
        selectedStatModifierResult.bestAbilityNamesByStat
    );

    const sameNoForms = dataStore.pokemonList
        .filter((candidate) => String(candidate.no) === String(pokemon.no))
        .map((candidate) => ({
            key: candidate.key,
            name: candidate.name,
            imagePath: getPokemonImagePath(candidate.imageKey),
            isCurrent: candidate.key === pokemon.key
        }));

    const forms = sameNoForms.length > 1
        ? [
            ...sameNoForms.filter((candidate) => candidate.isCurrent),
            ...sameNoForms.filter((candidate) => !candidate.isCurrent)
        ]
        : [];

    return {
        found: true,
        pokemon,
        errors,
        profile: {
            no: pokemon.no,
            name: pokemon.name,
            imagePath: getPokemonImagePath(pokemon.imageKey),
            types: pokemon.types.map((typeName) => ({ name: typeName, iconPath: getTypeImagePath(typeName) })),
            forms,
            stats: createDisplayStats(baseStats),
            point: pokemon.point
        },
        abilities: abilities.map((ability) => ({ name: ability.name, description: ability.description })),
        performanceAbilityOptions: abilities.map((ability) => ability.name),
        selectedPerformanceAbilityName: selectedStatModifierResult.selectedAbilityName,
        resistance,
        resistancePoint,
        performanceGraph,
        performanceMode,
        applyEvioliteBonus,
        evioliteEligible: Boolean(pokemon.evioliteEligible),
        suitabilityScores,
        setupOptions,
        moveRange,
        mismatchEnhancedKeys,
        selectedMoveTypes,
        selectedTypeMoveSuggestions,
        moveGroups: buildMoveGroups(moves, pokemon.types)
    };
}

export function getPokemonNames(pokemonList) {
    return pokemonList.map((pokemon) => pokemon.name);
}

export { ALL_TYPES, TYPE_IMAGE_NAMES };
