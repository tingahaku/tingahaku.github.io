export function getTypeMultiplier(attackType, defenseTypes, typeChart) {
    if (!Array.isArray(defenseTypes) || defenseTypes.length === 0) {
        return 1;
    }

    let multiplier = 1;

    defenseTypes.forEach((defenseType) => {
        const attackChart = typeChart[attackType] || {};
        const typeMultiplier = attackChart[defenseType] ?? 1;
        multiplier *= typeMultiplier;
    });

    return multiplier;
}
