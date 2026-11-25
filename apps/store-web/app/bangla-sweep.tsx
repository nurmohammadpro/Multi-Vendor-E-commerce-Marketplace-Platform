'use client';

// Bangla text sweep: when the store locale is বাংলা, walk the DOM and replace
// any text node (and input placeholder) whose exact English string exists in
// the dictionary. Runs after render and on DOM mutations so every workspace —
// including ones not yet wrapped in t() — renders in Bangla.
import { useEffect } from 'react';

import { trFor, type Locale } from '../lib/i18n';

export function BanglaSweep({ locale }: { locale: 'en' | 'bn' }) {
  useEffect(() => {
    if (locale !== 'bn') return;
    const t = trFor('bn');

    const sweep = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const raw = node.nodeValue || '';
        const key = raw.trim();
        if (key) {
          const bn = t(key);
          if (bn !== key) node.nodeValue = raw.replace(key, bn);
        }
        node = walker.nextNode();
      }
      document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
        const ph = el.getAttribute('placeholder') || '';
        const bn = t(ph);
        if (bn !== ph) el.setAttribute('placeholder', bn);
      });
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(sweep, 250);
    };

    sweep();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [locale]);

  return null;
}
