export type LngLat = [number, number]
export type Bounds = [LngLat, LngLat]

export type LandmarkKind =
  | 'business'
  | 'culture'
  | 'district'
  | 'historic'
  | 'park'
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

export type MoscowMapData = {
  center: LngLat
  bounds: Bounds
  outline: LngLat[]
  riverSpine: LngLat[]
  riverAreas: LngLat[][]
  parks: ParkData[]
  bridges: BridgeData[]
  landmarks: LandmarkData[]
  vessels: VesselData[]
}
