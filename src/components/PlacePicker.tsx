import { useEffect, useRef, useState } from 'react'
import { loadMaps, placeFromPrediction } from '../gmaps'
import type { LatLng, Place } from '../types'

/** Google's own autocomplete widget (Places API New). Picking a result gives us id, name and coordinates. */
export function PlacePicker({ near, onPick }: { near: LatLng | null; onPick: (p: Place) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const pickRef = useRef(onPick)
  pickRef.current = onPick

  useEffect(() => {
    let el: google.maps.places.PlaceAutocompleteElement | null = null
    let cancelled = false
    loadMaps()
      .then(async () => {
        const { PlaceAutocompleteElement } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
        if (cancelled || !host.current) return
        el = new PlaceAutocompleteElement({})
        if (near) el.locationBias = { center: near, radius: 50000 }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(el as any).placeholder = 'Search for a shop or address'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        el.addEventListener('gmp-select', async (e: any) => {
          try {
            const p = await placeFromPrediction(e.placePrediction)
            if (p) pickRef.current(p)
          } catch {
            setError('Could not load that place. Check your connection and try again.')
          }
        })
        host.current.replaceChildren(el)
      })
      .catch(() => setError('Search needs a connection and a working Google Maps key.'))
    return () => { cancelled = true; el?.remove() }
    // near is only used as a one-off bias when the widget is created
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div ref={host} className="picker" />
      {error && <p className="note warn">{error}</p>}
    </div>
  )
}
