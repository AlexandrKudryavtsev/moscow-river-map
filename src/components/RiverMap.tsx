import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import buildings from '../data/buildings.json'
import { MOSCOW_DATA } from '../data/moscowData'
import { buildMoscowGeo } from '../lib/map/moscowGeo'
import { blankMapStyle } from '../lib/map/mapStyle'
import { renderShips, renderStaticOverlay } from '../lib/map/svgOverlay'
import { LandmarkMarkerGlyph } from './LandmarkMarkerGlyph'
import { LandmarkSvgDefs } from './LandmarkSvgDefs'

const BUILDINGS_SOURCE_ID = 'moscow-buildings'
const BUILDINGS_FILL_LAYER_ID = 'moscow-buildings-fill'
const BUILDINGS_OUTLINE_LAYER_ID = 'moscow-buildings-outline'

const addBuildingsLayer = (map: maplibregl.Map): void => {
  if (map.getSource(BUILDINGS_SOURCE_ID)) {
    return
  }

  map.addSource(BUILDINGS_SOURCE_ID, {
    type: 'geojson',
    data: buildings as GeoJSON.FeatureCollection<GeoJSON.Polygon>,
  })

  map.addLayer({
    id: BUILDINGS_FILL_LAYER_ID,
    type: 'fill',
    source: BUILDINGS_SOURCE_ID,
    paint: {
      'fill-color': '#c9d3c9',
      'fill-opacity': 0.9,
    },
  })

  map.addLayer({
    id: BUILDINGS_OUTLINE_LAYER_ID,
    type: 'line',
    source: BUILDINGS_SOURCE_ID,
    paint: {
      'line-color': '#9ca99f',
      'line-width': 0.7,
      'line-opacity': 0.9,
    },
  })
}

export function RiverMap() {
  const mapNodeRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<SVGSVGElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const animationStartedAtRef = useRef<number>(0)
  const geo = useMemo(() => buildMoscowGeo(), [])
  const activeRoute = geo.routes[0] ?? null
  const activeRouteLabels = activeRoute?.name.split(' — ') ?? []
  const activeRouteStartLabel = activeRouteLabels[0] ?? 'Парк Фили'
  const activeRouteEndLabel = activeRouteLabels[1] ?? 'Печатники'

  useEffect(() => {
    if (!mapNodeRef.current) {
      return undefined
    }

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: blankMapStyle,
      center: MOSCOW_DATA.center,
      zoom: 10.15,
      minZoom: 9,
      maxZoom: 16.8,
      maxBounds: MOSCOW_DATA.bounds,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
        visualizePitch: false,
      }),
      'top-right',
    )

    let disposed = false
    let setupDone = false

    const setupMap = () => {
      if (disposed || setupDone) {
        return
      }

      if (!map.loaded() || !overlayRef.current || !mapNodeRef.current?.clientWidth) {
        window.requestAnimationFrame(setupMap)
        return
      }

      try {
        map.resize()
        map.fitBounds(MOSCOW_DATA.bounds, {
          padding: { top: 32, right: 36, bottom: 32, left: 36 },
          duration: 0,
        })
        renderStaticOverlay(map, geo, overlayRef.current)
      } catch {
        window.requestAnimationFrame(setupMap)
        return
      }

      setupDone = true

      animationStartedAtRef.current = performance.now()
      const tick = () => {
        map.triggerRepaint()
        animationRef.current = window.requestAnimationFrame(tick)
      }

      animationRef.current = window.requestAnimationFrame(tick)
    }

    const syncStaticOverlay = () => {
      if (!setupDone) {
        return
      }
      renderStaticOverlay(map, geo, overlayRef.current)
      const elapsed = (performance.now() - animationStartedAtRef.current) / 1000
      renderShips(map, geo, overlayRef.current, elapsed)
    }

    map.on('render', syncStaticOverlay)
    map.on('resize', syncStaticOverlay)
    map.once('load', setupMap)
    map.once('load', () => addBuildingsLayer(map))
    window.requestAnimationFrame(setupMap)
    const setupTimeoutId = window.setTimeout(setupMap, 50)

    return () => {
      disposed = true
      window.clearTimeout(setupTimeoutId)

      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current)
      }

      map.remove()
    }
  }, [geo])

  return (
    <main className="river-app">
      <section className="map-stage" aria-label="Схематичная карта Москвы-реки">
        <div ref={mapNodeRef} className="moscow-map" />
        <svg ref={overlayRef} className="schematic-overlay" aria-hidden="true">
          <defs>
            <LandmarkSvgDefs />
            <clipPath id="moscow-city-clip">
              <path data-map-shape="city-clip" />
            </clipPath>
          </defs>
          <path className="city-shape" data-map-shape="city" />
          <g clipPath="url(#moscow-city-clip)">
            {geo.ringLines.features.map((_, index) => (
              <path key={index} className="city-ring" data-ring-index={index} />
            ))}
            {geo.roadLines.features.map((feature, index) => (
              <path
                key={feature.properties.id}
                className={`road-line road-${feature.properties.kind}`}
                data-road-index={index}
              />
            ))}
            {geo.parkAreas.features.map((feature, index) => (
              <path
                key={feature.properties.id}
                className="park-shape"
                data-park-index={index}
              />
            ))}
            {geo.tributaryLines.features.map((feature, index) => (
              <path
                key={feature.properties.id}
                className={`tributary-line tributary-${feature.properties.kind}`}
                data-tributary-index={index}
              />
            ))}
            {geo.tributaryAreas.features.map((feature, index) => (
              <path
                key={feature.properties.id}
                className={`tributary-area tributary-area-${feature.properties.kind}`}
                data-tributary-area-index={index}
              />
            ))}
            <path className="river-shape" data-map-shape="river" />
            <path className="river-center" data-map-line="river-center" />
            {geo.bridgeLines.features.map((feature, index) => (
              <path
                key={`bridge-casing-${feature.properties.id}`}
                className="bridge-casing"
                data-bridge-casing-index={index}
              />
            ))}
            {geo.bridgeLines.features.map((feature, index) => (
              <path
                key={feature.properties.id}
                className="bridge-line"
                data-bridge-index={index}
              />
            ))}
            {geo.routeLines.features.map((feature, index) => (
              <path
                key={feature.properties.id}
                className="ship-route"
                data-route-index={index}
              />
            ))}
            {geo.parkAreas.features.map((feature, index) => (
              <text
                key={`park-label-${feature.properties.id}`}
                className="map-label park-label"
                data-park-label-index={index}
              >
                {feature.properties.name}
              </text>
            ))}
            {geo.landmarks.features.map((feature, index) => (
              <g
                key={feature.properties.id}
                className={`landmark landmark-${feature.properties.kind}`}
                data-landmark-index={index}
              >
                <LandmarkMarkerGlyph kind={feature.properties.kind} />
                <text
                  x={feature.properties.dx}
                  y={feature.properties.dy}
                  className="map-label landmark-label"
                >
                  {feature.properties.name}
                </text>
              </g>
            ))}
            {geo.terminals.features.map((feature, index) => (
              <circle
                key={`halo-${feature.properties.id}-${feature.properties.role}`}
                r="7"
                className="terminal-halo"
                data-terminal-halo-index={index}
              />
            ))}
            {geo.terminals.features.map((feature, index) => (
              <circle
                key={`${feature.properties.id}-${feature.properties.role}`}
                r="4"
                className="terminal-dot"
                data-terminal-index={index}
              />
            ))}
            {geo.routes.map((route) => (
              <circle
                key={`halo-${route.id}`}
                r="14"
                className="ship-halo"
                data-ship-halo-id={route.id}
              />
            ))}
            {geo.routes.map((route) => (
              <circle
                key={route.id}
                r="8"
                className="ship-dot"
                data-ship-id={route.id}
                style={{ '--ship-color': route.color } as CSSProperties}
              />
            ))}
          </g>
          <path className="city-border" data-map-shape="city-border" />
        </svg>
        <div className="map-hud">
          <div>
            <p className="eyebrow">Москва</p>
            <h1>Москва-река</h1>
          </div>
          {activeRoute ? (
            <div className="route-strip" aria-label="Маршрут точки">
              <span>{activeRouteStartLabel}</span>
              <span className="route-line" />
              <span>{activeRouteEndLabel}</span>
            </div>
          ) : null}
        </div>
        <a
          className="map-attribution"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap
        </a>
      </section>
    </main>
  )
}
