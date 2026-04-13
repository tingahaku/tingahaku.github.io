function getConfiguredBasePath() {
    return window.__POKEGRAPH_BASE_PATH__ ?? "./";
}

export function getSiteBaseUrl() {
    return new URL(getConfiguredBasePath(), window.location.href);
}

export function resolveAppUrl(relativePath) {
    const normalizedPath = String(relativePath ?? "").replace(/^\/+/, "");
    return new URL(normalizedPath, getSiteBaseUrl()).toString();
}

export function buildPokemonUrl(pokemonKey) {
    return new URL(`pokemon/${encodeURIComponent(pokemonKey)}/`, getSiteBaseUrl()).toString();
}

export function getInitialPokemonKeyFromLocation() {
    if (window.__POKEGRAPH_ROUTE_KEY__) {
        return window.__POKEGRAPH_ROUTE_KEY__;
    }

    const currentUrl = new URL(window.location.href);
    const baseUrl = getSiteBaseUrl();
    const basePath = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;
    let relativePath = currentUrl.pathname;

    if (relativePath.startsWith(basePath)) {
        relativePath = relativePath.slice(basePath.length);
    }

    const segments = relativePath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

    if (segments[0] !== "pokemon" || !segments[1]) {
        return null;
    }

    return decodeURIComponent(segments[1]);
}
