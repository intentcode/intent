import { useState, useEffect, useMemo } from 'react';
import type { IntentV2API } from '../lib/api';
import { getFileName } from '../lib/fileUtils';

export interface ScrollMarker {
  id: string;
  anchor: string;
  top: number;
  height: number;
  isHighlighted: boolean;
  filename: string;
}

interface BaseMarker {
  id: string;
  anchor: string;
  top: number;
  height: number;
  filename: string;
  intentId: string;
}

interface UseScrollIndicatorOptions {
  intents: IntentV2API[];
  selectedIntentId: string | null;
}

/**
 * Hook for calculating scroll indicator marker positions
 * Positions recalculated only on intent changes (expensive DOM calls)
 * isHighlighted recalculated via useMemo on selectedIntentId change (cheap)
 */
export function useScrollIndicator(options: UseScrollIndicatorOptions): ScrollMarker[] {
  const { intents, selectedIntentId } = options;
  const [baseMarkers, setBaseMarkers] = useState<BaseMarker[]>([]);

  // Calculate positions only when intents change (expensive - DOM calls)
  useEffect(() => {
    if (intents.length === 0) {
      setBaseMarkers([]);
      return;
    }

    const calculateMarkers = () => {
      const docHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;

      if (docHeight <= viewportHeight) {
        setBaseMarkers([]);
        return;
      }

      const newMarkers: BaseMarker[] = [];

      intents.forEach(intent => {
        intent.resolvedChunks.forEach(chunk => {
          if (!chunk.resolved) return;

          // Find the chunk card element in the DOM
          const filename = getFileName(intent.frontmatter.files[0] || '');
          const chunkEl = document.getElementById(`chunk-${filename}-${chunk.anchor}`);

          if (chunkEl) {
            const rect = chunkEl.getBoundingClientRect();
            const absoluteTop = rect.top + window.scrollY;
            const topPercent = (absoluteTop / docHeight) * 100;
            const heightPercent = Math.max((rect.height / docHeight) * 100, 0.5);

            newMarkers.push({
              id: `${filename}-${chunk.anchor}`,
              anchor: chunk.anchor,
              top: topPercent,
              height: heightPercent,
              filename,
              intentId: intent.frontmatter.id,
            });
          }
        });
      });

      setBaseMarkers(newMarkers);
    };

    // Calculate after DOM settles
    const timeoutId = setTimeout(calculateMarkers, 100);

    // Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(calculateMarkers, 150);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [intents]); // Only intents, NOT selectedIntentId

  // Apply isHighlighted based on selectedIntentId (cheap - just mapping)
  const markers = useMemo(() => {
    return baseMarkers.map(marker => ({
      id: marker.id,
      anchor: marker.anchor,
      top: marker.top,
      height: marker.height,
      filename: marker.filename,
      isHighlighted: selectedIntentId ? marker.intentId === selectedIntentId : true,
    }));
  }, [baseMarkers, selectedIntentId]);

  return markers;
}
