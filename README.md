# ポケグラフ

ポケモンの種族値、耐性、技範囲、適正をグラフと表で可視化する静的サイトです。

## 構成

- `index.html`
  - 開発用エントリ
- `data/`
  - 元データと分割済みJSON
- `js/`
  - 画面描画、計算、検索、補助ロジック
- `scripts/Build-PokemonData.ps1`
  - `Pokemon.json` から `PokemonIndex.json` と個別JSONを生成
- `scripts/Build-StaticPages.ps1`
  - `docs/` に静的ページを生成
- `docs/`
  - 公開用成果物
- `txt/最終仕様.txt`
  - 現行仕様書

## 基本フロー

1. データを更新する
2. `Build-PokemonData.ps1` を実行する
3. `Build-StaticPages.ps1` を実行する
4. `docs/` を確認する

## ビルド

### データ再生成

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Build-PokemonData.ps1
```

### 静的ページ生成

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Build-StaticPages.ps1
```

### 公開URL込みで静的ページ生成

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Build-StaticPages.ps1 -SiteUrl "https://USERNAME.github.io/REPOSITORY/"
```

必要に応じて `-OgImagePath` も指定できます。

## GitHub Pages 想定

- 正規URLは `/pokemon/{key}/`
- 公開成果物は `docs/`
- `SiteUrl` を付けて再ビルドすると `canonical`、`og:url`、`sitemap.xml`、`robots.txt` を生成可能

## 参照ドキュメント

- [最終仕様.txt](./txt/%E6%9C%80%E7%B5%82%E4%BB%95%E6%A7%98.txt)
- [データ入力ルール.txt](./txt/%E3%83%87%E3%83%BC%E3%82%BF%E5%85%A5%E5%8A%9B%E3%83%AB%E3%83%BC%E3%83%AB.txt)
- [公開前チェックリスト.txt](./txt/%E5%85%AC%E9%96%8B%E5%89%8D%E3%83%81%E3%82%A7%E3%83%83%E3%82%AF%E3%83%AA%E3%82%B9%E3%83%88.txt)
