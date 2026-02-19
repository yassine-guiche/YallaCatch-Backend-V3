import { useEffect, useCallback } from 'react';

/**
 * useKeyboardShortcuts - Custom hook for keyboard shortcuts
 * 
 * @param {Object} shortcuts - Map of key combinations to handlers
 * @param {Object} options - Configuration options
 * @returns {void}
 * 
 * @example
 * useKeyboardShortcuts({
 *   'ctrl+s': () => handleSave(),
 *   'ctrl+k': () => openSearch(),
 *   'escape': () => closeDialog(),
 * });
 */
export function useKeyboardShortcuts(shortcuts, options = {}) {
  const { enabled = true, preventDefault = true } = options;

  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    // Build the key combination string
    const keys = [];
    if (event.ctrlKey || event.metaKey) keys.push('ctrl');
    if (event.shiftKey) keys.push('shift');
    if (event.altKey) keys.push('alt');
    keys.push(event.key.toLowerCase());

    const combination = keys.join('+');

    // Check if we have a handler for this combination
    if (shortcuts[combination]) {
      if (preventDefault) {
        event.preventDefault();
      }
      shortcuts[combination](event);
    }
  }, [shortcuts, enabled, preventDefault]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * useEscapeKey - Simple hook for escape key handling
 * 
 * @param {Function} handler - Function to call when escape is pressed
 * @param {boolean} enabled - Whether the handler is active
 */
export function useEscapeKey(handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        handler(event);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handler, enabled]);
}

/**
 * Predefined shortcuts for common actions
 */
export const COMMON_SHORTCUTS = {
  // Navigation
  GO_TO_DASHBOARD: 'ctrl+d',
  GO_TO_USERS: 'ctrl+u',
  GO_TO_PRIZES: 'ctrl+p',
  GO_TO_SEARCH: 'ctrl+k',
  
  // Actions
  SAVE: 'ctrl+s',
  REFRESH: 'ctrl+r',
  NEW_ITEM: 'ctrl+n',
  DELETE: 'ctrl+delete',
  
  // UI
  CLOSE: 'escape',
  TOGGLE_SIDEBAR: 'ctrl+b',
};

export default useKeyboardShortcuts;
