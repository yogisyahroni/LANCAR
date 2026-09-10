import { Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMap } from 'react-leaflet'

type MapZoomControlsProps = {
  label?: string
}

/** Keyboard-reachable zoom controls for maps whose provider control is disabled. */
export function MapZoomControls({ label = 'Map zoom controls' }: MapZoomControlsProps) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())

  useEffect(() => {
    const handleZoomEnd = () => setZoom(map.getZoom())
    map.on('zoomend', handleZoomEnd)
    return () => {
      map.off('zoomend', handleZoomEnd)
    }
  }, [map])

  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex overflow-hidden rounded-xl border border-border bg-surface shadow-xl" role="group" aria-label={label}>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">Zoom peta: level {zoom}</span>
      <button
        type="button"
        onClick={() => map.zoomIn()}
        aria-label="Zoom in map"
        title="Zoom in map"
        className="flex h-10 w-10 items-center justify-center border-r border-border text-foreground-muted transition hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Plus size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => map.zoomOut()}
        aria-label="Zoom out map"
        title="Zoom out map"
        className="flex h-10 w-10 items-center justify-center text-foreground-muted transition hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Minus size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
