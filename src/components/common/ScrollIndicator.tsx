import type { ScrollMarker } from '../../hooks/useScrollIndicator';

interface ScrollIndicatorProps {
  markers: ScrollMarker[];
  onMarkerClick?: (marker: ScrollMarker) => void;
}

/**
 * Global scroll indicator showing chunk positions on the viewport edge
 * Fixed position on the right side of the screen
 */
export function ScrollIndicator({ markers, onMarkerClick }: ScrollIndicatorProps) {
  if (markers.length === 0) return null;

  const handleClick = (marker: ScrollMarker) => {
    // Scroll to the chunk
    const el = document.getElementById(`chunk-${marker.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    onMarkerClick?.(marker);
  };

  return (
    <div className="global-scroll-indicator">
      {markers.map((marker) => (
        <div
          key={marker.id}
          className={`global-scroll-marker ${marker.isHighlighted ? 'highlighted' : 'dimmed'}`}
          style={{
            top: `${marker.top}%`,
            height: `${marker.height}%`,
          }}
          title={`${marker.anchor} (${marker.filename})`}
          onClick={() => handleClick(marker)}
        />
      ))}
    </div>
  );
}
