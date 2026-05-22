import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Keyboard navigation for search-input → table-row flows.
 *
 * - Search input: ArrowDown  → focus first row
 * - Row:          ArrowDown  → next row
 *                 ArrowUp    → prev row (or back to search on first)
 *                 Enter      → trigger onEnter callback
 *                 Escape     → back to search input
 */
export function useListKeyNav<T>({
  items,
  onEnter,
}: {
  items: T[];
  onEnter: (item: T, index: number) => void;
}) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs   = useRef<(HTMLElement | null)[]>([]);

  // Clear focused row whenever the list changes
  useEffect(() => { setFocusedIndex(-1); }, [items.length]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown' && items.length > 0) {
        e.preventDefault();
        setFocusedIndex(0);
        rowRefs.current[0]?.focus();
      }
    },
    [items.length],
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (index < items.length - 1) {
            setFocusedIndex(index + 1);
            rowRefs.current[index + 1]?.focus();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (index === 0) {
            setFocusedIndex(-1);
            searchRef.current?.focus();
          } else {
            setFocusedIndex(index - 1);
            rowRefs.current[index - 1]?.focus();
          }
          break;
        case 'Enter':
          e.preventDefault();
          onEnter(items[index], index);
          break;
        case 'Escape':
          e.preventDefault();
          setFocusedIndex(-1);
          searchRef.current?.focus();
          break;
      }
    },
    [items, onEnter],
  );

  const setRowRef = useCallback((el: HTMLElement | null, index: number) => {
    rowRefs.current[index] = el;
  }, []);

  return { searchRef, focusedIndex, handleSearchKeyDown, handleRowKeyDown, setRowRef };
}
