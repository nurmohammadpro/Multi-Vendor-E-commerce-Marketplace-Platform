'use client';

import { useEffect, useRef } from 'react';

/**
 * Hook to enable Enter key navigation between form inputs
 * Pressing Enter will move focus to the next input in the form.
 * Supports Shift+Enter to go to previous field and respects
 * data-enter-nav="false" / data-disable-enter-nav opt-outs.
 */
export function useEnterKeyNavigation(enabled: boolean = true) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!enabled) return;

    const form = formRef.current;
    if (!form) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement;

      // Don't interfere with textarea (Enter should create new line)
      if (target.tagName === 'TEXTAREA') return;

      // Don't interfere with buttons (Enter should click)
      if (target.tagName === 'BUTTON' || target.tagName === 'A') return;

      if ((target as HTMLElement).getAttribute('data-enter-nav') === 'false') return;
      if ((target as HTMLElement).closest('[data-disable-enter-nav]')) return;

      const tag = target.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return;

      const input = target as HTMLInputElement;
      if (input.type === 'hidden' || input.disabled || (input as HTMLInputElement).readOnly) return;
      if (input.type === 'checkbox' || input.type === 'radio' || input.type === 'file' || input.type === 'submit') return;

      // Skip search inputs (keep Enter=search for filters)
      const ph = ((input as HTMLInputElement).placeholder || '').toLowerCase();
      if (ph.includes('search')) return;

      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const reverse = e.shiftKey;

      e.preventDefault();

      // Include searchable-select triggers as navigable selects
      const selector =
        'input:not([disabled]):not([type="hidden"]):not([readonly]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]), ' +
        'select:not([disabled]):not([readonly]), ' +
        'textarea:not([disabled]):not([readonly]), ' +
        'button[data-searchable-select-trigger]:not([disabled])';

      const focusableElements = Array.from(form.querySelectorAll(selector)).filter((el) => {
        const he = el as HTMLElement;
        if (he.getAttribute('data-enter-nav') === 'false') return false;
        if (he.closest('[data-disable-enter-nav]')) return false;
        if (he.tagName !== 'BUTTON') {
          const p = ((he as HTMLInputElement).placeholder || '').toLowerCase();
          if (p.includes('search')) return false;
        }
        const style = window.getComputedStyle(he);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return true;
      }) as HTMLElement[];

      if (focusableElements.length < 2) return;

      const elements = focusableElements;
      const currentIndex = elements.indexOf(target);

      if (currentIndex !== -1) {
        const nextIndex = reverse
          ? currentIndex > 0 ? currentIndex - 1 : elements.length - 1
          : currentIndex < elements.length - 1 ? currentIndex + 1 : 0;
        const nextElement = elements[nextIndex] as HTMLElement;

        nextElement.focus();

        if (nextElement.tagName === 'INPUT') {
          try {
            (nextElement as HTMLInputElement).select();
          } catch {
            // ignore for number/date inputs
          }
        }
      }
    };

    // Add event listener to the form
    form.addEventListener('keydown', handleKeyDown, true);

    return () => {
      form.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled]);

  return formRef;
}

/**
 * Hook for individual input elements to participate in Enter key navigation
 * This can be used on specific inputs when you don't want to use the form-level hook
 */
export function useEnterKeyNavigationInput(
  onNext: () => void,
  enabled: boolean = true
) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!enabled || e.key !== 'Enter') return;
    e.preventDefault();
    onNext();
  };

  return { onKeyDown: handleKeyDown };
}