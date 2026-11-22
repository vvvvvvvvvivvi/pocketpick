# Pocket Pick!

related repo: https://github.com/vvvvvvvvvivvi/pocketpick-expansion/ https://pocketpick-expansion.vercel.app

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

### GitHub Pages

The GitHub Actions workflow builds and deploys this project to `https://<username>.github.io/pocketpick/` whenever you push to `main`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The project base path is configured for the `pocketpick` repository.

To enable Google Maps and shop search in the deployed app, add a repository Actions secret named `VITE_GOOGLE_MAPS_API_KEY` and pass it to the build workflow. Restrict the key to your Pages domain.

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

## Trips, maps, and importing

- Each trip has a map showing the places attached to its items. Set its **Home** by searching for a place or dropping a pin on the map; the map centers there.
- Add an individual shop with Places autocomplete, paste a full Google Maps URL into an item, or search for a chain directly and select branches to include.
- On a trip, choose **Import Maps links** to paste one full Google Maps URL per line. Each resolved place is added as an item. Shortened `maps.app.goo.gl` links must first be opened in Google Maps and copied as a full URL.
- Choose **Export trip CSV** to download a spreadsheet-friendly export of that trip's items, assigned places, and Maps links. The separate JSON backup continues to include all trips and app data.
- On an item's place list, **Open this place in Google Maps** opens a saved individual place; chain-wide branches use the trip's directions action.

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
