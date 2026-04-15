import { renderPerformanceGraph } from "./Graph_performance.js";
import { getAppropriateWidth } from "./Graph_appropriate.js";
import { ALL_TYPES, TYPE_IMAGE_NAMES } from "./Stats.js";
import { resolveAppUrl } from "./AppPaths.js";

function escapeHtml(value) {
    const normalized = String(value ?? "")
        .replaceAll("`n", "\n")
        .replaceAll("\\n", "\n")
        .replace(/\r\n?/g, "\n");

    return normalized
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function getAdaptiveFontSize(text, baseRem, minRem, threshold, stepRem) {
    const length = [...String(text ?? "")].length;
    const overflow = Math.max(0, length - threshold);
    return `${Math.max(minRem, baseRem - (overflow * stepRem)).toFixed(2)}rem`;
}

function getTypeIconPath(typeName) {
    const fileName = TYPE_IMAGE_NAMES[typeName];
    return typeFileNameOrEmpty(fileName);
}

function typeFileNameOrEmpty(fileName) {
    return fileName ? resolveAppUrl(`assets/types/${fileName}.png`) : "";
}

function getPokemonImagePath(imageKey) {
    return resolveAppUrl(`assets/pokemon/${String(imageKey)}.png`);
}

function renderTypeBadge(type) {
    const iconMarkup = type.iconPath
        ? `<img class="type-badge__icon" src="${type.iconPath}" alt="${escapeHtml(type.name)}">`
        : `<span class="type-badge__fallback">${escapeHtml(type.name.slice(0, 1))}</span>`;
    return `<span class="type-badge" title="${escapeHtml(type.name)}" aria-label="${escapeHtml(type.name)}">${iconMarkup}</span>`;
}

function renderTypeIconList(values) {
    if (values.length === 0) {
        return `<p class="resistance-card__empty">-</p>`;
    }

    return `<div class="type-icon-list">${values.map((value) => renderTypeBadge({ name: value, iconPath: getTypeIconPath(value) })).join("")}</div>`;
}

function renderResistanceValue(values) {
    if (values.length === 0) {
        return `<p class="resistance-card__empty">-</p>`;
    }

    return `<p class="resistance-card__value">${escapeHtml(values[0])}</p>`;
}

function renderResistanceMeter(value, maxValue, tone = "warm") {
    const safeMax = Math.max(1, maxValue);
    const width = Math.max(0, Math.min(100, (value / safeMax) * 100));
    return `
        <div class="resistance-card__meter" aria-hidden="true">
            <div class="resistance-card__meter-fill resistance-card__meter-fill--${escapeHtml(tone)}" style="width:${width}%"></div>
        </div>
    `;
}

function getMoveRangeSummary(moveRange, countDuplicates) {
    if (!countDuplicates) {
        return moveRange.summary;
    }

    return moveRange.cells.reduce((summary, cell) => {
        const weight = cell.type1 === cell.type2 ? 1 : 2;

        if (cell.multiplier === 4) {
            summary.weak4 += weight;
        }

        if (cell.multiplier === 2) {
            summary.weak2 += weight;
        }

        if (cell.multiplier === 0.5) {
            summary.resist05 += weight;
        }

        if (cell.multiplier === 0.25) {
            summary.resist025 += weight;
        }

        if (cell.multiplier === 0) {
            summary.immune += weight;
        }

        return summary;
    }, { weak4: 0, weak2: 0, resist05: 0, resist025: 0, immune: 0 });
}

function renderResistanceCard(title, value, maxValue) {
    const match = title.match(/^(4倍|2倍|0\.5倍|0\.25倍|無効)(.*)$/);
    const lead = match?.[1] ?? title;
    const meterToneMap = {
        "4倍": "x4",
        "2倍": "x2",
        "0.5倍": "x05",
        "0.25倍": "x025",
        "無効": "immune"
    };
    const meterTone = meterToneMap[lead] ?? "x2";
    return `
        <div class="resistance-card resistance-card--${escapeHtml(meterTone)}">
            <h4>
                <span class="resistance-card__title-main">${escapeHtml(formatResistanceLabel(lead))}</span>
            </h4>
            ${renderResistanceValue([String(value)])}
            ${renderResistanceMeter(value, maxValue, meterTone)}
        </div>
    `;
}

function formatResistanceLabel(label) {
    const labelMap = {
        "4倍": "★4倍",
        "2倍": "◎2倍",
        "0.5倍": "△0.5倍",
        "0.25倍": "▼0.25倍",
        "無効": "✕0倍"
    };

    return labelMap[label] ?? label;
}

function formatHeatmapCellValue(multiplier) {
    const symbolMap = new Map([
        [4, "☆"],
        [2, "○"],
        [1, ""],
        [0.5, "△"],
        [0.25, "▽"],
        [0, "✕"]
    ]);

    return symbolMap.get(multiplier) ?? String(multiplier);
}

function renderHeatmapCellMark(multiplier) {
    const symbol = formatHeatmapCellValue(multiplier);
    return symbol ? `<span class="heatmap__mark">${escapeHtml(symbol)}</span>` : "";
}

function renderResistanceRows(resistance) {
    const rows = [
        { label: "4倍", tone: "x4", values: resistance.weak4 },
        { label: "2倍", tone: "x2", values: resistance.weak2 },
        { label: "0.5倍", tone: "x05", values: resistance.resist05 },
        { label: "0.25倍", tone: "x025", values: resistance.resist025 },
        { label: "無効", tone: "immune", values: resistance.immune }
    ];

    return rows.map((row) => `
        ${row.label === "0.5倍" ? `<div class="resistance-section-title">耐性</div>` : ""}
        <div class="resistance-row" data-tone="${escapeHtml(row.tone)}" data-label="${escapeHtml(row.label)}">
            <div class="resistance-row__label">${escapeHtml(formatResistanceLabel(row.label))}</div>
            <div class="resistance-row__body">${renderTypeIconList(row.values)}</div>
        </div>
    `).join("");
}

function renderAbilitySlots(abilities) {
    const visibleAbilities = abilities.slice(0, 3);
    const placeholders = Array.from(
        { length: Math.max(0, 3 - visibleAbilities.length) },
        () => ({ name: "-", description: "-" })
    );

    return [...visibleAbilities, ...placeholders].map((ability) => `
        <article class="ability-card">
            <h4 class="ability-card__name">${escapeHtml(ability.name)}</h4>
            <p class="ability-card__desc">${escapeHtml(ability.description)}</p>
        </article>
    `).join("");
}

function interpolateHexColor(startColor, endColor, ratio) {
    const safeRatio = Math.max(0, Math.min(1, ratio));
    const start = startColor.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16));
    const end = endColor.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16));
    const mixed = start.map((value, index) => Math.round(value + ((end[index] - value) * safeRatio)));
    return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function formatDisplayNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function getMovePowerColor(power) {
    const numericPower = Number(power);

    if (!Number.isFinite(numericPower)) {
        return "#6b778c";
    }

    if (numericPower <= 60) {
        return "#2f9b4b";
    }

    if (numericPower <= 61) {
        return "#d6b300";
    }

    if (numericPower <= 150) {
        return interpolateHexColor("d6b300", "d73a32", (numericPower - 61) / 89);
    }

    if (numericPower <= 180) {
        return interpolateHexColor("d73a32", "8c2f8f", (numericPower - 150) / 30);
    }

    return "#8c2f8f";
}

function getMoveAccuracyColor(accuracy) {
    const numericAccuracy = Number(accuracy);

    if (!Number.isFinite(numericAccuracy)) {
        return "#6b778c";
    }

    if (numericAccuracy <= 50) {
        return "#d6b300";
    }

    if (numericAccuracy <= 100) {
        return interpolateHexColor("d6b300", "d73a32", (numericAccuracy - 50) / 50);
    }

    return "#d73a32";
}

function renderMoveStats(move, pokemonTypeNames) {
    const numericPower = Number(move.power);
    const hasNumericPower = Number.isFinite(numericPower);
    const hasStab = hasNumericPower && move.category !== "status" && pokemonTypeNames.includes(move.type);
    const adjustedPowerValue = hasStab ? numericPower * 1.5 : numericPower;
    const adjustedPower = hasStab ? String(Math.floor(adjustedPowerValue)) : "";

    return `
        <span class="move-card__stat move-card__stat--power">
            威力${escapeHtml(move.power ?? "-")}${hasStab ? `<span class="move-card__stab">(${escapeHtml(adjustedPower)})</span>` : ""}
        </span>
        <span class="move-card__stat move-card__stat--accuracy">命中${escapeHtml(move.accuracy ?? "-")}</span>
    `;
}

function renderMoveGroups(moveGroups, pokemonTypeNames) {
    return moveGroups.map((group) => `
        <section class="move-column">
            ${group.moves.length > 0 ? group.moves.map((move) => `
                <article class="move-card">
                    <div class="move-card__head">
                        <div class="move-card__name-box">
                            <h4 class="move-card__name">${escapeHtml(move.name)}</h4>
                        </div>
                        <div class="move-card__info">
                            <div class="move-card__icons">
                                <img class="move-card__type-icon" src="${getTypeIconPath(move.type)}" alt="${escapeHtml(move.type)}">
                            </div>
                            <div class="move-card__stats">
                                ${renderMoveStats(move, pokemonTypeNames)}
                            </div>
                        </div>
                    </div>
                    <p class="move-card__desc">${escapeHtml(move.description || "")}</p>
                </article>
            `).join("") : `<p class="empty-text">該当する技はありません。</p>`}
        </section>
    `).join("");
}

function renderMoveCategoryTabs(activeMoveCategory) {
    const tabs = [
        { key: "physical", label: "物理" },
        { key: "special", label: "特殊" },
        { key: "status", label: "変化" }
    ];

    return `
        <div class="move-tabs" role="tablist" aria-label="覚える技の分類">
            ${tabs.map((tab) => `
                <button
                    class="move-tab ${activeMoveCategory === tab.key ? "move-tab--active" : ""}"
                    type="button"
                    data-move-category="${tab.key}"
                ><span>${tab.label}</span></button>
            `).join("")}
        </div>
    `;
}

function renderSetupOptions(setupOptions) {
    return `
        <div class="setup-options">
            ${setupOptions.map((option) => `
                <span
                    class="setup-chip ${option.active ? "setup-chip--active" : "setup-chip--inactive"}"
                    ${option.moveNames?.length ? `data-tooltip="${escapeHtml(option.moveNames.join("\n"))}"` : ""}
                >${escapeHtml(option.label)}</span>
            `).join("")}
        </div>
    `;
}

function renderSelectedTypeMovePreview(entry) {
    if (!entry?.type) {
        return `<div class="range-move-preview"><p class="range-move-preview__empty">-</p></div>`;
    }

    if (entry.moves.length === 0) {
        return `<div class="range-move-preview"><p class="range-move-preview__empty">該当技なし</p></div>`;
    }

    return `
        <div class="range-move-preview">
            ${entry.moves.map((move) => `
                <div class="range-move-preview__item">
                    <span class="range-move-preview__main">
                        <img class="range-move-preview__type-icon" src="${getTypeIconPath(move.type)}" alt="${escapeHtml(move.type)}">
                        <span class="range-move-preview__name">${escapeHtml(move.name)}</span>
                    </span>
                    <span class="range-move-preview__meta">
                        <span class="range-move-preview__power">威力${escapeHtml(move.power)}</span>
                    </span>
                </div>
            `).join("")}
        </div>
    `;
}

function renderHeatmap(moveRange, showDuplicateGrey, mismatchEnhancedKeys, showMismatchHighlight) {
    const cellMap = new Map(moveRange.cells.map((cell) => [`${cell.type1}|${cell.type2}`, cell]));
    const mismatchKeySet = new Set(mismatchEnhancedKeys);
    const summary = getMoveRangeSummary(moveRange, !showDuplicateGrey);
    const summaryMax = !showDuplicateGrey ? ALL_TYPES.length * ALL_TYPES.length : (ALL_TYPES.length * (ALL_TYPES.length + 1)) / 2;
    const headers = ALL_TYPES.map((type) => `<th data-type="${escapeHtml(type)}">${escapeHtml(type)}</th>`).join("");
    const rows = ALL_TYPES.map((rowType, rowIndex) => {
        const columns = ALL_TYPES.map((columnType, columnIndex) => {
            const key = rowIndex <= columnIndex ? `${rowType}|${columnType}` : `${columnType}|${rowType}`;
            const cell = cellMap.get(key);
            const multiplier = cell?.multiplier ?? 1;
            const tier = multiplier === 0 ? "0" : String(multiplier).replace(".", "");
            const isDuplicate = rowIndex > columnIndex;
            const duplicateClass = showDuplicateGrey && isDuplicate ? " heatmap__cell--duplicate" : "";
            const mismatchClass = showMismatchHighlight && mismatchKeySet.has(key) && !(showDuplicateGrey && isDuplicate) ? " heatmap__cell--mismatch" : "";
            const primaryType = cell?.type1 ?? rowType;
            const secondaryType = cell?.type2 ?? columnType;
            const tooltipLabel = primaryType === secondaryType ? primaryType : `${primaryType}・${secondaryType}`;
            const tooltipText = `${tooltipLabel}\n${multiplier}倍`;
            return `<td class="heatmap__cell${duplicateClass}${mismatchClass}" data-tier="${tier}" data-tooltip="${escapeHtml(tooltipText)}">${renderHeatmapCellMark(multiplier)}</td>`;
        }).join("");
        return `<tr><th class="heatmap__label" data-type="${escapeHtml(rowType)}">${escapeHtml(rowType)}</th>${columns}</tr>`;
    }).join("");

    return `
        <div class="range-top">
            <div class="heatmap-wrap">
                <table class="heatmap">
                    <thead>
                        <tr>
                            <th class="heatmap__corner">防御側</th>${headers}
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="resistance-grid resistance-grid--summary">
                <button class="button-switch button-switch--summary ${showDuplicateGrey ? "button-switch--summary-off" : "button-switch--summary-on"}" type="button" data-toggle-duplicate-grey>重複もカウント</button>
                <button class="button-switch button-switch--summary ${showMismatchHighlight ? "button-switch--summary-on" : "button-switch--summary-off"}" type="button" data-toggle-mismatch-highlight>サブ範囲を強調</button>
                ${renderResistanceCard("4倍", summary.weak4, summaryMax)}
                ${renderResistanceCard("2倍", summary.weak2, summaryMax)}
                ${renderResistanceCard("0.5倍", summary.resist05, summaryMax)}
                ${renderResistanceCard("0.25倍", summary.resist025, summaryMax)}
                ${renderResistanceCard("無効", summary.immune, summaryMax)}
            </div>
        </div>
    `;
}

function renderShell(content) {
    return `
        <div class="page-shell">
            <main class="layout-main">${content}</main>
            <footer class="site-footer">
                <p class="site-footer__line"><a href="${resolveAppUrl("guidelines/")}">配信・利用ガイドライン＆利用規約</a> / <a href="${resolveAppUrl("privacy/")}">プライバシーポリシー</a></p>
                <p class="site-footer__line">不具合やご意見はこちらからお送りください↓<br><a href="https://docs.google.com/forms/d/e/1FAIpQLSfoC5o93L9gQ--IorPNvyev5Lz-UOG0Ne_ccb3cnfltmdeHUg/viewform?usp=publish-editor" target="_blank" rel="noopener noreferrer">https://docs.google.com/forms/d/e/1FAIpQLSfoC5o93L9gQ--IorPNvyev5Lz-UOG0Ne_ccb3cnfltmdeHUg/viewform?usp=publish-editor</a><br></p>
                <p class="site-footer__line">本サービスでは、ゲーム内の数値やデータについて以下のサイトを参考にさせていただいています。</p>
                <p class="site-footer__line">・ポケモン徹底攻略<br><a href="https://yakkun.com/" target="_blank" rel="noopener noreferrer">https://yakkun.com/</a></p>
                <p class="site-footer__line">各データの権利はそれぞれの権利者に帰属します。<br>情報の整理・再構成は本サービス独自に行っています。</p>
                <p class="site-footer__line"><br>ポケグラフ管理者:チンアナゴ画伯</p>
            </footer>
        </div>
    `;
}

function renderHero(appState, statusText, isError) {
    return `
        <section class="hero">
            <div class="hero__top">
                <div class="hero__header">
                    <div class="hero__copy">
                        <h1 class="hero__title"><a class="hero__logo-link" href="${resolveAppUrl("")}">ポケグラフ</a></h1>
                        <p class="hero__sub">チャンピオンズ対応/グラフでわかるポケモンの強さと特徴</p>
                    </div>
                    <div class="search" data-search-root>
                        <div class="search__box">
                            <div class="search__row">
                                <div class="search__field">
                                    <button class="search__peek" type="button" data-search-preview>
                                        <div class="search__peek-window">
                                            <img class="search__peek-image" data-search-preview-image alt="" hidden>
                                            <span class="search__peek-text" data-search-preview-text></span>
                                        </div>
                                    </button>
                                    <input class="search__input" type="text" placeholder="ポケモン名を入力" value="${escapeHtml(appState.searchInput)}">
                                </div>
                                <button class="search__action" type="button" data-search-submit>検索</button>
                            </div>
                            <div class="search__suggestions" ${appState.suggestions.length > 0 ? "" : "hidden"}>
                                ${appState.suggestions.map((pokemon) => `
                                    <button class="search__button" type="button" data-suggestion-key="${escapeHtml(pokemon.key)}">
                                        <span class="search__button-label">${escapeHtml(pokemon.name)}</span>
                                        <img class="search__button-icon" src="${getPokemonImagePath(pokemon.imageKey)}" alt="${escapeHtml(pokemon.name)}">
                                    </button>
                                `).join("")}
                            </div>
                        </div>
                        <div class="search__status ${isError ? "search__status--error" : ""}">${escapeHtml(statusText)}</div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderFeaturedSidebar(appState) {
    if (!appState.featuredPokemon?.length) {
        return "";
    }

    return `
        <aside class="featured-sidebar featured-sidebar--left" aria-label="注目のポケモン">
            <div class="featured-sidebar__panel">
                <div class="featured-sidebar__title">注目のポケモン</div>
                <div class="featured-sidebar__list">
                    ${appState.featuredPokemon.map((pokemon, index) => `
                        <button class="featured-sidebar__item" type="button" data-featured-key="${escapeHtml(pokemon.key)}">
                            <span class="featured-sidebar__rank">${index + 1}</span>
                            <img class="featured-sidebar__icon" src="${getPokemonImagePath(pokemon.imageKey)}" alt="${escapeHtml(pokemon.name)}">
                            <span class="featured-sidebar__name" style="font-size:${getAdaptiveFontSize(pokemon.name, 0.74, 0.46, 8, 0.04)}">${escapeHtml(pokemon.name)}</span>
                        </button>
                    `).join("")}
                </div>
            </div>
        </aside>
    `;
}

function renderLandingContent(appState) {
    return `
        ${renderHero(appState, appState.searchStatus, appState.searchStatusType === "error")}
        <div class="content-area">
            ${renderFeaturedSidebar(appState)}
            <div class="content-grid">
                <section class="panel landing-panel">
                    <div class="panel__header">
                        <h3 class="panel__title">ポケグラフへようこそ</h3>
                    </div>
                    <p class="point-text">ポケモンを検索することで特性発動時の能力や色んな適正、技範囲などをグラフでわかりやすく把握できるサイトです。</p>
                </section>
                <section class="panel landing-panel landing-panel--guide">
                    <div class="panel__header">
                        <h3 class="panel__title">各パネルでわかること</h3>
                    </div>
                    <dl class="landing-guide-list">
                        <div class="landing-guide-item">
                            <dt class="landing-guide-item__title">基本情報</dt>
                            <img class="landing-guide-item__image" src="${resolveAppUrl("assets/ui/gyarados-basic-info.png")}" alt="ギャラドスの基本情報パネル">
                            <dd class="landing-guide-item__desc">ポケモンのタイプや特性の詳細、弱点タイプなどを表示します。メガシンカやフォルムチェンジが存在するポケモンの場合は、ここからフォルム違いの記事に飛ぶこともできます。</dd>
                        </div>
                        <div class="landing-guide-item">
                            <dt class="landing-guide-item__title">能力</dt>
                            <img class="landing-guide-item__image" src="${resolveAppUrl("assets/ui/gyarados-performance.png")}" alt="ギャラドスの能力パネル">
                            <dd class="landing-guide-item__desc">種族値と特性発動時の差分をレーダーチャートで比較し、火力や耐久の傾向を確認できます。オレンジ色で表示されているグラフと数値が特性発動時の数値です。<br>どの特性を発動させるか選択できるほか、HPと防御or特防を統合することで物理耐久、特殊耐久をそれぞれ把握しやすく表示できます。<br><span class="landing-guide-item__note">※段階的に発動する特性（そうしょく など）は一回発動した時点での倍率を表示しています</span><br><span class="landing-guide-item__note">※特性の発動によって下がる能力（くだけるよろい発動時の防御など）は考慮されておりません。</span><br><span class="landing-guide-item__note">※倍率は各ステータス極振り・性格補正無しの場合を想定して計算しています。</span></dd>
                        </div>
                        <div class="landing-guide-item">
                            <dt class="landing-guide-item__title">適正</dt>
                            <img class="landing-guide-item__image" src="${resolveAppUrl("assets/ui/gyarados-suitability.png")}" alt="ギャラドスの適正パネル">
                            <dd class="landing-guide-item__desc">能力を元にポケモンの適正を計算して表示します。能力パネルで特性を選択している場合、その能力を参照した値を表示します。元の能力での適正を詳しく知りたい場合は能力パネルで『未選択』を選択してください。<br>また、パネル下部では起点作成に使われることの多い技の中でどのような技を覚えるか表示しています。<br><span class="landing-guide-item__note">※数値はあくまで目安です。実際の適正は各ポケモンのタイプや技、環境によって変動します。</span></dd>
                        </div>
                        <div class="landing-guide-item landing-guide-item--range">
                            <dt class="landing-guide-item__title">技範囲</dt>
                            <img class="landing-guide-item__image" src="${resolveAppUrl("assets/ui/gyarados-range.png")}" alt="ギャラドスの技範囲パネル">
                            <dd class="landing-guide-item__desc">選んだタイプの攻撃技でどのくらいの相手に対応できるかをヒートマップで表示します。覚える技のうち選択したタイプの攻撃技も合わせて表示します。重複した複合タイプ（くさ-あく あく-くさ など）の表示/非表示、タイプ一致ではないサブウェポン有効範囲の強調表示/非表示も設定できます。<br><span class="landing-guide-item__note">※特殊なタイプ相性の特性や技には対応していません</span></dd>
                        </div>
                        <div class="landing-guide-item landing-guide-item--moves">
                            <dt class="landing-guide-item__title">覚える技</dt>
                            <img class="landing-guide-item__image" src="${resolveAppUrl("assets/ui/gyarados-moves.png")}" alt="ギャラドスの覚える技パネル">
                            <dd class="landing-guide-item__desc">物理・特殊・変化ごとに、威力や命中とあわせて素早くチェックできます。並びは威力の降順です（タイプ一致補正込み）。</dd>
                        </div>
                    </dl>
                </section>
            </div>
        </div>
    `;
}

export function renderAppHtml(viewModel, appState) {
    if (viewModel?.isLanding) {
        return renderShell(renderLandingContent(appState));
    }

    if (!viewModel.found) {
        return renderShell(`
            ${renderHero(appState, viewModel.notFoundMessage, true)}
        `);
    }

    const appropriateMax = 200;
    const errorMarkup = viewModel.errors.length > 0 ? `
        <section class="panel error-panel">
            <h3>データエラー</h3>
            <ul class="error-list">${viewModel.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>
        </section>
    ` : "";

    return renderShell(`
        ${renderHero(appState, appState.searchStatus, appState.searchStatusType === "error")}
        <div class="content-area">
            ${renderFeaturedSidebar(appState)}
            <div class="content-grid">
                <div class="panel-stack">
                <section class="panel panel--profile">
                    <div class="panel__header">
                        <h3 class="panel__title">基本情報</h3>
                    </div>
                    <div class="profile">
                        <div class="profile__summary">
                            <div class="profile__media">
                                <div class="profile__identity">
                                    <span class="profile__no">No.${escapeHtml(viewModel.profile.no)}</span>
                                    <h2 class="profile__name" style="font-size:${getAdaptiveFontSize(viewModel.profile.name, 1.2, 0.72, 8, 0.07)}">${escapeHtml(viewModel.profile.name)}</h2>
                                </div>
                                <div class="profile__image-wrap">
                                    <img class="profile__image" src="${viewModel.profile.imagePath}" alt="${escapeHtml(viewModel.profile.name)}">
                                </div>
                                <div class="type-list">${viewModel.profile.types.map((type) => renderTypeBadge(type)).join("")}</div>
                            </div>
                            <div class="profile__details">
                                <div class="profile__abilities-title">特性</div>
                                <div class="profile__abilities">
                                    ${renderAbilitySlots(viewModel.abilities)}
                                </div>
                            </div>
                        </div>
                        ${viewModel.profile.forms.length > 0 ? `
                            <div class="profile__forms-section">
                                <div class="profile__forms-title">フォルム</div>
                                <div class="profile__forms">
                                    ${viewModel.profile.forms.map((form) => `
                                            <button class="profile-form ${form.isCurrent ? "profile-form--current" : ""}" type="button" data-featured-key="${escapeHtml(form.key)}" ${form.isCurrent ? "aria-current=\"true\"" : ""}>
                                                <img class="profile-form__icon" src="${form.imagePath}" alt="${escapeHtml(form.name)}">
                                                <span class="profile-form__name">${escapeHtml(form.name)}</span>
                                            </button>
                                        `).join("")}
                                </div>
                            </div>
                        ` : ""}
                        <div class="resistance-panel">
                            <div class="resistance-panel__title">弱点</div>
                            ${renderResistanceRows(viewModel.resistance)}
                        </div>
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
                                <button class="button-switch button-switch--chart ${viewModel.performanceMode === "tank" ? "button-switch--summary-on" : "button-switch--summary-off"}" type="button" data-toggle-performance>HPを統合</button>
                                ${viewModel.evioliteEligible ? `<button class="button-switch button-switch--chart ${viewModel.applyEvioliteBonus ? "button-switch--summary-on" : "button-switch--summary-off"}" type="button" data-toggle-eviolite>しんかのきせき</button>` : ""}
                                <select class="chart-ability-select" data-select-performance-ability>
                                    <option value="" ${viewModel.selectedPerformanceAbilityName === "" ? "selected" : ""}>未選択</option>
                                    ${viewModel.performanceAbilityOptions.length > 0
        ? viewModel.performanceAbilityOptions.map((abilityName) => `
                                        <option value="${escapeHtml(abilityName)}" ${abilityName === viewModel.selectedPerformanceAbilityName ? "selected" : ""}>${escapeHtml(abilityName)}</option>
                                    `).join("")
        : `<option value="">特性なし</option>`}
                                </select>
                            </div>
                            ${renderPerformanceGraph(viewModel.performanceGraph)}
                            <div class="legend legend--in-chart">
                                ${viewModel.performanceGraph.datasets.map((dataset) => `<span class="legend__item"><span class="legend__line" style="background:${dataset.stroke}"></span>${escapeHtml(dataset.label)}</span>`).join("")}
                            </div>
                        </div>
                    </section>

                    <section class="panel panel--scores">
                        <div class="panel__header">
                            <h3 class="panel__title">適正</h3>
                        </div>
                        <div class="appropriate-list">
                            ${viewModel.suitabilityScores.map((score) => `
                                <div class="appropriate-row">
                                    <div class="appropriate-row__meta">
                                        <div class="appropriate-row__label">${escapeHtml(score.label)}</div>
                                        <div class="appropriate-row__value" data-tone="${escapeHtml(score.activeTone ?? "base")}">${escapeHtml(Math.floor(score.value))}</div>
                                        <button class="info-dot info-dot--score" type="button" data-info-toggle data-tooltip="${escapeHtml(score.tooltip)}">i</button>
                                    </div>
                                    <div class="appropriate-row__bar">
                                        <div class="appropriate-row__fill appropriate-row__fill--base" style="width:${getAppropriateWidth(score.baseValue ?? score.value, appropriateMax)}%"></div>
                                        ${score.evioliteValue != null ? `<div class="appropriate-row__fill appropriate-row__fill--eviolite" style="width:${getAppropriateWidth(score.evioliteValue, appropriateMax)}%"></div>` : ""}
                                        ${score.abilityValue != null ? `<div class="appropriate-row__fill appropriate-row__fill--ability" style="width:${getAppropriateWidth(score.abilityValue, appropriateMax)}%"></div>` : ""}
                                    </div>
                                </div>
                            `).join("")}
                        </div>
                        <div class="setup-panel">
                            <div class="setup-panel__title-row">
                                <div class="setup-panel__title">起点作成</div>
                                <button class="info-dot info-dot--setup" type="button" data-info-toggle data-tooltip="戦局を有利にする適正">i</button>
                            </div>
                            ${renderSetupOptions(viewModel.setupOptions)}
                        </div>
                    </section>
                </div>

                ${viewModel.profile.point ? `
                    <section class="panel">
                        <div class="panel__header">
                            <h3 class="panel__title panel__title--memo">ひとくちメモ</h3>
                        </div>
                        <p class="point-text">${escapeHtml(viewModel.profile.point)}</p>
                    </section>
                ` : ""}
                </div>

                <div class="main-column">
                <div class="flow-arrow" aria-hidden="true"></div>

                <section class="panel panel--range">
                    <div class="panel__range-export-scope">
                        <div class="panel__header panel__header--feature">
                            <h3 class="panel__title">技範囲</h3>
                        </div>
                        ${renderHeatmap(viewModel.moveRange, appState.showDuplicateGrey, viewModel.mismatchEnhancedKeys ?? [], appState.showMismatchHighlight)}
                    </div>
                    <div class="panel__range-lower">
                        <div class="flow-arrow flow-arrow--up" aria-hidden="true"></div>
                        <div class="range-selector-card">
                            <p class="range-selector-card__title">覚えさせる攻撃技のタイプを選択</p>
                            <div class="range-controls">
                                ${viewModel.selectedMoveTypes.map((type, index) => `
                                    <div class="range-choice">
                                        <select class="range-select" data-move-range-index="${index}">
                                            <option value="">未選択</option>
                                            ${ALL_TYPES.map((typeName) => `<option value="${escapeHtml(typeName)}" ${typeName === type ? "selected" : ""}>${escapeHtml(typeName)}</option>`).join("")}
                                        </select>
                                        ${renderSelectedTypeMovePreview(viewModel.selectedTypeMoveSuggestions?.[index])}
                                    </div>
                                `).join("")}
                            </div>
                        </div>
                    </div>
                </section>

                <div class="flow-arrow" aria-hidden="true"></div>

                <section class="panel panel--moves">
                    <div class="panel__header panel__header--feature">
                        <h3 class="panel__title">覚える技</h3>
                    </div>
                    ${renderMoveCategoryTabs(appState.activeMoveCategory)}
                    <div class="move-columns">${renderMoveGroups(viewModel.moveGroups.filter((group) => group.key === appState.activeMoveCategory), viewModel.profile.types.map((type) => type.name))}</div>
                </section>
                </div>
            </div>
        </div>
        ${errorMarkup}
    `);
}

export function renderApp(root, viewModel, appState) {
    root.innerHTML = renderAppHtml(viewModel, appState);
}


