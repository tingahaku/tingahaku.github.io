function roundToTwoDecimals(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatAxisValue(value) {
    return Number.isInteger(value) ? String(value) : String(roundToTwoDecimals(value));
}

function buildPolygonPoints(values, maxValue, centerX, centerY, radius) {
    const startAngle = values.length === 5 ? -54 : -90;
    return values.map((value, index) => {
        const angle = (startAngle + (360 / values.length) * index) * (Math.PI / 180);
        const distance = radius * (value / maxValue);
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        return `${roundToTwoDecimals(x)},${roundToTwoDecimals(y)}`;
    }).join(" ");
}

function buildAxisItems(labels, baseValues, centerX, centerY, radius) {
    const startAngle = labels.length === 5 ? -54 : -90;
    const labelDistance = labels.length === 5 ? radius + 18 : radius + 27;
    const labelOffsetY = labels.length === 5 ? -10 : -4;
    const valueOffsetY = labels.length === 5 ? 15 : 24;
    return labels.map((label, index) => {
        const angle = (startAngle + (360 / labels.length) * index) * (Math.PI / 180);
        const lineDistance = radius;
        const lineX = centerX + Math.cos(angle) * lineDistance;
        const lineY = centerY + Math.sin(angle) * lineDistance;
        const labelX = centerX + Math.cos(angle) * labelDistance;
        const labelY = centerY + Math.sin(angle) * labelDistance;

        return {
            label,
            value: baseValues[index],
            lineX: roundToTwoDecimals(lineX),
            lineY: roundToTwoDecimals(lineY),
            labelX: roundToTwoDecimals(labelX),
            labelY: roundToTwoDecimals(labelY + labelOffsetY),
            valueX: roundToTwoDecimals(labelX),
            valueY: roundToTwoDecimals(labelY + valueOffsetY)
        };
    });
}

function buildGrid(valuesCount, maxValue, centerX, centerY, radius) {
    const steps = [0.25, 0.5, 0.75, 1];
    return steps.map((step) => {
        const values = Array.from({ length: valuesCount }, () => maxValue * step);
        return buildPolygonPoints(values, maxValue, centerX, centerY, radius);
    });
}

function reorderGraphState(graphState) {
    if (graphState.labels.length === 6) {
        const order = [0, 1, 2, 5, 4, 3];
        return {
            ...graphState,
            labels: ["HP", "攻撃", "防御", "素早さ", "特防", "特攻"],
            baseValues: order.map((index) => graphState.baseValues?.[index] ?? ""),
            datasets: graphState.datasets.map((dataset) => ({
                ...dataset,
                values: order.map((index) => dataset.values[index]),
                infoLabels: dataset.infoLabels ? order.map((index) => dataset.infoLabels[index] ?? "") : undefined
            }))
        };
    }

    if (graphState.labels.length === 5) {
        const order = [0, 1, 4, 3, 2];
        return {
            ...graphState,
            labels: ["攻撃", "物理耐久", "素早さ", "特殊耐久", "特攻"],
            baseValues: order.map((index) => graphState.baseValues?.[index] ?? ""),
            datasets: graphState.datasets.map((dataset) => ({
                ...dataset,
                values: order.map((index) => dataset.values[index]),
                infoLabels: dataset.infoLabels ? order.map((index) => dataset.infoLabels[index] ?? "") : undefined
            }))
        };
    }

    return graphState;
}

export function renderPerformanceGraph(graphState) {
    const displayState = reorderGraphState(graphState);
    const labels = displayState.labels;
    const centerX = 230;
    const centerY = 214;
    const radius = 160;
    const maxValue = displayState.maxValue;
    const gridPolygons = buildGrid(labels.length, maxValue, centerX, centerY, radius);
    const axisItems = buildAxisItems(labels, displayState.baseValues ?? [], centerX, centerY, radius);

    const datasetMarkup = displayState.datasets.map((dataset) => {
        const points = buildPolygonPoints(dataset.values, maxValue, centerX, centerY, radius);
        return `
            <polygon points="${points}" fill="${dataset.fill}" stroke="${dataset.stroke}" stroke-width="3" />
            <polyline points="${points}" fill="none" stroke="${dataset.stroke}" stroke-width="3" />
        `;
    }).join("");

    const axisMarkup = axisItems.map(({ lineX, lineY }) => `
        <line x1="${centerX}" y1="${centerY}" x2="${lineX}" y2="${lineY}" stroke="rgba(122,100,68,0.3)" stroke-width="1.2" />
    `).join("");

    const labelMarkup = axisItems.map(({ label, labelX, labelY, value, valueX, valueY }, index) => {
        const affectedValues = displayState.datasets
            .slice(1)
            .filter((dataset) => dataset.values[index] !== value)
            .map((dataset, datasetIndex) => `
                <text
                    x="${valueX}"
                    y="${valueY + ((datasetIndex + 1) * 19)}"
                    fill="${dataset.stroke}"
                    font-size="16"
                    font-weight="800"
                    text-anchor="middle"
                    dominant-baseline="middle"
                >${escapeText(formatAxisValue(dataset.values[index]))}</text>
            `)
            .join("");

        return `
            <text x="${labelX}" y="${labelY}" fill="#3f3122" font-size="23" font-weight="800" text-anchor="middle" dominant-baseline="middle">${label}</text>
            <text x="${valueX}" y="${valueY}" fill="#6e5840" font-size="20" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeText(formatAxisValue(value))}</text>
            ${affectedValues}
        `;
    }).join("");

    return `
        <svg viewBox="0 0 460 438" role="img" aria-label="能力グラフ">
            <rect x="0" y="0" width="460" height="438" rx="26" fill="rgba(255,253,248,0.96)" />
            ${gridPolygons.map((points) => `<polygon points="${points}" fill="none" stroke="rgba(122,100,68,0.15)" stroke-width="1.2" />`).join("")}
            ${axisMarkup}
            ${datasetMarkup}
            ${labelMarkup}
        </svg>
    `;
}

function escapeText(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}
