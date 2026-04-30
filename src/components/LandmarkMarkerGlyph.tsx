import type { LandmarkKind } from '../types/mapData'

const ICON = 11

type IconUseProps = {
  symbolId: string
  haloClass: string
  iconClass: string
  haloR: number
  size?: number
}

function LandmarkIconUse({ symbolId, haloClass, iconClass, haloR, size = ICON }: IconUseProps) {
  const h = size / 2
  return (
    <>
      <circle r={haloR} className={haloClass} />
      <use
        href={`#${symbolId}`}
        x={-h}
        y={-h}
        width={size}
        height={size}
        className={iconClass}
      />
    </>
  )
}

/** Marker body (halo + pictogram) for a landmark; parent &lt;g&gt; supplies transform and label. */
export function LandmarkMarkerGlyph({ kind }: { kind: LandmarkKind }) {
  switch (kind) {
    case 'station':
      return (
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
      )
    case 'river-terminal':
      return (
        <>
          <circle r="8" className="river-terminal-icon-halo" />
          <use
            href="#anchor-icon"
            x="-6.4"
            y="-6.4"
            width="12.8"
            height="12.8"
            className="river-terminal-icon"
          />
        </>
      )
    case 'business':
      return (
        <LandmarkIconUse
          symbolId="landmark-icon-business"
          haloClass="landmark-business-halo"
          iconClass="landmark-business-icon"
          haloR={6.5}
        />
      )
    case 'culture':
      return (
        <LandmarkIconUse
          symbolId="landmark-icon-culture"
          haloClass="landmark-culture-halo"
          iconClass="landmark-culture-icon"
          haloR={6.5}
        />
      )
    case 'education':
      return (
        <LandmarkIconUse
          symbolId="landmark-icon-education"
          haloClass="landmark-education-halo"
          iconClass="landmark-education-icon"
          haloR={6.5}
        />
      )
    case 'historic':
      return (
        <LandmarkIconUse
          symbolId="landmark-icon-historic"
          haloClass="landmark-historic-halo"
          iconClass="landmark-historic-icon"
          haloR={6.6}
        />
      )
    case 'sport':
      return (
        <LandmarkIconUse
          symbolId="landmark-icon-sport"
          haloClass="landmark-sport-halo"
          iconClass="landmark-sport-icon"
          haloR={6.8}
          size={12}
        />
      )
    case 'park':
      return (
        <LandmarkIconUse
          symbolId="landmark-icon-park"
          haloClass="landmark-park-halo"
          iconClass="landmark-park-icon"
          haloR={6.5}
        />
      )
    case 'tower':
      return (
        <LandmarkIconUse
          symbolId="landmark-icon-tower"
          haloClass="landmark-tower-halo"
          iconClass="landmark-tower-icon"
          haloR={6.4}
        />
      )
    case 'district':
      return (
        <LandmarkIconUse
          symbolId="landmark-icon-district"
          haloClass="landmark-district-halo"
          iconClass="landmark-district-icon"
          haloR={6.5}
        />
      )
    default:
      return (
        <>
          <circle r="4.8" className="landmark-halo" />
          <circle r="2.8" className="landmark-dot" />
        </>
      )
  }
}
