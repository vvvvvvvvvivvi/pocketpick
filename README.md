# Pocket Pin

A georeferenced shopping list. Add things you want to buy, pin the shops that sell them, and when you're out it tells you which shop is closest and hands you to Google Maps for directions.

Local-first: everything is stored in your browser (IndexedDB), no server, no account. Installable as a PWA; the list and distances work offline, the map and search need signal.

## Run it

```bash
npm install
cp .env     # then paste your key
npm run dev              # http://localhost:5173
npm test                 # distance + database logic
npm run build            # production build in dist/
```

Geolocation needs HTTPS, except on `localhost`. To test on your phone, deploy `dist/` (Cloudflare Pages, Netlify or Vercel all work and are free at this scale).

## Google setup (about 10 minutes)

1. Create a project in Google Cloud Console and attach billing (the free monthly allowance covers personal use, but check current limits).
2. Enable **Maps JavaScript API** and **Places API (New)**. The legacy Places API will not work for new projects.
3. Create an API key and restrict it by HTTP referrer (`http://localhost:5173/*` and your deployed domain). Add a budget alert.
4. Put the key in `.env` as `VITE_GOOGLE_MAPS_API_KEY`.

## How it works

| Piece | What it does |
|---|---|
| `src/db.ts` | Dexie tables: `lists`, `items`, `places`, `brands`. JSON export/import for backups. |
| `src/geo.ts` | Haversine distance, live position, and `candidates()`: an item's saved places plus every known branch of its chains, nearest first. |
| `src/gmaps.ts` | Loads Maps JS, resolves autocomplete picks, runs the branch search, refreshes stale coordinates. |
| `src/components/Sketch.tsx` | Canvas pad. Strokes are saved as points and drawn as SVG, so icons stay sharp at any size. |
| `src/components/MapView.tsx` | Numbered pins matching the "closest first" list, plus a you-are-here dot. |

**Chains.** When you pick a shop, the editor asks if it's part of a chain. Confirm the chain name ("Muji"), it runs one Text Search around that shop, and saves the matches as branches. The item then shows as `Muji · any of 7`. Branches from several cities accumulate under the same chain, so the nearest one wins wherever you are.

**Navigation.** The "Walk to…" button opens a Google Maps directions URL with the place id. The Maps JS API cannot do turn-by-turn itself, so Google Maps does it.

## Limits worth knowing

- **Back up your data.** Safari can clear site data after about a week of non-use unless the app is added to the home screen. Use *Export backup* on the first screen.
- **No background alerts.** A web app can't geofence when closed. "Nearest store" updates while the app is open.
- **Distances are straight-line**, with a rough walking time. Google Maps shows the real route.
- **Place data caching.** Place ids are stored forever; coordinates are re-fetched when older than 30 days and you open the item while online (Google's caching terms).
- **No Google saved-lists link.** Google doesn't expose them via API. A Takeout import is the obvious next feature.
- **Branch search is a heuristic.** It matches the chain name against result names, within 30 km, max 20 results. Odd names may need a different chain spelling.
- Not tested against a live Google key or in a real browser yet: do a pass on the editor flow first.

## Next

1. Google Takeout import for saved places
2. Routes API for real walking times on the top 3
3. Shared lists (Supabase) if you ever want them
