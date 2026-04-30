export type LngLat = [number, number]
export type Bounds = [LngLat, LngLat]

export type LandmarkKind =
  | 'business'
  | 'culture'
  | 'district'
  | 'education'
  | 'historic'
  | 'park'
  | 'river-terminal'
  | 'sport'
  | 'station'
  | 'tower'
  | (string & {})


export type ParkData = {
  id: string
  osmId?: number
  name: string
  label: LngLat
  polygon: LngLat[]
}

export type BridgeData = {
  id: string
  name: string
  anchor: LngLat
  halfLengthKm?: number
}

export type RoadKind =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'link'

export type RoadData = {
  id: string
  osmId: number
  name: string
  kind: RoadKind
  path: LngLat[]
}

export type LandmarkData = {
  id: string
  name: string
  coordinates: LngLat
  kind: LandmarkKind
  dx: number
  dy: number
}

export type VesselData = {
  id: string
  name: string
  color: string
  speedKmh?: number
  durationSeconds?: number
  start: LngLat
  end: LngLat
}

export type TributaryKind = 'river' | 'canal' | 'stream'

export type TributaryData = {
  id: string
  name: string | null
  kind: TributaryKind
  paths: LngLat[][]
}

export type TributaryAreaKind = 'river' | 'canal' | 'stream' | 'riverbank' | 'ditch' | 'oxbow'

export type TributaryAreaData = {
  osm_id: string
  name: string | null
  kind: TributaryAreaKind
  rings: LngLat[][]
}

export type MoscowMapData = {
  center: LngLat
  bounds: Bounds
  outline: LngLat[]
  riverSpine: LngLat[]
  riverAreas: LngLat[][]
  roads: RoadData[]
  parks: ParkData[]
  bridges: BridgeData[]
  landmarks: LandmarkData[]
  vessels: VesselData[]
  tributaries: TributaryData[]
  tributaryAreas: TributaryAreaData[]
}
