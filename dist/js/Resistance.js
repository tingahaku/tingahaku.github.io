import { getTypeMultiplier } from "./TypeCalculator.js";

export function calculateResistance(defenseTypes, typeChart, allTypes) {
    const result = { weak4: [], weak2: [], resist05: [], resist025: [], immune: [] };

    allTypes.forEach((attackType) => {
        const multiplier = getTypeMultiplier(attackType, defenseTypes, typeChart);

        if (multiplier === 4) {
            result.weak4.push(attackType);
        }

        if (multiplier === 2) {
            result.weak2.push(attackType);
        }

        if (multiplier === 0.5) {
            result.resist05.push(attackType);
        }

        if (multiplier === 0.25) {
            result.resist025.push(attackType);
        }

        if (multiplier === 0) {
            result.immune.push(attackType);
        }
    });

    return result;
}
