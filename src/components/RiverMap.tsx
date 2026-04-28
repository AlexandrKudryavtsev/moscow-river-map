import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MOSCOW_DATA } from '../data/moscowData'
import { buildMoscowGeo } from '../lib/map/moscowGeo'
import { blankMapStyle } from '../lib/map/mapStyle'
import { renderShips, renderStaticOverlay } from '../lib/map/svgOverlay'

export function RiverMap() {
  const mapNodeRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<SVGSVGElement | null>(null)
  const animationRef = useRef<number | null>(null)
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
      maxZoom: 13.8,
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

      const startedAt = performance.now()
      const tick = (now: number) => {
        const elapsed = (now - startedAt) / 1000

        renderShips(map, geo, overlayRef.current, elapsed)
        animationRef.current = window.requestAnimationFrame(tick)
      }

      animationRef.current = window.requestAnimationFrame(tick)
    }

    const renderAfterSetup = () => {
      if (setupDone) {
        renderStaticOverlay(map, geo, overlayRef.current)
      }
    }

    map.on('move', renderAfterSetup)
    map.on('resize', renderAfterSetup)
    map.once('load', setupMap)
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
            <symbol id="metro-icon" viewBox="0 0 24 24">
              <path d="M3.4 19h4.1l.9-3h7.2l.9 3h4.1L16.7 5h-3.1L12 10.4 10.4 5H7.3L3.4 19Zm6-6.3L12 7.4l2.6 5.3H9.4Z" />
            </symbol>
            <clipPath id="moscow-city-clip">
              <path data-map-shape="city-clip" />
            </clipPath>
          </defs>
          <path className="city-shape" data-map-shape="city" />
          <g clipPath="url(#moscow-city-clip)">
            {geo.ringLines.features.map((_, index) => (
              <path key={index} className="city-ring" data-ring-index={index} />
            ))}
            {geo.parkAreas.features.map((feature, index) => (
              <path
                key={feature.properties.id}
                className="park-shape"
                data-park-index={index}
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
                {feature.properties.kind === 'station' ? (
                  <>
                    <circle r="6.2" className="metro-icon-halo" />
                    <use
                      href="#metro-icon"
                      x="-5.4"
                      y="-5.4"
                      width="10.8"
                      height="10.8"
                      className="metro-icon"
                    />
                  </>
                ) : (
                  <>
                    <circle r="4.8" className="landmark-halo" />
                    <circle r="2.8" className="landmark-dot" />
                  </>
                )}
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
