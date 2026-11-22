# Pocket Pick (repo: pocketpick)

A personal, local-first shopping list that knows where the shops are. You keep lists per trip, attach items to stores (a specific shop or "any branch of this chain"), and when you are out it tells you which store is nearest and hands you to Google Maps for directions. Built for one user (the owner), mainly on a phone while travelling.

Live: https://vvvvvvvvvivvi.github.io/pocketpick/

## How to work on this project

- **Make the smallest change that does the job.** The owner edits files herself between sessions, so the repo is the source of truth. Read the current file before editing it, change only what was asked, and say which lines changed. If you need a file you have not seen, ask for it instead of guessing.
- **Keep Google API usage to a minimum.** See "Google cost rules" below. Do not add features that make extra Places or Maps calls without saying so.
- **The build must pass before anything ships.** `npm run build` runs `tsc --noEmit && vite build`. A type error fails the GitHub Actions build, and GitHub Pages then keeps serving the previous version, which looks like "my changes never came through". Run `npm run build` locally before suggesting a push.
- Use British English in UI text and comments. Be blunt and specific when reporting problems.

## Stack

- React 19, TypeScript (strict), Vite, `vite-plugin-pwa` (installable, offline for the list; map and search need signal).
- Dexie (IndexedDB) for all data. No accounts, no sync, no server of its own.
- Google Maps JavaScript API + Places API (New), loaded in the browser with the owner's key.
- Hash routing: `#/` (lists), `#/list/:id`, `#/item/:id`. The item editor is a full-screen sheet opened from `App.tsx`.
- Tests are plain Node scripts using `node --experimental-strip-types` (no test framework). They live in `tests/` and import from `../src/*.ts` with explicit extensions.

## Layout

```
src/
  types.ts        List, Place, Brand, Item, Sketch, LatLng
  db.ts           Dexie schema; deleteList; exportAll/importAll (JSON backup); exportListCsv
  geo.ts          haversine, fmtDist, walkMins, useWatchPosition, buildIndex, candidates(), storeLabel(),
                  navUrl() and mapsPlaceUrl() (Google Maps URLs)
  gmaps.ts        loadMaps, placeFromPrediction, searchBranches, resolveMapsLink, refreshPlace
  main.tsx        entry, registers the service worker
  App.tsx         hash router, geolocation context, editor sheet
  styles.css      all styling (hand-drawn journal look, see Design)
  components/
    MapView.tsx       Google map: numbered pins, "you" dot, Home marker, click-to-drop
    PlacePicker.tsx   Google's PlaceAutocompleteElement wrapper
    Sketch.tsx        SketchPad (canvas) and SketchIcon (renders saved strokes as SVG)
    Sprite.tsx        SVG filters (hand-drawn wobble) and icon sprites
  views/
    Lists.tsx         home screen: lists, new list, JSON backup export/import
    ListView.tsx      one list: Trip map, Home controls, items sorted by distance, Maps-link bulk import, CSV export
    ItemView.tsx      one item: map, closest-first places, navigate button, "open in Google Maps" link
    ItemEditor.tsx    add/edit item: title, tag, sketch, places, Maps link import, chain search
tests/              geo, db (and others if applied)
```

## Data model (Dexie database `pocketpin`, schema version 1)

- `lists` (id, createdAt): `{ id, name, createdAt, home?: LatLng, homeName? }`. `home` is not indexed, so changing it needs no schema bump.
- `items` (id, listId, createdAt): `{ title, tag: 'food' | 'things', sketch?, done, placeIds[], brandIds[] }`.
- `places` (id, brandId): `{ id, name, address?, lat, lng, brandId?, fetchedAt }`.
- `brands` (id): `{ id: 'brand:<slug>', name, fetchedAt }`.

Conventions that are easy to break:

- A place id is a Google place id, **or `pin:<lat>,<lng>` for a dropped pin or a link with no place id.** `pin:` places are never refreshed from Google, and `navUrl`/`mapsPlaceUrl` use coordinates for them.
- A chain is a Brand. Its branches are Place rows with `brandId` set. An item holds `brandIds` ("any branch of these chains") and/or `placeIds` (specific shops). `candidates(item, idx, pos)` merges both, de-duplicates and sorts nearest first.
- Changing the Dexie schema needs a new `version(n)` with an upgrade path. Never edit version 1 in place.
- Data lives only in the browser. The JSON backup (Lists screen) is the safety net. Do not suggest clearing site data without warning about it.

## Features and how they work

- **Nearest store:** straight-line distance (haversine) computed in the browser from stored coordinates, plus a rough walking time (~80 m/min, x1.25). No routing API.
- **Navigation:** "Walk to ..." opens a Google Maps directions URL (`/maps/dir/?api=1&destination=lat,lng&destination_place_id=...`). The Maps JS API cannot do turn-by-turn, so Google Maps does it.
- **Home per list:** set with "Drop Home pin" (tap the map) or "Search Home" in the Trip map section. Home centres the list map and is the bias point for chain search and autocomplete. It is a bias, not a hard limit.
- **Add a shop:** Google autocomplete (`PlacePicker`) or "Paste a Google Maps link".
- **Chain search:** type a chain name, one Text Search runs (`searchBranches`, bias radius 30 km, max 20 results), tick the branches to keep. Results show distance from Home (or from the user if no Home) and are sorted nearest first. This is computed locally and costs nothing.
- **Maps links:** `resolveMapsLink` accepts full `google.com/maps` URLs. It uses a place id if present (Place Details), else a name search from the `q=`/`query=`/`/place/` text (Text Search, 1 result), else falls back to coordinates in the URL as a `pin:` place. `maps.app.goo.gl` short links are expanded first (see Short links).
- **Export:** "Export trip CSV" (in `db.ts`) includes a Google Maps URL per place.
- **Import:** "Import backup" takes the JSON backup (`importAll`) or a trip CSV (`importTripCsv`, always creates new lists). CSVs with Latitude/Longitude columns restore with no Google calls (places get `fetchedAt: 0`, so they refresh on first view); older CSVs without them cost one lookup per distinct place. Sketches are not in the CSV, so they are not restored.

### Short links (maps.app.goo.gl)

Browsers cannot follow Google's short-link redirect (CORS), so a tiny serverless function does it.

- Function: separate GitHub repo `pocketpick-expansion` (https://pocketpick-expansion.vercel.app), deployed on Vercel. Files: `package.json` (`"type": "module"`), `api/expand.js`, and its tests in `tests/expand.test.mjs` (`npm test` there).
- It accepts only `https://maps.app.goo.gl` / `goo.gl` URLs, answers only the allowed origins (`https://vvvvvvvvvivvi.github.io`, `http://localhost:5173`, overridable with the `ALLOWED_ORIGINS` env var in Vercel), follows at most 5 redirects, unwraps the EU consent redirect, and never follows to other sites. It makes no Google API calls.
- The app calls it through `VITE_EXPAND_URL` (full address ending `/api/expand`). If that variable is unset, `resolveMapsLink` throws "Open the shortened link in Google Maps, then copy and paste the full Maps URL." That message means the build did not get the variable.
- Expanded links often have no place id (only an internal `ftid`), so they usually cost one Text Search.

## Google cost rules

Billable: each map load, each autocomplete session, each Place Details fetch, each Text Search.

- Do not load a map unless it is visible. (Open item: the Trip map on `ListView` defaults to visible, which loads a map every time a list opens. Defaulting to hidden would be the biggest single saving.)
- Do not re-run chain searches for a chain and area already searched. (A localStorage cache, `searchCache.ts`, was written but is only active if applied to `ItemEditor`.)
- Coordinates from Google may only be cached for 30 days. `refreshPlace` re-fetches places older than that (max 10 per item view, only when online).
- Do not enable React `<StrictMode>` in dev: it double-mounts effects, doubling map loads and autocomplete widgets.
- Set a daily quota cap per API and a budget alert in Google Cloud Console. Restrict the API key by HTTP referrer (`https://vvvvvvvvvivvi.github.io/*` and `http://localhost:5173/*`).

## Environment variables (Vite bakes these in at build time)

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JS + Places key (GitHub secret) |
| `VITE_GOOGLE_MAP_ID` | Optional Map ID, defaults to `DEMO_MAP_ID` |
| `VITE_EXPAND_URL` | Short-link expander address (GitHub repository **variable**, not secret) |

For local dev, put them in `.env` (git-ignored; `.env.example` lists them).

## Deployment

- GitHub Pages via GitHub Actions (`.github/workflows`, runs on push to `main` and manually). Steps: checkout, Node 22, `npm ci`, `npm run build` (with the three env vars above), upload `dist`, deploy.
- `VITE_EXPAND_URL` must be a **repository** variable (Settings, Secrets and variables, Actions, Variables). Variables set on the `github-pages` environment are not visible to the build job. Variables only apply to new runs.
- Expander: auto-deploys on push from the `pocketpick-expansion` repo (Vercel, Framework Preset "Other", no build command).
- The service worker caches the app. After a deploy the old build can linger: close and reopen twice, or unregister the service worker in DevTools. Export a backup before clearing any site data.
- Data is stored per origin, so moving the app to a different address would orphan existing lists unless exported and re-imported.

## Design

Hand-drawn journal look (手繪手帳風): pastel sage/sea/blush palette on a dotted page, wobbly borders, washi-tape accents, sketch icons.

- Borders are drawn by the `.sk` class: a `::before` with an SVG displacement filter (`#wobble`, `#wobble-fine`, defined in `Sprite.tsx`). Per-element shape comes from `--r`, fill from `--bg`, border colour from `--bc`.
- Fonts: Patrick Hand (body), Caveat Brush (`.hand`, headings), Klee One (CJK fallback).
- Colours are CSS variables on `:root` in `styles.css`. Keep new UI inside that system.
- Item icons are user-drawn: strokes saved as points, rendered as SVG at any size.

## Known open items

- Apply or confirm in the repo: the `MapView.tsx` and `ListView.tsx` type fixes (they were blocking the build), and the `ItemEditor.tsx` with Home-biased place search and branch distances.
- `main.tsx` still wraps the app in `<StrictMode>` (see cost rules).
- Trip map pins on `ListView` do nothing when tapped (`onSelect` is a no-op).
- "Open this place in Google Maps" shows only for saved places, not chain branches.
- KML export for Google My Maps (one layer per item) was written but is not in the repo.
- Google Takeout import of existing saved places is not built (Google has no API for Saved lists).
- No background "you are near ..." alerts: a web app cannot geofence when closed.
- The short-link expander was tested with mocked redirects and one real sample result; check new link shapes as they appear.
- Chain search is biased, not restricted, to Home, so far-away branches can appear. The distance label is there to make that visible.
