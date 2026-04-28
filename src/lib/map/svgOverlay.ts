import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Feature, MultiPolygon, Point, Polygon, Position } from 'geojson'
import type { LngLat } from '../../types/mapData'
import { METERS_PER_LATITUDE_DEGREE } from './constants'
import { createShipFeature, type BridgeProperties, type MoscowGeo } from './moscowGeo'

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

export function renderStaticOverlay(
  map: MapLibreMap,
  geo: MoscowGeo,
  svgNode: SVGSVGElement | null,
): void {
  if (!svgNode) {
    return
  }

  const cityPath = projectedPolygonPath(map, geo.cityOutline.geometry)

  svgNode
    .querySelector('[data-map-shape="city"]')
    ?.setAttribute('d', cityPath)
  svgNode
    .querySelector('[data-map-shape="city-clip"]')
    ?.setAttribute('d', cityPath)
  svgNode
    .querySelector('[data-map-shape="city-border"]')
    ?.setAttribute('d', cityPath)
  svgNode
    .querySelector('[data-map-shape="river"]')
    ?.setAttribute('d', projectedPolygonPath(map, geo.riverArea.geometry))
  svgNode
    .querySelector('[data-map-line="river-center"]')
    ?.setAttribute('d', projectedPath(map, geo.riverLine.geometry.coordinates))

  geo.ringLines.features.forEach((feature, index) => {
    svgNode
      .querySelector(`[data-ring-index="${index}"]`)
      ?.setAttribute('d', projectedPath(map, feature.geometry.coordinates, true))
  })

  geo.roadLines.features.forEach((feature, index) => {
    svgNode
      .querySelector(`[data-road-index="${index}"]`)
      ?.setAttribute('d', projectedPath(map, feature.geometry.coordinates))
  })

  geo.parkAreas.features.forEach((feature, index) => {
    svgNode
      .querySelector(`[data-park-index="${index}"]`)
      ?.setAttribute('d', projectedPolygonPath(map, feature.geometry))
    moveText(
      svgNode.querySelector(`[data-park-label-index="${index}"]`),
      map.project(feature.properties.label),
    )
  })

  geo.routeLines.features.forEach((feature, index) => {
    svgNode
      .querySelector(`[data-route-index="${index}"]`)
      ?.setAttribute('d', projectedPath(map, feature.geometry.coordinates))
  })

  geo.bridgeLines.features.forEach((feature, index) => {
    const bridgePath = projectedBridgePath(map, feature)

    svgNode
      .querySelector(`[data-bridge-casing-index="${index}"]`)
      ?.setAttribute('d', bridgePath)
    svgNode
      .querySelector(`[data-bridge-index="${index}"]`)
      ?.setAttribute('d', bridgePath)
  })

  geo.terminals.features.forEach((feature, index) => {
    const projected = map.project(feature.geometry.coordinates as LngLat)

    moveCircle(svgNode.querySelector(`[data-terminal-halo-index="${index}"]`), projected)
    moveCircle(svgNode.querySelector(`[data-terminal-index="${index}"]`), projected)
  })

  geo.landmarks.features.forEach((feature, index) => {
    moveGroup(
      svgNode.querySelector(`[data-landmark-index="${index}"]`),
      map.project(feature.geometry.coordinates as LngLat),
    )
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
