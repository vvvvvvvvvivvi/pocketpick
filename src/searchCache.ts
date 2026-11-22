import type { LatLng, Place } from './types'

/**
 * Remembers branch-search results per chain + area, so searching "Muji" in the same
 * city again costs no Google request. Lives in localStorage so it needs no database change
 * and is not part of the JSON backup (it is only a cache).
 */
const PREFIX = 'pocketpin:branches:'
const GRID_DEG = 0.2 // ~20 km: searches from the same area share one entry
export const BRANCH_CACHE_MS = 30 * 24 * 3600 * 1000 // same 30-day limit as cached coordinates

export interface CachedBranches { at: number; places: Place[] }

export function branchCacheKey(chain: string, near?: LatLng): string {
  const name = chain.trim().toLowerCase().replace(/\s+/g, ' ')
  const area = near ? `${Math.round(near.lat / GRID_DEG)},${Math.round(near.lng / GRID_DEG)}` : 'any'
  return `${PREFIX}${name}|${area}`
}

export function readBranchCache(chain: string, near?: LatLng, now = Date.now(), store?: Storage): CachedBranches | null {
  try {
    const raw = (store ?? localStorage).getItem(branchCacheKey(chain, near))
    if (!raw) return null
    const hit = JSON.parse(raw) as CachedBranches
    if (!Array.isArray(hit.places) || hit.places.length === 0 || now - hit.at > BRANCH_CACHE_MS) return null
    return hit
  } catch {
    return null // storage blocked or corrupt entry: just search
  }
}

/** Empty results are never cached, so a typo can be retried straight away. */
export function writeBranchCache(chain: string, near: LatLng | undefined, places: Place[], now = Date.now(), store?: Storage): void {
  if (places.length === 0) return
  try {
    ;(store ?? localStorage).setItem(branchCacheKey(chain, near), JSON.stringify({ at: now, places }))
  } catch {
    /* quota or private mode: caching is best-effort */
  }
}
