import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface StoryModeContextType {
  // State
  showStoryMode: boolean;
  // Actions
  toggleStoryMode: () => void;
  setShowStoryMode: (show: boolean) => void;
}

const StoryModeContext = createContext<StoryModeContextType | null>(null);

interface StoryModeProviderProps {
  children: ReactNode;
}

/**
 * Provider for story mode visibility state
 * Controls whether StoryMode is shown or hidden (CSS toggle, no unmount)
 * Only consumers of this context re-render when state changes
 */
export function StoryModeProvider({ children }: StoryModeProviderProps) {
  const [showStoryMode, setShowStoryMode] = useState(false);

  const toggleStoryMode = useCallback(() => {
    setShowStoryMode(prev => !prev);
  }, []);

  const value = useMemo<StoryModeContextType>(() => ({
    showStoryMode,
    toggleStoryMode,
    setShowStoryMode,
  }), [showStoryMode, toggleStoryMode]);

  return (
    <StoryModeContext.Provider value={value}>
      {children}
    </StoryModeContext.Provider>
  );
}

/**
 * Hook to access story mode context
 * @throws Error if used outside StoryModeProvider
 */
export function useStoryModeContext(): StoryModeContextType {
  const context = useContext(StoryModeContext);
  if (!context) {
    throw new Error('useStoryModeContext must be used within a StoryModeProvider');
  }
  return context;
}
