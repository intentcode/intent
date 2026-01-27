import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { fetchOpenPRs, type OpenPR } from '../lib/api';

interface PRSwitcherContextType {
  // State
  isOpen: boolean;
  prs: OpenPR[];
  isLoading: boolean;

  // Actions
  toggle: () => void;
  close: () => void;
  navigateTo: (prNumber: number) => void;

  // Ref for click-outside detection
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

const PRSwitcherContext = createContext<PRSwitcherContextType | null>(null);

interface PRSwitcherProviderProps {
  children: ReactNode;
  owner?: string;
  repo?: string;
  currentPrNumber?: number;
}

/**
 * Provider for PR switcher state
 * Manages open/close state, PR fetching, and navigation
 * Only consumers of this context re-render when state changes
 */
export function PRSwitcherProvider({ children, owner, repo, currentPrNumber }: PRSwitcherProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prs, setPrs] = useState<OpenPR[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Reset PRs when repo changes
  useEffect(() => {
    setPrs([]);
  }, [owner, repo]);

  const toggle = useCallback(async () => {
    if (!owner || !repo) return;

    // Toggle immediately - don't wait for fetch
    const wasOpen = isOpen;
    setIsOpen(prev => !prev);

    // Fetch PRs on first open (in background)
    if (!wasOpen && prs.length === 0 && !isLoading) {
      setIsLoading(true);
      try {
        const response = await fetchOpenPRs(owner, repo);
        setPrs(response.prs);
      } catch (err) {
        console.error('Failed to fetch PRs:', err);
      } finally {
        setIsLoading(false);
      }
    }
  }, [owner, repo, isOpen, prs.length, isLoading]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const navigateTo = useCallback((prNumber: number) => {
    if (!owner || !repo) return;
    if (prNumber === currentPrNumber) return;

    window.location.href = `/${owner}/${repo}/pull/${prNumber}`;
  }, [owner, repo, currentPrNumber]);

  const value = useMemo<PRSwitcherContextType>(() => ({
    isOpen,
    prs,
    isLoading,
    toggle,
    close,
    navigateTo,
    dropdownRef,
  }), [isOpen, prs, isLoading, toggle, close, navigateTo]);

  return (
    <PRSwitcherContext.Provider value={value}>
      {children}
    </PRSwitcherContext.Provider>
  );
}

/**
 * Hook to access PR switcher context
 * @throws Error if used outside PRSwitcherProvider
 */
export function usePRSwitcherContext(): PRSwitcherContextType {
  const context = useContext(PRSwitcherContext);
  if (!context) {
    throw new Error('usePRSwitcherContext must be used within a PRSwitcherProvider');
  }
  return context;
}
