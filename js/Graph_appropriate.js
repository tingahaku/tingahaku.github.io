function roundToTwoDecimals(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getAppropriateMax(scores) {
    const maxScore = Math.max(...scores.map((score) => score.value), 1);
    return roundToTwoDecimals(maxScore * 1.12);
}

export function getAppropriateWidth(value, maxValue) {
    const minValue = 50;
    const normalized = ((value - minValue) / (maxValue - minValue)) * 100;
    return roundToTwoDecimals(Math.max(0, normalized));
}
