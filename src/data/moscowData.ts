import bridges from './bridges.json'
import landmarks from './landmarks.json'
import mapConfig from './map-config.json'
import parks from './parks.json'
import riverAreas from './river-areas.json'
import riverSpine from './river-spine.json'
import vessels from './vessels.json'
import type { MoscowMapData } from '../types/mapData'

type MapConfigData = Pick<MoscowMapData, 'bounds' | 'center' | 'outline'>

const typedMapConfig = mapConfig as unknown as MapConfigData

export const MOSCOW_DATA: MoscowMapData = {
  ...typedMapConfig,
  bridges: bridges as unknown as MoscowMapData['bridges'],
  landmarks: landmarks as unknown as MoscowMapData['landmarks'],
  parks: parks as unknown as MoscowMapData['parks'],
  riverAreas: riverAreas as unknown as MoscowMapData['riverAreas'],
  riverSpine: riverSpine as unknown as MoscowMapData['riverSpine'],
  vessels: vessels as unknown as MoscowMapData['vessels'],
}
