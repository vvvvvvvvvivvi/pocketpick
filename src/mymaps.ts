import type { Brand, Item, Place } from './types'

export interface ResolvedPlace { place: Place; via?: Brand }

/** One row per (item, place). "Any branch" items list every stored branch. */
export interface ExportRow {
  place: string
  address: string
  lat: number
  lng: number
  item: string
  tag: string
  chain: string
  list: string
}

/** `resolve` is `candidates(item, idx, null)` from geo.ts. */
export function buildRows(listName: string, items: Item[], resolve: (item: Item) => ResolvedPlace[]): ExportRow[] {
  const rows: ExportRow[] = []
  for (const item of items) {
    for (const c of resolve(item)) {
      rows.push({
        place: c.place.name,
        address: c.place.address ?? '',
        lat: c.place.lat,
        lng: c.place.lng,
        item: item.title,
        tag: item.tag === 'food' ? 'Food' : 'Things',
        chain: c.via?.name ?? '',
        list: listName
      })
    }
  }
  return rows
}

const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

/** My Maps: pick Latitude/Longitude as position and Place as title, then Style by data column → Item or Tag. */
export function toCsv(rows: ExportRow[]): string {
  const head = ['Place', 'Address', 'Latitude', 'Longitude', 'Item', 'Tag', 'Chain', 'List']
  const body = rows.map(r => [r.place, r.address, r.lat, r.lng, r.item, r.tag, r.chain, r.list].map(q).join(','))
  return '\uFEFF' + [head.map(q).join(','), ...body].join('\r\n') // BOM keeps Japanese/Chinese names intact
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** My Maps turns each KML folder into its own layer, so each item becomes a layer. */
export function toKml(listName: string, rows: ExportRow[]): string {
  const byItem = new Map<string, ExportRow[]>()
  for (const r of rows) byItem.set(r.item, [...(byItem.get(r.item) ?? []), r])
  const folders = [...byItem.entries()].map(([item, rs]) =>
    `    <Folder>\n      <name>${esc(item)}</name>\n` +
    rs.map(r =>
      `      <Placemark>\n        <name>${esc(r.place)}</name>\n        <description>${esc([r.tag, r.chain, r.address].filter(Boolean).join(' · '))}</description>\n        <Point><coordinates>${r.lng},${r.lat},0</coordinates></Point>\n      </Placemark>`
    ).join('\n') + '\n    </Folder>'
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${esc(listName)}</name>\n${folders.join('\n')}\n  </Document>\n</kml>\n`
}
