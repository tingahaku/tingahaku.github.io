import { resolveAppUrl } from "./AppPaths.js";

async function fetchJson(path) {
    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(`JSONデータの読み込みに失敗しました: ${path}`);
    }

    return response.json();
}

export async function loadAllData() {
    const pokemonList = await fetchJson(resolveAppUrl("data/PokemonIndex.json"));
    const pokemonIndexMap = new Map(pokemonList.map((pokemon) => [pokemon.name, pokemon]));
    const pokemonIndexKeyMap = new Map(pokemonList.map((pokemon) => [pokemon.key, pokemon]));
    const pokemonCache = new Map();
    let abilityList = null;
    let moveList = null;
    let abilityMap = null;
    let moveMap = null;

    async function getPokemonByIndex(pokemonIndex) {
        if (!pokemonIndex?.key) {
            return null;
        }

        if (pokemonCache.has(pokemonIndex.key)) {
            return pokemonCache.get(pokemonIndex.key);
        }

        const pokemon = await fetchJson(resolveAppUrl(`data/pokemon/${pokemonIndex.key}.json`));
        const hydratedPokemon = {
            ...pokemon,
            key: pokemon.key ?? pokemonIndex.key,
            imageKey: pokemon.imageKey ?? pokemonIndex.imageKey,
            no: pokemon.no ?? pokemonIndex.no
        };
        pokemonCache.set(pokemonIndex.key, hydratedPokemon);
        return hydratedPokemon;
    }

    return {
        pokemonList,
        pokemonIndexMap,
        pokemonIndexKeyMap,
        pokemonCache,
        get abilityList() {
            return abilityList ?? [];
        },
        get moveList() {
            return moveList ?? [];
        },
        get abilityMap() {
            return abilityMap ?? new Map();
        },
        get moveMap() {
            return moveMap ?? new Map();
        },
        async getPokemonByName(pokemonName) {
            if (!pokemonName) {
                return null;
            }

            const pokemonIndex = pokemonIndexMap.get(pokemonName);
            return getPokemonByIndex(pokemonIndex);
        },
        async getPokemonByKey(pokemonKey) {
            if (!pokemonKey) {
                return null;
            }

            const pokemonIndex = pokemonIndexKeyMap.get(pokemonKey);
            return getPokemonByIndex(pokemonIndex);
        },
        async ensureReferenceData() {
            if (abilityMap && moveMap) {
                return;
            }

            const [loadedAbilityList, loadedMoveList] = await Promise.all([
                fetchJson(resolveAppUrl("data/Ability.json")),
                fetchJson(resolveAppUrl("data/Move.json"))
            ]);

            abilityList = loadedAbilityList;
            moveList = loadedMoveList;
            abilityMap = new Map(loadedAbilityList.map((ability) => [ability.name, ability]));
            moveMap = new Map(loadedMoveList.map((move) => [move.name, move]));
        }
    };
}
