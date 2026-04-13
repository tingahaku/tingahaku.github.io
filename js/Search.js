function hiraganaToKatakana(text) {
    return text.replace(/[\u3041-\u3096]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 0x60));
}

export function normalizeJapaneseText(text) {
    const safeText = (text ?? "").toString();
    const normalizedWidth = safeText.normalize("NFKC");
    const katakanaText = hiraganaToKatakana(normalizedWidth);
    return katakanaText.replace(/[ーｰ\-－]/g, "").replace(/\s+/g, "").trim().toUpperCase();
}

const SPECIAL_UNKNOWN_PHRASES = new Set([
    normalizeJapaneseText("アレ"),
    normalizeJapaneseText("なんだっけ"),
    normalizeJapaneseText("あれなんだっけ"),
    normalizeJapaneseText("なんだっけあれ")
]);

export function isSpecialUnknownPhrase(text) {
    return SPECIAL_UNKNOWN_PHRASES.has(normalizeJapaneseText(text));
}

export function findPokemonSuggestions(keyword, pokemonList, limit = 5) {
    const normalizedKeyword = normalizeJapaneseText(keyword);

    if (normalizedKeyword === "") {
        return [];
    }

    return pokemonList.filter((pokemon) => normalizeJapaneseText(pokemon.name).includes(normalizedKeyword)).slice(0, limit);
}

export function findExactPokemon(keyword, pokemonList) {
    const normalizedKeyword = normalizeJapaneseText(keyword);
    return pokemonList.find((pokemon) => normalizeJapaneseText(pokemon.name) === normalizedKeyword) ?? null;
}
