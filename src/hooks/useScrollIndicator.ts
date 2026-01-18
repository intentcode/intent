import { useState, useEffect } from 'react';
import type { IntentV2API } from '../lib/api';

export interface ScrollMarker {
  id: string;
  anchor: string;
  top: number;
  height: number;
  isHighlighted: boolean;
  filename: string;
}

interface UseScrollIndicatorOptions {
  intents: IntentV2API[];
  selectedIntentId: string | null;
  contentSelector?: string;
}

/**
 * Hook for calculating scroll indicator marker positions
 * Uses MutationObserver to detect DOM changes (chunk expand/collapse)
 */
export function useScrollIndicator(options: UseScrollIndicatorOptions): ScrollMarker[] {
  const { intents, selectedIntentId, contentSelector = '.files-content' } = options;
  const [markers, setMarkers] = useState<ScrollMarker[]>([]);

  useEffect(() => {
    if (intents.length === 0) {
      setMarkers([]);
      return;
    }

    const calculateMarkers = () => {
      const docHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;

      if (docHeight <= viewportHeight) {
        setMarkers([]);
        return;
      }

      const newMarkers: ScrollMarker[] = [];

      intents.forEach(intent => {
        const isHighlighted = selectedIntentId ? intent.frontmatter.id === selectedIntentId : true;

        intent.resolvedChunks.forEach(chunk => {
          if (!chunk.resolved) return;

          // Find the chunk card element in the DOM
          const filename = intent.frontmatter.files[0]?.split('/').pop() || '';
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
              isHighlighted,
              filename,
            });
          }
        });
      });

      setMarkers(newMarkers);
    };

    // Calculate after DOM settles
    const timeoutId = setTimeout(calculateMarkers, 100);

    // Recalculate on resize
    window.addEventListener('resize', calculateMarkers);

    // MutationObserver for DOM changes (chunk expand/collapse)
    const observer = new MutationObserver(() => {
      setTimeout(calculateMarkers, 50);
    });

    const mainContent = document.querySelector(contentSelector);
    if (mainContent) {
      observer.observe(mainContent, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateMarkers);
      observer.disconnect();
    };
  }, [intents, selectedIntentId, contentSelector]);

  return markers;
}
