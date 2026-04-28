import type { StyleSpecification } from 'maplibre-gl'

export const blankMapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#eef1ec',
      },
    },
  ],
}
