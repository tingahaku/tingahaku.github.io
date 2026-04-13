export function buildDefaultPageMeta() {
    return {
        title: "【ポケモンチャンピオンズ】ポケグラフ | グラフでわかるポケモンの強さと特徴",
        description: "グラフでわかるポケモンの強さと特徴"
    };
}

export function buildPokemonPageMeta(pokemon) {
    if (!pokemon) {
        return buildDefaultPageMeta();
    }

    const typeText = Array.isArray(pokemon.types) ? pokemon.types.join("・") : "";

    return {
        title: `【ポケモンチャンピオンズ】${pokemon.name}の種族値・特性・適正・技範囲 | ポケグラフ`,
        description: `${pokemon.name}${typeText ? `（${typeText}）` : ""}の種族値、耐性、特性、技範囲、適正をグラフで確認できるページ。`
    };
}
