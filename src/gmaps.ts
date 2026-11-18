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
export async function searchBranches(brand: string, near?: LatLng): Promise<Place[]> {
  await loadMaps()
  const { Place: GPlace } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
  const { places } = await GPlace.searchByText({
    textQuery: brand,
    fields: FIELDS,
    ...(near ? { locationBias: { center: near, radius: 30000 } } : {}),
    maxResultCount: 20
  })
  return places.map(toPlace)
    .filter((p): p is Place => p !== null)
}

export async function resolveMapsLink(value: string): Promise<Place> {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Enter a complete Google Maps URL.')
  }
  const host = url.hostname.toLowerCase()
  const isGoogleMapsHost = host === 'google.com' || host.endsWith('.google.com')
  if (url.protocol !== 'https:' || (!isGoogleMapsHost && host !== 'maps.app.goo.gl' && host !== 'goo.gl')) {
    throw new Error('Enter a link from Google Maps.')
  }
  if (host === 'maps.app.goo.gl' || host === 'goo.gl') {
    throw new Error('Open the shortened link in Google Maps, then copy and paste the full Maps URL.')
  }

  const query = url.searchParams.get('query')
    ?? url.searchParams.get('q')
    ?? url.searchParams.get('destination')
  const pathPlace = url.pathname.match(/\/place\/([^/]+)/i)?.[1]
  const placeName = query || (pathPlace ? decodeURIComponent(pathPlace.replaceAll('+', ' ')) : '')
  const coordinateMatch = url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    ?? url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  const queryCoordinates = query?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  const coordinates = coordinateMatch ?? queryCoordinates
  const location = coordinates
    ? { lat: Number(coordinates[1]), lng: Number(coordinates[2]) }
    : undefined
  const placeId = url.searchParams.get('query_place_id')
    ?? url.searchParams.get('place_id')
    ?? url.href.match(/!1s(ChI[A-Za-z0-9_-]+)/)?.[1]

  await loadMaps()
  const { Place: GPlace } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
  if (placeId) {
    const place = new GPlace({ id: placeId })
    await place.fetchFields({ fields: FIELDS })
    const resolved = toPlace(place)
    if (resolved) return resolved
  }

  if (placeName && !queryCoordinates) {
    const { places } = await GPlace.searchByText({
      textQuery: placeName,
      fields: FIELDS,
      ...(location ? { locationBias: { center: location, radius: 5000 } } : {}),
      maxResultCount: 1
    })
    const resolved = places.map(toPlace).find((place): place is Place => place !== null)
    if (resolved) return resolved
  }

  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180) {
    const name = placeName && !queryCoordinates ? placeName : 'Pinned map location'
    return {
      id: `pin:${location.lat},${location.lng}`,
      name,
      address: `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
      ...location,
      fetchedAt: Date.now()
    }
  }
  throw new Error('Could not find a place in that link. Try copying its full Google Maps URL.')
}

/** Re-fetch coordinates for places older than 30 days (Google only allows caching lat/lng for 30 days). */
export const STALE_MS = 30 * 24 * 3600 * 1000
export async function refreshPlace(p: Place): Promise<Place | null> {
  if (p.id.startsWith('pin:')) return p
  await loadMaps()
  const { Place: GPlace } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
  const gp = new GPlace({ id: p.id })
  await gp.fetchFields({ fields: FIELDS })
  const fresh = toPlace(gp)
  return fresh ? { ...fresh, brandId: p.brandId } : null
}
