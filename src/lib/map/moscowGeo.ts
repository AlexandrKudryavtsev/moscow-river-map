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
    data.bridges.map((bridge) => createBridge(riverLine, riverLength, bridge)),
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
