import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchOpenPRs, type OpenPR } from '../lib/api';

interface UsePRSwitcherReturn {
  isOpen: boolean;
  prs: OpenPR[];
  isLoading: boolean;
  toggle: () => Promise<void>;
  close: () => void;
  navigateTo: (prNumber: number) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

interface UsePRSwitcherOptions {
  owner?: string;
  repo?: string;
  currentPrNumber?: number;
}

/**
 * Hook for managing PR switcher dropdown state
 * Handles fetching PRs, click-outside detection, and navigation
 */
export function usePRSwitcher(options: UsePRSwitcherOptions): UsePRSwitcherReturn {
  const { owner, repo, currentPrNumber } = options;

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

  const toggle = useCallback(async () => {
    if (!owner || !repo) return;

    // Fetch PRs on first open
    if (!isOpen && prs.length === 0 && !isLoading) {
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

    setIsOpen(prev => !prev);
  }, [owner, repo, isOpen, prs.length, isLoading]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const navigateTo = useCallback((prNumber: number) => {
    if (!owner || !repo) return;
    if (prNumber === currentPrNumber) return;

    window.location.href = `/${owner}/${repo}/pull/${prNumber}`;
  }, [owner, repo, currentPrNumber]);

  return {
    isOpen,
    prs,
    isLoading,
    toggle,
    close,
    navigateTo,
    dropdownRef,
  };
}
