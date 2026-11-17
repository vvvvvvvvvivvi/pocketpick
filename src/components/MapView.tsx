import { useEffect, useRef, useState } from 'react'
import { MAP_ID, loadMaps } from '../gmaps'
import type { LatLng, Place } from '../types'

interface Props {
  me: LatLng | null
  places: Place[]            // nearest first; index + 1 is the pin number
  selectedId?: string
  onSelect: (id: string) => void
}

const MAX_PINS = 8

export function MapView({ me, places, selectedId, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const meMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect

  // create the map once
  useEffect(() => {
    let cancelled = false
    loadMaps()
      .then(async () => {
        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary
        if (cancelled || !host.current) return
        map.current = new Map(host.current, {
          mapId: MAP_ID,
          center: { lat: 35.6595, lng: 139.7005 },
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false
        })
        setReady(true)
      })
      .catch(() => setError('The map needs a connection. Your list and distances still work offline.'))
    return () => { cancelled = true }
  }, [])

  // draw pins + fit
  useEffect(() => {
    if (!ready || !map.current) return
    let cancelled = false
    ;(async () => {
      const { AdvancedMarkerElement } = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary
      if (cancelled) return
      markers.current.forEach(m => (m.map = null))
      markers.current = []
      meMarker.current && (meMarker.current.map = null)
      meMarker.current = null

      const bounds = new google.maps.LatLngBounds()
      places.slice(0, MAX_PINS).forEach((p, i) => {
        const el = document.createElement('div')
        el.className = 'gpin' + (p.id === selectedId ? ' sel' : '')
        el.textContent = String(i + 1)
        el.title = p.name
        el.addEventListener('click', () => selectRef.current(p.id))
        const m = new AdvancedMarkerElement({ map: map.current!, position: { lat: p.lat, lng: p.lng }, content: el, zIndex: p.id === selectedId ? 10 : 1 })
        markers.current.push(m)
        if (p.id === selectedId || i < 2) bounds.extend({ lat: p.lat, lng: p.lng })
      })
      if (me) {
        const dot = document.createElement('div')
        dot.className = 'gme'
        meMarker.current = new AdvancedMarkerElement({ map: map.current!, position: me, content: dot, zIndex: 20 })
        bounds.extend(me)
      }
      if (!bounds.isEmpty()) map.current!.fitBounds(bounds, 56)
    })()
    return () => { cancelled = true }
  }, [ready, places, selectedId, me])

  if (error) return <div className="map-fallback hand">{error}</div>
  return <div ref={host} className="gmap" />
}
