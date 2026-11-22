import { useEffect, useRef, useState } from 'react'
import { MAP_ID, loadMaps } from '../gmaps'
import type { LatLng, Place } from '../types'

interface Props {
  me: LatLng | null
  places: Place[]            // nearest first; index + 1 is the pin number
  selectedId?: string
  onSelect: (id: string) => void
  center?: LatLng | null
  home?: LatLng | null
  showAll?: boolean
  onMapClick?: (location: LatLng) => void
  /** Custom pin content. Without it, pins show their number (index + 1). */
  pin?: (place: Place) => HTMLElement
}

const MAX_PINS = 8

export function MapView({ me, places, selectedId, onSelect, center, home, showAll, onMapClick, pin }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const meMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const homeMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const mapClickRef = useRef(onMapClick)
  mapClickRef.current = onMapClick
  const pinRef = useRef(pin)
  pinRef.current = pin
  const lastFit = useRef('')

  // create the map once
  useEffect(() => {
    let cancelled = false
    loadMaps()
      .then(async () => {
        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary
        if (cancelled || !host.current) return
        map.current = new Map(host.current, {
          mapId: MAP_ID,
          center: center ?? me ?? places[0] ?? { lat: 35.6595, lng: 139.7005 },
          zoom: center ? 13 : 15,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false
        })
        map.current.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (event.latLng) mapClickRef.current?.({ lat: event.latLng.lat(), lng: event.latLng.lng() })
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
      homeMarker.current && (homeMarker.current.map = null)
      homeMarker.current = null

      const bounds = new google.maps.LatLngBounds()
      const visiblePlaces = showAll ? places : places.slice(0, MAX_PINS)
      visiblePlaces.forEach((p, i) => {
        const custom = pinRef.current?.(p)
        const el = custom ?? document.createElement('div')
        el.classList.add('gpin')
        if (p.id === selectedId) el.classList.add('sel')
        if (!custom) { el.textContent = String(i + 1); el.title = p.name }
        el.addEventListener('click', () => selectRef.current(p.id))
        const m = new AdvancedMarkerElement({ map: map.current!, position: { lat: p.lat, lng: p.lng }, content: el, zIndex: p.id === selectedId ? 10 : 1 })
        markers.current.push(m)
        if (showAll || p.id === selectedId || i < 2) bounds.extend({ lat: p.lat, lng: p.lng })
      })
      if (me) {
        const dot = document.createElement('div')
        dot.className = 'gme'
        meMarker.current = new AdvancedMarkerElement({ map: map.current!, position: me, content: dot, zIndex: 20 })
        bounds.extend(me)
      }
      if (home) {
        const pin = document.createElement('div')
        pin.className = 'ghome'
        pin.textContent = 'H'
        pin.title = 'Home'
        homeMarker.current = new AdvancedMarkerElement({ map: map.current!, position: home, content: pin, zIndex: 30 })
      }
      // On the trip map (showAll), tapping a pin only changes selectedId: keep the view where the user left it.
      const fitKey = JSON.stringify([visiblePlaces.map(p => p.id), me, center, home])
      if (showAll && fitKey === lastFit.current) return
      lastFit.current = fitKey
      if (center) {
        map.current!.setCenter(center)
        map.current!.setZoom(13)
      } else if (!bounds.isEmpty()) map.current!.fitBounds(bounds, 56)
    })()
    return () => { cancelled = true }
  }, [ready, places, selectedId, me, center, home, showAll])

  if (error) return <div className="map-fallback hand">{error}</div>
  return <div ref={host} className="gmap" />
}