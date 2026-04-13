import { getTypeMultiplier } from "./TypeCalculator.js";

export function calculateMoveRange(moveTypes, typeChart, allTypes) {
    const activeTypes = moveTypes.filter((type) => typeof type === "string" && type.trim() !== "");
    const cells = [];
    const summary = { weak4: 0, weak2: 0, resist05: 0, resist025: 0, immune: 0 };

    for (let rowIndex = 0; rowIndex < allTypes.length; rowIndex += 1) {
        const type1 = allTypes[rowIndex];

        for (let columnIndex = rowIndex; columnIndex < allTypes.length; columnIndex += 1) {
            const type2 = allTypes[columnIndex];
            const defenseTypes = type1 === type2 ? [type1] : [type1, type2];
            let multiplier = 0;

            if (activeTypes.length > 0) {
                const multipliers = activeTypes.map((attackType) => getTypeMultiplier(attackType, defenseTypes, typeChart));
                multiplier = Math.max(...multipliers);
            }

            cells.push({ type1, type2, multiplier });

            if (multiplier === 4) {
                summary.weak4 += 1;
            }

            if (multiplier === 2) {
                summary.weak2 += 1;
            }

            if (multiplier === 0.5) {
                summary.resist05 += 1;
            }

            if (multiplier === 0.25) {
                summary.resist025 += 1;
            }

            if (multiplier === 0) {
                summary.immune += 1;
            }
        }
    }

    return { cells, summary };
}
