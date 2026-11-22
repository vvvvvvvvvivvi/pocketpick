import { readBranchCache, writeBranchCache, branchCacheKey, BRANCH_CACHE_MS } from '../src/searchCache.ts'
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1) } else console.log('ok  ', m) }
const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as unknown as Storage
const now = Date.now()
const shibuya = { lat: 35.6595, lng: 139.7005 }
const place = { id: 'a', name: 'Muji', lat: 1, lng: 2, fetchedAt: now }

assert(readBranchCache('Muji', shibuya, now, store) === null, 'miss before anything is cached')
writeBranchCache('Muji', shibuya, [place], now, store)
assert(readBranchCache('Muji', shibuya, now, store)?.places.length === 1, 'hit for the same chain and place')
assert(readBranchCache('  muji ', { lat: 35.67, lng: 139.72 }, now, store) !== null, 'case, spacing and ~2 km away still hit')
assert(readBranchCache('Muji', { lat: 34.69, lng: 135.50 }, now, store) === null, 'a different city misses (Osaka)')
assert(readBranchCache('Uniqlo', shibuya, now, store) === null, 'a different chain misses')
assert(readBranchCache('Muji', shibuya, now + BRANCH_CACHE_MS + 1, store) === null, 'expires after 30 days')
writeBranchCache('Typo', shibuya, [], now, store)
assert(readBranchCache('Typo', shibuya, now, store) === null, 'empty results are not cached')
mem.set(branchCacheKey('Bad', shibuya), '{not json')
assert(readBranchCache('Bad', shibuya, now, store) === null, 'corrupt entry is ignored, not thrown')
assert(readBranchCache('Muji', undefined, now, store) === null, 'no-location searches use their own key')
