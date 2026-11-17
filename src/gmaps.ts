import type { LatLng, Place } from './types'

declare global { interface Window { __gmapsReady?: () => void } }

export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
export const MAP_ID = (import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined) || 'DEMO_MAP_ID'

let loader: Promise<void> | null = null

/** Loads the Maps JS API once. Rejects when offline or when the key is missing/blocked. */
export function loadMaps(): Promise<void> {
  if (!MAPS_KEY) return Promise.reject(new Error('No API key'))
  if (loader) return loader
  loader = new Promise<void>((resolve, reject) => {
    window.__gmapsReady = () => resolve()
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&v=weekly&loading=async&callback=__gmapsReady`
    s.async = true
    s.onerror = () => { loader = null; reject(new Error('Could not reach Google Maps')) }
    document.head.appendChild(s)
  })
  return loader
}

const FIELDS = ['id', 'displayName', 'formattedAddress', 'location']

function toPlace(p: google.maps.places.Place): Place | null {
  if (!p.id || !p.location) return null
  return {
    id: p.id,
    name: p.displayName ?? 'Unnamed place',
    address: p.formattedAddress ?? undefined,
    lat: p.location.lat(),
    lng: p.location.lng(),
    fetchedAt: Date.now()
  }
}

/** Resolve a prediction chosen in the autocomplete widget into a full place. */
export async function placeFromPrediction(pred: google.maps.places.PlacePrediction): Promise<Place | null> {
  const place = pred.toPlace()
  await place.fetchFields({ fields: FIELDS })
  return toPlace(place)
}

/** One Text Search for a chain around a point. This is the main ingestion call, so it is cached in IndexedDB by the caller. */
export async function searchBranches(brand: string, near: LatLng): Promise<Place[]> {
  await loadMaps()
  const { Place: GPlace } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
  const { places } = await GPlace.searchByText({
    textQuery: brand,
    fields: FIELDS,
    locationBias: { center: near, radius: 30000 },
    maxResultCount: 20
  })
  const needle = brand.trim().toLowerCase()
  return places
    .filter(p => (p.displayName ?? '').toLowerCase().includes(needle))
    .map(toPlace)
    .filter((p): p is Place => p !== null)
}

/** Re-fetch coordinates for places older than 30 days (Google only allows caching lat/lng for 30 days). */
export const STALE_MS = 30 * 24 * 3600 * 1000
export async function refreshPlace(p: Place): Promise<Place | null> {
  await loadMaps()
  const { Place: GPlace } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
  const gp = new GPlace({ id: p.id })
  await gp.fetchFields({ fields: FIELDS })
  const fresh = toPlace(gp)
  return fresh ? { ...fresh, brandId: p.brandId } : null
}
