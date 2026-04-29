import along from '@turf/along'
import circle from '@turf/circle'
import length from '@turf/length'
import lineSlice from '@turf/line-slice'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import { featureCollection, lineString, point } from '@turf/helpers'
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  LineString,
  MultiPolygon,
  Point,
  Polygon,
} from 'geojson'
import { MOSCOW_DATA } from '../../data/moscowData'
import type {
  BridgeData,
  LandmarkData,
  LngLat,
  MoscowMapData,
  ParkData,
  RoadData,
  VesselData,
} from '../../types/mapData'
import { BRIDGE_HALF_LENGTH_KM, BRIDGE_TANGENT_SAMPLE_KM } from './constants'

export type RouteProperties = {
  id: string
  color: string
}

export type RiverRoute = RouteProperties & {
  name: string
  speedKmh?: number
  durationSeconds?: number
  line: Feature<LineString, RouteProperties>
  from: LngLat
  to: LngLat
}

export type BridgeProperties = {
  id: string
  name: string
  halfLengthKm: number
  tangentStart: LngLat
  tangentEnd: LngLat
  axisStart?: LngLat
  axisEnd?: LngLat
}

export type ParkProperties = Pick<ParkData, 'id' | 'label' | 'name'>
/** Axis-aligned bounds in WGS84 for fast viewport culling: [minLng, minLat, maxLng, maxLat] */
export type RoadBBox = readonly [number, number, number, number]

export type RoadProperties = Omit<RoadData, 'path'> & {
  bbox: RoadBBox
}
export type LandmarkProperties = Omit<LandmarkData, 'coordinates'>

export type TerminalProperties = {
  id: string
  role: 'finish' | 'start'
}

export type ShipProperties = RouteProperties & {
  progress: number
}

export type MoscowGeo = {
  riverLine: Feature<LineString>
  riverArea: Feature<MultiPolygon, { name: string }>
  cityOutline: Feature<Polygon, { name: string }>
  ringLines: FeatureCollection<LineString>
  roadLines: FeatureCollection<LineString, RoadProperties>
  parkAreas: FeatureCollection<Polygon, ParkProperties>
  bridgeLines: FeatureCollection<Point, BridgeProperties>
  landmarks: FeatureCollection<Point, LandmarkProperties>
  routes: RiverRoute[]
  routeLines: FeatureCollection<LineString, RouteProperties>
  terminals: FeatureCollection<Point, TerminalProperties>
}

function pointFeature<P extends GeoJsonProperties = GeoJsonProperties>(
  coordinates: LngLat,
  properties?: P,
): Feature<Point, P> {
  return point(coordinates, properties) as Feature<Point, P>
}

function lineFeature<P extends GeoJsonProperties = GeoJsonProperties>(
  coordinates: LngLat[],
  properties?: P,
): Feature<LineString, P> {
  return lineString(coordinates, properties) as Feature<LineString, P>
}

function lineBBoxLngLat(coordinates: LngLat[]): RoadBBox {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  return [minLng, minLat, maxLng, maxLat]
}

function getLineLocation(feature: Feature<Point>): number {
  return Number(feature.properties?.location ?? 0)
}

type SegmentIntersection = {
  point: LngLat
  roadA: LngLat
  roadB: LngLat
}

function headingDegrees(a: LngLat, b: LngLat): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

function minimalAngleDeltaDeg(a: number, b: number): number {
  const raw = Math.abs(a - b) % 180
  return raw > 90 ? 180 - raw : raw
}

function segmentIntersection(
  a1: LngLat,
  a2: LngLat,
  b1: LngLat,
  b2: LngLat,
): SegmentIntersection | null {
  const x1 = a1[0]
  const y1 = a1[1]
  const x2 = a2[0]
  const y2 = a2[1]
  const x3 = b1[0]
  const y3 = b1[1]
  const x4 = b2[0]
  const y4 = b2[1]
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)

  if (Math.abs(denom) < 1e-12) {
    return null
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom

  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null
  }

  const ix = x1 + t * (x2 - x1)
  const iy = y1 + t * (y2 - y1)

  return {
    point: [ix, iy],
    roadA: a1,
    roadB: a2,
  }
}

function inferBridgeHalfLengthKm(kind: RoadData['kind']): number {
  switch (kind) {
    case 'motorway':
    case 'trunk':
      return 0.22
    case 'primary':
      return 0.18
    case 'secondary':
      return 0.14
    default:
      return 0.11
  }
}

function riverCrossingHalfLengthKm(
  riverAreas: MoscowMapData['riverAreas'],
  anchor: LngLat,
  roadA: LngLat,
  roadB: LngLat,
  fallbackKm: number,
): number {
  const lngMeters = metersPerLongitudeDegree(anchor[1])
  const latMeters = 111320
  const bx = (roadB[0] - roadA[0]) * lngMeters
  const by = (roadB[1] - roadA[1]) * latMeters
  const dirLength = Math.hypot(bx, by)

  if (!dirLength) {
    return fallbackKm
  }

  const ux = bx / dirLength
  const uy = by / dirLength
  const intersections: number[] = []

  for (const polygon of riverAreas) {
    if (polygon.length < 2) {
      continue
    }

    for (let i = 0; i < polygon.length - 1; i += 1) {
      const p1 = polygon[i] as LngLat
      const p2 = polygon[i + 1] as LngLat
      const sx = (p1[0] - anchor[0]) * lngMeters
      const sy = (p1[1] - anchor[1]) * latMeters
      const ex = (p2[0] - anchor[0]) * lngMeters
      const ey = (p2[1] - anchor[1]) * latMeters
      const vx = ex - sx
      const vy = ey - sy
      const denom = ux * vy - uy * vx

      if (Math.abs(denom) < 1e-9) {
        continue
      }

      const t = (sx * vy - sy * vx) / denom
      const u = (sx * uy - sy * ux) / denom
      if (u < 0 || u > 1) {
        continue
      }
      intersections.push(t)
    }
  }

  if (intersections.length < 2) {
    return fallbackKm
  }

  intersections.sort((a, b) => a - b)
  let left = Number.NEGATIVE_INFINITY
  let right = Number.POSITIVE_INFINITY

  for (const t of intersections) {
    if (t < 0 && t > left) {
      left = t
    }
    if (t > 0 && t < right) {
      right = t
    }
  }

  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) {
    return fallbackKm
  }

  const widthMeters = right - left
  // Small visual overhang helps hide anti-aliased seams with river banks.
  const halfLengthMeters = widthMeters / 2 + 10
  const minHalfLengthMeters = Math.max(60, fallbackKm * 1000 * 0.7)
  const maxHalfLengthMeters = fallbackKm * 1000 * 2.2
  const clamped = Math.min(maxHalfLengthMeters, Math.max(minHalfLengthMeters, halfLengthMeters))
  return clamped / 1000
}

type InferredBridge = {
  id: string
  name: string
  anchor: LngLat
  halfLengthKm: number
  roadA: LngLat
  roadB: LngLat
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
    coordinate[1] + northMeters / 111320,
  ]
}

function axisEndpointsFromRoadSegment(
  center: LngLat,
  roadA: LngLat,
  roadB: LngLat,
  halfLengthKm: number,
): { axisStart: LngLat; axisEnd: LngLat } | null {
  const longitudeMeters = metersPerLongitudeDegree(center[1])
  const roadEastMeters = (roadB[0] - roadA[0]) * longitudeMeters
  const roadNorthMeters = (roadB[1] - roadA[1]) * 111320
  const roadLength = Math.hypot(roadEastMeters, roadNorthMeters)

  if (!roadLength) {
    return null
  }

  const unitEast = roadEastMeters / roadLength
  const unitNorth = roadNorthMeters / roadLength
  const halfLengthMeters = halfLengthKm * 1000

  return {
    axisStart: offsetCoordinate(
      center,
      -unitEast * halfLengthMeters,
      -unitNorth * halfLengthMeters,
    ),
    axisEnd: offsetCoordinate(
      center,
      unitEast * halfLengthMeters,
      unitNorth * halfLengthMeters,
    ),
  }
}

function inferBridgesFromRoadsWithAxis(data: MoscowMapData): InferredBridge[] {
  const inferred: InferredBridge[] = []
  const dedupe = new Set<string>()

  for (const road of data.roads) {
    if (road.path.length < 2) {
      continue
    }

    for (let i = 0; i < road.path.length - 1; i += 1) {
      const roadA = road.path[i] as LngLat
      const roadB = road.path[i + 1] as LngLat
      const roadHeading = headingDegrees(roadA, roadB)

      for (let j = 0; j < data.riverSpine.length - 1; j += 1) {
        const riverA = data.riverSpine[j] as LngLat
        const riverB = data.riverSpine[j + 1] as LngLat
        const riverHeading = headingDegrees(riverA, riverB)
        const crossingAngle = minimalAngleDeltaDeg(roadHeading, riverHeading)

        if (crossingAngle < 28) {
          continue
        }

        const intersection = segmentIntersection(roadA, roadB, riverA, riverB)
        if (!intersection) {
          continue
        }

        const [lng, lat] = intersection.point
        const key = `${lng.toFixed(4)}:${lat.toFixed(4)}`
        if (dedupe.has(key)) {
          continue
        }
        dedupe.add(key)

        inferred.push({
          // Keep bridge id deterministic so future manual overrides remain stable.
          id: `bridge-auto-${road.id}-${i}-${j}`,
          name: `Мост ${road.name}`,
          anchor: intersection.point,
          halfLengthKm: riverCrossingHalfLengthKm(
            data.riverAreas,
            intersection.point,
            intersection.roadA,
            intersection.roadB,
            inferBridgeHalfLengthKm(road.kind),
          ),
          roadA: intersection.roadA,
          roadB: intersection.roadB,
        })
      }
    }
  }

  return inferred
}

function createRoute(riverLine: Feature<LineString>, vessel: VesselData): RiverRoute {
  const startPoint = nearestPointOnLine(riverLine, pointFeature(vessel.start), {
    units: 'kilometers',
  }) as Feature<Point>
  const endPoint = nearestPointOnLine(riverLine, pointFeature(vessel.end), {
    units: 'kilometers',
  }) as Feature<Point>
  const startDistance = getLineLocation(startPoint)
  const endDistance = getLineLocation(endPoint)
  const startBeforeEnd = startDistance <= endDistance
  const slicedLine = startBeforeEnd
    ? lineSlice(startPoint, endPoint, riverLine)
    : lineSlice(endPoint, startPoint, riverLine)
  const coordinates = (
    startBeforeEnd
      ? slicedLine.geometry.coordinates
      : [...slicedLine.geometry.coordinates].reverse()
  ) as LngLat[]

  return {
    id: vessel.id,
    name: vessel.name,
    color: vessel.color,
    speedKmh: vessel.speedKmh,
    durationSeconds: vessel.durationSeconds,
    line: lineFeature(coordinates, {
      id: vessel.id,
      color: vessel.color,
    }),
    from: startPoint.geometry.coordinates as LngLat,
    to: endPoint.geometry.coordinates as LngLat,
  }
}

function createBridge(
  riverLine: Feature<LineString>,
  riverLength: number,
  bridge: BridgeData,
): Feature<Point, BridgeProperties> {
  const snappedAnchor = nearestPointOnLine(riverLine, pointFeature(bridge.anchor), {
    units: 'kilometers',
  }) as Feature<Point>
  const anchorDistance = getLineLocation(snappedAnchor)
  const tangentStart = along(
    riverLine,
    Math.max(0, anchorDistance - BRIDGE_TANGENT_SAMPLE_KM),
    { units: 'kilometers' },
  )
  const tangentEnd = along(
    riverLine,
    Math.min(riverLength, anchorDistance + BRIDGE_TANGENT_SAMPLE_KM),
    { units: 'kilometers' },
  )

  return pointFeature(snappedAnchor.geometry.coordinates as LngLat, {
    id: bridge.id,
    name: bridge.name,
    halfLengthKm: bridge.halfLengthKm ?? BRIDGE_HALF_LENGTH_KM,
    tangentStart: tangentStart.geometry.coordinates as LngLat,
    tangentEnd: tangentEnd.geometry.coordinates as LngLat,
  })
}

export function createShipFeature(
  route: RiverRoute,
  elapsedSeconds: number,
): Feature<Point, ShipProperties> {
  const routeLength = length(route.line, { units: 'kilometers' })

  if (!Number.isFinite(routeLength) || routeLength <= 0) {
    return pointFeature(route.from, {
      id: route.id,
      color: route.color,
      progress: 0,
    })
  }

  const secondsOneWay =
    route.durationSeconds ??
    (route.speedKmh ? (routeLength / route.speedKmh) * 3600 : 60)
  const phase = Math.max(0, elapsedSeconds) % (secondsOneWay * 2)
  const progress =
    phase <= secondsOneWay
      ? phase / secondsOneWay
      : 1 - (phase - secondsOneWay) / secondsOneWay
  const distance = routeLength * progress
  const position = along(route.line, distance, { units: 'kilometers' })

  return pointFeature(position.geometry.coordinates as LngLat, {
    id: route.id,
    color: route.color,
    progress,
  })
}

export function buildMoscowGeo(data: MoscowMapData = MOSCOW_DATA): MoscowGeo {
  const riverLine = lineFeature(data.riverSpine)
  const riverLength = length(riverLine, { units: 'kilometers' })
  const inferredBridges = inferBridgesFromRoadsWithAxis(data)
  const hasManualBridges = data.bridges.length > 0
  const riverArea: Feature<MultiPolygon, { name: string }> = {
    type: 'Feature',
    properties: { name: 'Moskva River' },
    geometry: {
      type: 'MultiPolygon',
      coordinates: data.riverAreas.map((polygon) => [polygon]),
    },
  }
  const cityOutline: Feature<Polygon, { name: string }> = {
    type: 'Feature',
    properties: { name: 'Moscow' },
    geometry: {
      type: 'Polygon',
      coordinates: [data.outline],
    },
  }
  const ringLines = featureCollection(
    [3.2, 8.2, 16.5].map((radius) =>
      lineFeature(
        circle(data.center, radius, {
          steps: 128,
          units: 'kilometers',
        }).geometry.coordinates[0] as LngLat[],
      ),
    ),
  )
  const roadLines = featureCollection(
    data.roads.map((road) =>
      lineFeature(road.path, {
        id: road.id,
        osmId: road.osmId,
        name: road.name,
        kind: road.kind,
        bbox: lineBBoxLngLat(road.path),
      }),
    ),
  )
  const parkAreas = featureCollection(
    data.parks.map((park) => ({
      type: 'Feature',
      properties: {
        id: park.id,
        name: park.name,
        label: park.label,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [park.polygon],
      },
    })) as Feature<Polygon, ParkProperties>[],
  )
  const bridgeLines = featureCollection(
    hasManualBridges
      ? data.bridges.map((bridge) => createBridge(riverLine, riverLength, bridge))
      : inferredBridges.map((bridge) => {
          const base = createBridge(riverLine, riverLength, bridge)
          const axis = axisEndpointsFromRoadSegment(
            base.geometry.coordinates as LngLat,
            bridge.roadA,
            bridge.roadB,
            bridge.halfLengthKm,
          )

          if (!axis) {
            return base
          }

          return {
            ...base,
            properties: {
              ...base.properties,
              axisStart: axis.axisStart,
              axisEnd: axis.axisEnd,
            },
          }
        }),
  )
  const landmarks = featureCollection(
    data.landmarks.map((landmark) =>
      pointFeature(landmark.coordinates, {
        id: landmark.id,
        name: landmark.name,
        kind: landmark.kind,
        dx: landmark.dx,
        dy: landmark.dy,
      }),
    ),
  )
  const routes = data.vessels.map((vessel) => createRoute(riverLine, vessel))

  return {
    riverLine,
    riverArea,
    cityOutline,
    ringLines,
    roadLines,
    parkAreas,
    bridgeLines,
    landmarks,
    routes,
    routeLines: featureCollection(routes.map((route) => route.line)),
    terminals: featureCollection<Point, TerminalProperties>(
      routes.flatMap(
        (route): Feature<Point, TerminalProperties>[] => [
          pointFeature<TerminalProperties>(route.from, {
            id: route.id,
            role: 'start',
          }),
          pointFeature<TerminalProperties>(route.to, {
            id: route.id,
            role: 'finish',
          }),
        ],
      ),
    ),
  }
}
