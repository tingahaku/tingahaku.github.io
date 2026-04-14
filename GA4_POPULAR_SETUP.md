# GA4 Popular Pokemon Setup

This repository can sort the featured Pokemon list by GA4 page views.

## What was added

- `js/Main.js`
  - Reads `data/popular-pokemon.json` at startup.
  - Uses GA ranking order first, then falls back to default name order.
- `data/popular-pokemon.json`
  - Ranking source file consumed by the app.
- `scripts/Update-PopularPokemonFromGa4.ps1`
  - Fetches GA4 `pagePath` report and writes ranking JSON.
- `.github/workflows/update-popular-pokemon.yml`
  - Daily scheduled update + manual run support.

## GitHub Secrets required

- `GA4_SERVICE_ACCOUNT_KEY`
  - Full JSON key for a service account that can read the GA4 property.
- `GA4_PROPERTY_ID`
  - Numeric GA4 property ID.

## GA4 side requirements

- Ensure page views are collected for URLs like:
  - `/PokeGraph/pokemon/p0006/`
  - `/pokemon/p0006/`
- In GA4 Admin, grant the service account Viewer/Analyst access to the property.

## Manual local update (optional)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-PopularPokemonFromGa4.ps1 `
  -PropertyId "<GA4_PROPERTY_ID>" `
  -AccessToken "<OAuth Access Token>" `
  -SiteBasePath "/PokeGraph" `
  -TopN 100 `
  -Days 7 `
  -SyncDocsAndDist
```

