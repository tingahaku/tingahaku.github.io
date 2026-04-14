import { loadAllData } from "./DataLoader.js";
import { buildPokemonViewModel, createInitialMoveTypes } from "./Stats.js";
import { renderApp } from "./Render.js";
import { findExactPokemon, findPokemonSuggestions, isSpecialUnknownPhrase } from "./Search.js";
import { buildPokemonUrl, getInitialPokemonKeyFromLocation, resolveAppUrl } from "./AppPaths.js";
import { buildDefaultPageMeta, buildPokemonPageMeta } from "./PageMeta.js";

const root = document.querySelector("#app");
const DEFAULT_POKEMON_KEY = "garchomp";
const FEATURED_POKEMON_LIMIT = 100;
const POPULAR_POKEMON_DATA_PATH = "data/popular-pokemon.json";
let dataStore = null;
let renderRequestId = 0;
let htmlToImageModulePromise = null;

function updatePageMetadata(pokemon) {
    const meta = pokemon ? buildPokemonPageMeta(pokemon) : buildDefaultPageMeta();
    document.title = meta.title;

    const descriptionElement = document.querySelector('meta[name="description"]');

    if (!descriptionElement) {
        return;
    }

    if (!pokemon) {
        descriptionElement.setAttribute("content", meta.description);
        return;
    }

    descriptionElement.setAttribute("content", meta.description);
}

function getPokemonImagePath(imageKey) {
    return resolveAppUrl(`assets/pokemon/${String(imageKey)}.png`);
}

function navigateToPokemonByKey(pokemonKey) {
    const pokemonIndex = dataStore?.pokemonIndexKeyMap.get(pokemonKey) ?? null;

    if (!pokemonIndex) {
        return;
    }

    window.location.assign(buildPokemonUrl(pokemonKey));
}

function getDefaultMoveCategory(pokemon) {
    if (!pokemon) {
        return "physical";
    }

    return pokemon.baseStats.spa > pokemon.baseStats.atk ? "special" : "physical";
}

const appState = {
    currentPokemonKey: DEFAULT_POKEMON_KEY,
    searchInput: "",
    isSearchComposing: false,
    searchStatus: "",
    searchStatusType: "normal",
    suggestions: [],
    performanceMode: "standard",
    applyEvioliteBonus: true,
    selectedPerformanceAbilityName: null,
    activeMoveCategory: "physical",
    selectedMoveTypes: [],
    shouldInitializeMoveTypes: true,
    showDuplicateGrey: false,
    showMismatchHighlight: true,
    featuredPokemon: []
};

function buildDefaultFeaturedPokemonList(pokemonList, limit = FEATURED_POKEMON_LIMIT) {
    const sortedPokemon = [...pokemonList].sort((leftPokemon, rightPokemon) => leftPokemon.name.localeCompare(rightPokemon.name, "ja"));

    return sortedPokemon.slice(0, limit).map((pokemon) => {
        return {
            key: pokemon.key,
            imageKey: pokemon.imageKey,
            no: pokemon.no,
            name: pokemon.name
        };
    });
}

function normalizePopularPokemonKeys(popularData) {
    if (Array.isArray(popularData)) {
        return popularData;
    }

    if (Array.isArray(popularData?.pokemonKeys)) {
        return popularData.pokemonKeys;
    }

    return [];
}

async function loadPopularPokemonKeys() {
    try {
        const response = await fetch(resolveAppUrl(POPULAR_POKEMON_DATA_PATH), { cache: "no-cache" });

        if (!response.ok) {
            return [];
        }

        const popularData = await response.json();
        return normalizePopularPokemonKeys(popularData)
            .map((key) => String(key ?? "").trim())
            .filter((key) => key.length > 0);
    } catch (error) {
        console.warn("Failed to load popular pokemon ranking.", error);
        return [];
    }
}

function buildFeaturedPokemonList(pokemonList, popularPokemonKeys, limit = FEATURED_POKEMON_LIMIT) {
    const pokemonByKey = new Map(pokemonList.map((pokemon) => [pokemon.key, pokemon]));
    const featured = [];
    const usedKeys = new Set();

    for (const pokemonKey of popularPokemonKeys) {
        if (featured.length >= limit) {
            break;
        }

        const pokemon = pokemonByKey.get(pokemonKey);

        if (!pokemon || usedKeys.has(pokemon.key)) {
            continue;
        }

        usedKeys.add(pokemon.key);
        featured.push({
            key: pokemon.key,
            imageKey: pokemon.imageKey,
            no: pokemon.no,
            name: pokemon.name
        });
    }

    if (featured.length >= limit) {
        return featured;
    }

    const fallbackPokemon = buildDefaultFeaturedPokemonList(pokemonList, limit);

    for (const pokemon of fallbackPokemon) {
        if (featured.length >= limit) {
            break;
        }

        if (usedKeys.has(pokemon.key)) {
            continue;
        }

        featured.push(pokemon);
    }

    return featured;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function sanitizeFileName(value) {
    return String(value ?? "panel")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_");
}

function downloadDataUrl(dataUrl, fileName) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
}

async function loadHtmlToImage() {
    if (!htmlToImageModulePromise) {
        htmlToImageModulePromise = import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/+esm");
    }

    return htmlToImageModulePromise;
}

async function savePanelAsImage(panelElement, triggerButton, exportMode = "full") {
    const panelTitle = panelElement.querySelector(".panel__title")?.textContent?.trim() || "panel";
    const pokemonName = document.querySelector(".profile__name")?.textContent?.trim() || appState.currentPokemonKey;
    const fileSuffix = exportMode === "range-top" ? `${panelTitle}-表のみ` : panelTitle;
    const fileName = `${sanitizeFileName(pokemonName)}-${sanitizeFileName(fileSuffix)}.png`;

    if (triggerButton) {
        triggerButton.disabled = true;
    }

    try {
        await document.fonts?.ready;
        panelElement.classList.add("panel--exporting");
        if (panelTitle === "適正") {
            panelElement.classList.add("panel--export-brand-small");
        }
        if (exportMode === "range-top") {
            panelElement.classList.add("panel--export-range-top");
        }

        const htmlToImage = await loadHtmlToImage();
        const dataUrl = await htmlToImage.toPng(panelElement, {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor: "transparent",
            filter: (node) => !(node instanceof HTMLElement && node.hasAttribute("data-panel-save"))
        });

        downloadDataUrl(dataUrl, fileName);
    } catch (error) {
        console.error(error);
        window.alert(`画像の保存に失敗しました。\n${error instanceof Error ? error.message : ""}`);
    } finally {
        panelElement.classList.remove("panel--export-brand-small", "panel--export-range-top");
        panelElement.classList.remove("panel--exporting");

        if (triggerButton) {
            triggerButton.disabled = false;
        }
    }
}

function decoratePanelSaveButtons() {
    root.querySelectorAll(".panel").forEach((panelElement) => {
        if (panelElement.classList.contains("panel--profile") || panelElement.classList.contains("panel--moves")) {
            return;
        }

        const titleElement = panelElement.querySelector(".panel__title");

        if (!titleElement || panelElement.querySelector("[data-panel-save]")) {
            return;
        }

        const saveButton = document.createElement("button");
        saveButton.className = "panel__save";
        saveButton.type = "button";
        saveButton.dataset.panelSave = "";
        saveButton.setAttribute("aria-label", `${titleElement.textContent?.trim() || "パネル"}を画像保存`);
        saveButton.innerHTML = `<span class="panel__save-icon" aria-hidden="true"></span>`;

        if (panelElement.classList.contains("panel--range")) {
            saveButton.classList.add("panel__save--with-label");
            saveButton.innerHTML += `<span class="panel__save-label">全体</span>`;
        }

        panelElement.append(saveButton);

        if (panelElement.classList.contains("panel--range")) {
            const partialSaveButton = document.createElement("button");
            partialSaveButton.className = "panel__save panel__save--secondary";
            partialSaveButton.type = "button";
            partialSaveButton.dataset.panelSave = "range-top";
            partialSaveButton.setAttribute("aria-label", "技範囲のヒートマップ部分のみ画像保存");
            partialSaveButton.classList.add("panel__save--with-label");
            partialSaveButton.innerHTML = `
                <span class="panel__save-icon" aria-hidden="true"></span>
                <span class="panel__save-label">表のみ</span>
            `;
            panelElement.append(partialSaveButton);
        }

        if (!panelElement.querySelector(".panel__export-brand")) {
            const exportBrand = document.createElement("div");
            exportBrand.className = "panel__export-brand";
            exportBrand.textContent = "ポケグラフ";
            panelElement.append(exportBrand);
        }
    });
}

async function renderCurrent() {
    const requestId = ++renderRequestId;
    const pokemon = await dataStore.getPokemonByKey(appState.currentPokemonKey);

    if (requestId !== renderRequestId) {
        return;
    }

    updatePageMetadata(pokemon);

    if (pokemon) {
        await dataStore.ensureReferenceData();
    }

    if (requestId !== renderRequestId) {
        return;
    }

    const viewModel = buildPokemonViewModel(pokemon, dataStore, {
        performanceMode: appState.performanceMode,
        applyEvioliteBonus: appState.applyEvioliteBonus,
        selectedAbilityName: appState.selectedPerformanceAbilityName,
        selectedMoveTypes: appState.shouldInitializeMoveTypes ? createInitialMoveTypes(pokemon?.types ?? []) : appState.selectedMoveTypes
    });

    if (viewModel.found && appState.shouldInitializeMoveTypes) {
        appState.activeMoveCategory = getDefaultMoveCategory(pokemon);
        appState.selectedMoveTypes = [...viewModel.selectedMoveTypes];
        appState.selectedPerformanceAbilityName = viewModel.selectedPerformanceAbilityName || "";
        appState.shouldInitializeMoveTypes = false;
    }

    renderApp(root, viewModel, appState);
    decoratePanelSaveButtons();
    bindEvents();
}

function updateSuggestions() {
    if (isSpecialUnknownPhrase(appState.searchInput)) {
        appState.suggestions = [];
        return;
    }

    appState.suggestions = findPokemonSuggestions(appState.searchInput, dataStore.pokemonList);
}

function refreshSearchUi() {
    const searchRoot = root.querySelector("[data-search-root]");

    if (!searchRoot) {
        return;
    }

    const statusElement = searchRoot.querySelector(".search__status");
    const suggestionsElement = searchRoot.querySelector(".search__suggestions");
    const previewElement = searchRoot.querySelector("[data-search-preview]");
    const previewImage = searchRoot.querySelector("[data-search-preview-image]");
    const previewText = searchRoot.querySelector("[data-search-preview-text]");
    const exactPokemon = findExactPokemon(appState.searchInput, dataStore.pokemonList);
    const isUnknownPhrase = isSpecialUnknownPhrase(appState.searchInput);

    if (statusElement) {
        statusElement.textContent = appState.searchStatus;
        statusElement.classList.toggle("search__status--error", appState.searchStatusType === "error");
    }

    if (suggestionsElement) {
        suggestionsElement.hidden = appState.suggestions.length === 0;
        suggestionsElement.innerHTML = appState.suggestions
            .map((pokemon) => `
                <button class="search__button" type="button" data-suggestion-key="${escapeHtml(pokemon.key)}">
                    <span class="search__button-label">${escapeHtml(pokemon.name)}</span>
                    <img class="search__button-icon" src="${getPokemonImagePath(pokemon.imageKey)}" alt="${escapeHtml(pokemon.name)}">
                </button>
            `)
            .join("");

        suggestionsElement.querySelectorAll("[data-suggestion-key]").forEach((button) => {
            button.addEventListener("click", () => {
                navigateToPokemonByKey(button.dataset.suggestionKey ?? "");
            });
        });
    }

    if (previewElement && previewImage && previewText) {
        if (isUnknownPhrase) {
            previewElement.classList.add("search__peek--active", "search__peek--text");
            delete previewElement.dataset.pokemonName;
            delete previewElement.dataset.pokemonKey;
            previewImage.hidden = true;
            previewImage.alt = "";
            previewText.textContent = "知らん";
        } else if (exactPokemon) {
            previewElement.classList.remove("search__peek--text");
            previewElement.classList.add("search__peek--active");
            previewElement.dataset.pokemonName = exactPokemon.name;
            previewElement.dataset.pokemonKey = exactPokemon.key;
            const nextSrc = getPokemonImagePath(exactPokemon.imageKey);

            if (previewImage.getAttribute("src") !== nextSrc) {
                previewImage.src = nextSrc;
            }

            previewImage.hidden = false;
            previewImage.alt = exactPokemon.name;
            previewText.textContent = "";
        } else {
            previewElement.classList.remove("search__peek--text");
            previewElement.classList.remove("search__peek--active");
            delete previewElement.dataset.pokemonName;
            delete previewElement.dataset.pokemonKey;
            previewImage.hidden = true;
            previewImage.alt = "";
            previewText.textContent = "";
        }
    }
}

function selectPokemonByKey(pokemonKey, options = {}) {
    const { syncInput = false } = options;
    const pokemonIndex = dataStore.pokemonIndexKeyMap.get(pokemonKey) ?? null;

    if (!pokemonIndex) {
        return;
    }

    appState.currentPokemonKey = pokemonKey;

    if (syncInput) {
        appState.searchInput = pokemonIndex.name;
    } else {
        appState.searchInput = "";
    }

    appState.searchStatus = "";
    appState.searchStatusType = "normal";
    appState.suggestions = [];
    appState.shouldInitializeMoveTypes = true;
    appState.selectedPerformanceAbilityName = null;

    if (pokemonIndex) {
        const cachedPokemon = dataStore.pokemonCache.get(pokemonKey) ?? null;
        appState.activeMoveCategory = getDefaultMoveCategory(cachedPokemon);
        appState.selectedMoveTypes = cachedPokemon ? createInitialMoveTypes(cachedPokemon.types) : [];
    }

    renderCurrent();
}

function submitSearch() {
    if (appState.searchInput.trim() === "") {
        navigateToPokemonByKey(DEFAULT_POKEMON_KEY);
        return;
    }

    const exactPokemon = findExactPokemon(appState.searchInput, dataStore.pokemonList);

    if (exactPokemon) {
        navigateToPokemonByKey(exactPokemon.key);
        return;
    }

    appState.suggestions = [];
    appState.searchStatus = "一致する名称がありませんでした";
    appState.searchStatusType = "error";
    refreshSearchUi();
}

function bindEvents() {
    const searchInput = root.querySelector(".search__input");
    const searchRoot = root.querySelector("[data-search-root]");
    const searchSubmit = root.querySelector("[data-search-submit]");
    const previewElement = root.querySelector("[data-search-preview]");
    const performanceToggle = root.querySelector("[data-toggle-performance]");
    const evioliteToggle = root.querySelector("[data-toggle-eviolite]");
    const duplicateToggle = root.querySelector("[data-toggle-duplicate-grey]");
    const mismatchToggle = root.querySelector("[data-toggle-mismatch-highlight]");
    const moveCategoryButtons = root.querySelectorAll("[data-move-category]");
    const moveRangeSelects = root.querySelectorAll("[data-move-range-index]");
    const performanceAbilitySelect = root.querySelector("[data-select-performance-ability]");
    const infoButtons = root.querySelectorAll("[data-info-toggle]");
    const featuredButtons = root.querySelectorAll("[data-featured-key]");
    const panelSaveButtons = root.querySelectorAll("[data-panel-save]");

    if (searchInput) {
        searchInput.addEventListener("compositionstart", () => {
            appState.isSearchComposing = true;
        });

        searchInput.addEventListener("compositionend", (event) => {
            appState.isSearchComposing = false;
            appState.searchInput = event.currentTarget.value;
            appState.searchStatus = "";
            appState.searchStatusType = "normal";
            updateSuggestions();
            refreshSearchUi();
        });

        searchInput.addEventListener("input", (event) => {
            appState.searchInput = event.currentTarget.value;

            if (appState.isSearchComposing || event.isComposing) {
                return;
            }

            appState.searchStatus = "";
            appState.searchStatusType = "normal";
            updateSuggestions();
            refreshSearchUi();
        });

        searchInput.addEventListener("keydown", (event) => {
            if (appState.isSearchComposing || event.isComposing) {
                return;
            }

            if (event.key !== "Enter") {
                return;
            }

            event.preventDefault();
            submitSearch();
        });
    }

    searchSubmit?.addEventListener("click", () => {
        submitSearch();
    });

    previewElement?.addEventListener("click", () => {
        const pokemonKey = previewElement.dataset.pokemonKey ?? "";

        if (!pokemonKey) {
            return;
        }

        navigateToPokemonByKey(pokemonKey);
    });

    refreshSearchUi();

    document.addEventListener("click", (event) => {
        if (searchRoot && !searchRoot.contains(event.target)) {
            if (appState.suggestions.length === 0) {
                return;
            }

            appState.suggestions = [];
            refreshSearchUi();
        }
    }, { once: true });

    performanceToggle?.addEventListener("click", () => {
        appState.performanceMode = appState.performanceMode === "standard" ? "tank" : "standard";
        renderCurrent();
    });

    evioliteToggle?.addEventListener("click", () => {
        appState.applyEvioliteBonus = !appState.applyEvioliteBonus;
        renderCurrent();
    });

    duplicateToggle?.addEventListener("click", () => {
        appState.showDuplicateGrey = !appState.showDuplicateGrey;
        renderCurrent();
    });

    mismatchToggle?.addEventListener("click", () => {
        appState.showMismatchHighlight = !appState.showMismatchHighlight;
        renderCurrent();
    });

    moveCategoryButtons.forEach((button) => {
        button.addEventListener("click", () => {
            appState.activeMoveCategory = button.dataset.moveCategory ?? "physical";
            renderCurrent();
        });
    });

    moveRangeSelects.forEach((selectElement) => {
        selectElement.addEventListener("change", (event) => {
            const index = Number(event.currentTarget.dataset.moveRangeIndex);
            appState.selectedMoveTypes[index] = event.currentTarget.value;
            appState.shouldInitializeMoveTypes = false;
            renderCurrent();
        });
    });

    performanceAbilitySelect?.addEventListener("change", (event) => {
        appState.selectedPerformanceAbilityName = event.currentTarget.value;
        renderCurrent();
    });

    infoButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const shouldOpen = !button.classList.contains("info-dot--open");
            infoButtons.forEach((item) => item.classList.remove("info-dot--open"));

            if (shouldOpen) {
                button.classList.add("info-dot--open");
            }
        });
    });

    featuredButtons.forEach((button) => {
        button.addEventListener("click", () => {
            navigateToPokemonByKey(button.dataset.featuredKey ?? "");
        });
    });

    panelSaveButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            const panelElement = button.closest(".panel");

            if (!panelElement) {
                return;
            }

            await savePanelAsImage(panelElement, button, button.dataset.panelSave || "full");
        });
    });

    document.addEventListener("click", () => {
        infoButtons.forEach((button) => button.classList.remove("info-dot--open"));
    });
}

async function initialize() {
    try {
        dataStore = await loadAllData();
        appState.searchInput = "";
        appState.shouldInitializeMoveTypes = true;
        const popularPokemonKeys = await loadPopularPokemonKeys();
        appState.featuredPokemon = buildFeaturedPokemonList(dataStore.pokemonList, popularPokemonKeys);
        const routePokemonKey = getInitialPokemonKeyFromLocation();
        const initialPokemonKey = routePokemonKey && dataStore.pokemonIndexKeyMap.has(routePokemonKey)
            ? routePokemonKey
            : DEFAULT_POKEMON_KEY;

        appState.currentPokemonKey = initialPokemonKey;

        await renderCurrent();
    } catch (error) {
        root.innerHTML = `<section class="panel error-panel"><h3>初期化エラー</h3><p class="point-text">${error instanceof Error ? error.message : "初期化に失敗しました。"}</p></section>`;
    }
}

initialize();
