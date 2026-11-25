'use client';

import { useEffect } from 'react';

/**
 * Global Enter key navigation for all store pages.
 * Pressing Enter moves focus to the next input field (efficient data entry).
 *
 * Exclusions:
 * - TEXTAREA (Enter should create new line)
 * - BUTTON / A (Enter should click)
 * - Elements with data-enter-nav="false" or inside [data-disable-enter-nav]
 * - Inputs with placeholder containing "Search" (search filters keep Enter=search)
 * - Inputs that already handled Enter (e.defaultPrevented)
 * - Modifier keys (Shift/Ctrl/Alt/Meta) – Shift+Enter goes to previous field
 */
export function GlobalEnterNavigation() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement;
      if (!target) return;

      // Don't interfere with textarea (multiline)
      if (target.tagName === 'TEXTAREA') return;
      // Don't interfere with buttons/links
      if (target.tagName === 'BUTTON' || target.tagName === 'A') return;

      // Opt-out via data attribute
      if (target.getAttribute('data-enter-nav') === 'false') return;
      if (target.closest('[data-disable-enter-nav]')) return;
      // Skip inside searchable-select dropdown search input (its Enter should select option, not navigate)
      const isSearchableSelectSearch = target.closest('[data-searchable-select]') && target.tagName === 'INPUT';
      if (isSearchableSelectSearch) return;

      // Only handle INPUT and SELECT (and searchable-select triggers are BUTTON but handled as target skip above)
      const tag = target.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT') return;

      const input = target as HTMLInputElement;
      if (input.type === 'hidden' || input.disabled || input.readOnly) return;
      // Skip checkbox/radio – Enter should toggle
      if (input.type === 'checkbox' || input.type === 'radio' || input.type === 'file' || input.type === 'submit') return;

      // Auto-skip search inputs (placeholder contains "search")
      const placeholder = (input.placeholder || '').toLowerCase();
      if (placeholder.includes('search')) return;

      // If custom handler already used Enter (e.g. product autocomplete, barcode scan)
      // we detect via data attribute on those specific inputs (they should set data-enter-nav=false)
      // Fallback: if input has aria-autocomplete or role combobox, skip when dropdown open
      if (input.getAttribute('aria-expanded') === 'true') return;

      // Modifier: Shift+Enter goes to previous, otherwise next
      const reverse = e.shiftKey;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // Find nearest container that has multiple focusables (form > dialog > article > section > document)
      const container =
        target.closest('form') ||
        target.closest('[data-enter-container]') ||
        target.closest('[role="dialog"]') ||
        target.closest('article') ||
        target.closest('section') ||
        document.body;

      const selector =
        'input:not([disabled]):not([type="hidden"]):not([readonly]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]), ' +
        'select:not([disabled]):not([readonly]), ' +
        'textarea:not([disabled]):not([readonly]), ' +
        'button[data-searchable-select-trigger]:not([disabled])';

      const focusableElements = Array.from(container.querySelectorAll(selector)).filter((el) => {
        const he = el as HTMLElement;
        if (he.getAttribute('data-enter-nav') === 'false') return false;
        if (he.closest('[data-disable-enter-nav]')) return false;
        // Skip search placeholder inputs in this scope (but keep searchable-select triggers)
        if (he.tagName !== 'BUTTON') {
          const ph = ((he as HTMLInputElement).placeholder || '').toLowerCase();
          if (ph.includes('search')) return false;
        }
        // Skip hidden/invisible
        if (he.offsetParent === null && he.tagName !== 'SELECT') {
          // SELECT may have offsetParent null in some layouts but still visible; check computed style
          const cs = window.getComputedStyle(he);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        }
        // Skip off-screen helper inputs (e.g. searchable-select hidden)
        const style = window.getComputedStyle(he);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return true;
      }) as HTMLElement[];

      if (focusableElements.length < 2) return;

      const currentIndex = focusableElements.indexOf(target);
      if (currentIndex === -1) return;

      // Prevent default form submit / search
      e.preventDefault();

      let nextIndex: number;
      if (reverse) {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
      } else {
        nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
      }

      const nextElement = focusableElements[nextIndex] as HTMLElement;
      nextElement.focus();

      if (nextElement.tagName === 'INPUT') {
        try {
          (nextElement as HTMLInputElement).select();
        } catch {
          // ignore if select not supported (e.g. number input)
        }
      }
    };

    // Use capture phase to intercept before React handlers that might submit
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return null;
}
