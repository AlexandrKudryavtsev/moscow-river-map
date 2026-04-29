import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Feature, MultiPolygon, Point, Polygon, Position } from 'geojson'
import type { LngLat } from '../../types/mapData'
import { METERS_PER_LATITUDE_DEGREE } from './constants'
import {
  createShipFeature,
  type BridgeProperties,
  type MoscowGeo,
  type RoadBBox,
} from './moscowGeo'

type ScreenPoint = {
  x: number
  y: number
}

function toLngLat(coordinate: Position): LngLat {
  return [coordinate[0], coordinate[1]]
}

function projectedPath(
  map: MapLibreMap,
  coordinates: Position[],
  close = false,
): string {
  const path = coordinates
    .map((coordinate, index) => {
      const { x, y } = map.project(toLngLat(coordinate))

      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  return close ? `${path} Z` : path
}

function projectedPolygonPath(
  map: MapLibreMap,
  geometry: Polygon | MultiPolygon,
): string {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates
      .map((ring) => projectedPath(map, ring, true))
      .join(' ')
  }

  return geometry.coordinates
    .flatMap((polygon) => polygon.map((ring) => projectedPath(map, ring, true)))
    .join(' ')
}

function metersPerLongitudeDegree(latitude: number): number {
  return 111320 * Math.cos((latitude * Math.PI) / 180)
}

function offsetCoordinate(
  coordinate: LngLat,
  eastMeters: number,
  northMeters: number,
): LngLat {
  const longitudeMeters = metersPerLongitudeDegree(coordinate[1])

  return [
    coordinate[0] + eastMeters / longitudeMeters,
    coordinate[1] + northMeters / METERS_PER_LATITUDE_DEGREE,
  ]
}

function projectedBridgePath(
  map: MapLibreMap,
  feature: Feature<Point, BridgeProperties>,
): string {
  const center = feature.geometry.coordinates as LngLat
  const { halfLengthKm, tangentEnd, tangentStart } = feature.properties
  const longitudeMeters = metersPerLongitudeDegree(center[1])
  const tangentEastMeters = (tangentEnd[0] - tangentStart[0]) * longitudeMeters
  const tangentNorthMeters =
    (tangentEnd[1] - tangentStart[1]) * METERS_PER_LATITUDE_DEGREE
  const tangentLength = Math.hypot(tangentEastMeters, tangentNorthMeters)

  if (!tangentLength) {
    return ''
  }

  const normalEast = -tangentNorthMeters / tangentLength
  const normalNorth = tangentEastMeters / tangentLength
  const halfLengthMeters = halfLengthKm * 1000
  const start = offsetCoordinate(
    center,
    -normalEast * halfLengthMeters,
    -normalNorth * halfLengthMeters,
  )
  const end = offsetCoordinate(
    center,
    normalEast * halfLengthMeters,
    normalNorth * halfLengthMeters,
  )

  return projectedPath(map, [start, end])
}

function moveCircle(circleNode: Element | null, coordinate: ScreenPoint): void {
  if (!circleNode) {
    return
  }

  circleNode.setAttribute('cx', coordinate.x.toFixed(1))
  circleNode.setAttribute('cy', coordinate.y.toFixed(1))
}

function moveGroup(groupNode: Element | null, coordinate: ScreenPoint): void {
  if (!groupNode) {
    return
  }

  groupNode.setAttribute(
    'transform',
    `translate(${coordinate.x.toFixed(1)} ${coordinate.y.toFixed(1)})`,
  )
}

function moveText(textNode: Element | null, coordinate: ScreenPoint): void {
  if (!textNode) {
    return
  }

  textNode.setAttribute('x', coordinate.x.toFixed(1))
  textNode.setAttribute('y', coordinate.y.toFixed(1))
}

function bboxIntersectsMapBounds(
  bbox: RoadBBox,
  west: number,
  south: number,
  east: number,
  north: number,
): boolean {
  const [minLng, minLat, maxLng, maxLat] = bbox
  return !(maxLng < west || minLng > east || maxLat < south || minLat > north)
}

function paddedLngLatBounds(map: MapLibreMap, padRatio: number) {
  const b = map.getBounds()
  const lngPad = (b.getEast() - b.getWest()) * padRatio
  const latPad = (b.getNorth() - b.getSouth()) * padRatio
  return {
    west: b.getWest() - lngPad,
    east: b.getEast() + lngPad,
    south: b.getSouth() - latPad,
    north: b.getNorth() + latPad,
  }
}

function collectByDataIndex<T extends Element>(
  svg: SVGSVGElement,
  dataAttr: string,
  count: number,
): T[] {
  const out: T[] = new Array(count)
  svg.querySelectorAll(`[${dataAttr}]`).forEach((node) => {
    const i = Number((node as Element).getAttribute(dataAttr))
    if (Number.isInteger(i) && i >= 0 && i < count) {
      out[i] = node as T
    }
  })
  return out
}

type OverlayDomCache = {
  city: Element | null
  cityClip: Element | null
  cityBorder: Element | null
  river: Element | null
  riverCenter: Element | null
  rings: SVGPathElement[]
  roads: SVGPathElement[]
  parks: SVGPathElement[]
  parkLabels: SVGTextElement[]
  routes: SVGPathElement[]
  bridgeCasings: SVGPathElement[]
  bridges: SVGPathElement[]
  terminalHalos: SVGCircleElement[]
  terminals: SVGCircleElement[]
  landmarks: SVGGElement[]
}

const overlayDomCache = new WeakMap<SVGSVGElement, OverlayDomCache>()

function cacheStillValid(cache: OverlayDomCache, geo: MoscowGeo): boolean {
  return (
    cache.rings.length === geo.ringLines.features.length &&
    cache.roads.length === geo.roadLines.features.length &&
    cache.parks.length === geo.parkAreas.features.length &&
    cache.routes.length === geo.routeLines.features.length &&
    cache.bridges.length === geo.bridgeLines.features.length &&
    cache.terminals.length === geo.terminals.features.length &&
    cache.landmarks.length === geo.landmarks.features.length
  )
}

function buildOverlayDomCache(svg: SVGSVGElement, geo: MoscowGeo): OverlayDomCache {
  return {
    city: svg.querySelector('[data-map-shape="city"]'),
    cityClip: svg.querySelector('[data-map-shape="city-clip"]'),
    cityBorder: svg.querySelector('[data-map-shape="city-border"]'),
    river: svg.querySelector('[data-map-shape="river"]'),
    riverCenter: svg.querySelector('[data-map-line="river-center"]'),
    rings: collectByDataIndex<SVGPathElement>(svg, 'data-ring-index', geo.ringLines.features.length),
    roads: collectByDataIndex<SVGPathElement>(svg, 'data-road-index', geo.roadLines.features.length),
    parks: collectByDataIndex<SVGPathElement>(svg, 'data-park-index', geo.parkAreas.features.length),
    parkLabels: collectByDataIndex<SVGTextElement>(
      svg,
      'data-park-label-index',
      geo.parkAreas.features.length,
    ),
    routes: collectByDataIndex<SVGPathElement>(svg, 'data-route-index', geo.routeLines.features.length),
    bridgeCasings: collectByDataIndex<SVGPathElement>(
      svg,
      'data-bridge-casing-index',
      geo.bridgeLines.features.length,
    ),
    bridges: collectByDataIndex<SVGPathElement>(svg, 'data-bridge-index', geo.bridgeLines.features.length),
    terminalHalos: collectByDataIndex<SVGCircleElement>(
      svg,
      'data-terminal-halo-index',
      geo.terminals.features.length,
    ),
    terminals: collectByDataIndex<SVGCircleElement>(svg, 'data-terminal-index', geo.terminals.features.length),
    landmarks: collectByDataIndex<SVGGElement>(svg, 'data-landmark-index', geo.landmarks.features.length),
  }
}

function getOverlayDomCache(svg: SVGSVGElement, geo: MoscowGeo): OverlayDomCache {
  const existing = overlayDomCache.get(svg)
  if (existing && cacheStillValid(existing, geo)) {
    return existing
  }
  const built = buildOverlayDomCache(svg, geo)
  overlayDomCache.set(svg, built)
  return built
}

export function renderStaticOverlay(
  map: MapLibreMap,
  geo: MoscowGeo,
  svgNode: SVGSVGElement | null,
): void {
  if (!svgNode) {
    return
  }

  const dom = getOverlayDomCache(svgNode, geo)
  const cityPath = projectedPolygonPath(map, geo.cityOutline.geometry)

  dom.city?.setAttribute('d', cityPath)
  dom.cityClip?.setAttribute('d', cityPath)
  dom.cityBorder?.setAttribute('d', cityPath)
  dom.river?.setAttribute('d', projectedPolygonPath(map, geo.riverArea.geometry))
  dom.riverCenter?.setAttribute('d', projectedPath(map, geo.riverLine.geometry.coordinates))

  geo.ringLines.features.forEach((feature, index) => {
    dom.rings[index]?.setAttribute('d', projectedPath(map, feature.geometry.coordinates, true))
  })

  const { west, south, east, north } = paddedLngLatBounds(map, 0.08)

  geo.roadLines.features.forEach((feature, index) => {
    const pathEl = dom.roads[index]
    if (!pathEl) {
      return
    }

    if (!bboxIntersectsMapBounds(feature.properties.bbox, west, south, east, north)) {
      pathEl.setAttribute('d', '')
      return
    }

    pathEl.setAttribute('d', projectedPath(map, feature.geometry.coordinates))
  })

  geo.parkAreas.features.forEach((feature, index) => {
    dom.parks[index]?.setAttribute('d', projectedPolygonPath(map, feature.geometry))
    moveText(dom.parkLabels[index] ?? null, map.project(feature.properties.label))
  })

  geo.routeLines.features.forEach((feature, index) => {
    dom.routes[index]?.setAttribute('d', projectedPath(map, feature.geometry.coordinates))
  })

  geo.bridgeLines.features.forEach((feature, index) => {
    const bridgePath = projectedBridgePath(map, feature)
    dom.bridgeCasings[index]?.setAttribute('d', bridgePath)
    dom.bridges[index]?.setAttribute('d', bridgePath)
  })

  geo.terminals.features.forEach((feature, index) => {
    const projected = map.project(feature.geometry.coordinates as LngLat)
    moveCircle(dom.terminalHalos[index] ?? null, projected)
    moveCircle(dom.terminals[index] ?? null, projected)
  })

  geo.landmarks.features.forEach((feature, index) => {
    moveGroup(dom.landmarks[index] ?? null, map.project(feature.geometry.coordinates as LngLat))
  })

  svgNode.classList.add('is-ready')
}

export function renderShips(
  map: MapLibreMap,
  geo: MoscowGeo,
  svgNode: SVGSVGElement | null,
  elapsedSeconds: number,
): void {
  if (!svgNode) {
    return
  }

  geo.routes.forEach((route, index) => {
    const ship = createShipFeature(route, elapsedSeconds + index * 9)
    const projected = map.project(ship.geometry.coordinates as LngLat)

    moveCircle(svgNode.querySelector(`[data-ship-halo-id="${route.id}"]`), projected)
    moveCircle(svgNode.querySelector(`[data-ship-id="${route.id}"]`), projected)
  })
}
