'use client';

const STORAGE_KEYS = {
  receiptPrinter: 'mvp_hardware_receipt_printer_name',
  labelPrinter: 'mvp_hardware_label_printer_name',
  agentUrl: 'mvp_hardware_print_agent_url',
};

export type WorkstationProfile = {
  receiptPrinterName: string;
  labelPrinterName: string;
  agentUrl: string;
};

/** Best-guess agent URL: HTTPS if we're on a hosted origin, HTTP on localhost. */
function defaultAgentUrl() {
  if (typeof window === 'undefined') return 'http://127.0.0.1:17668';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:17668';
  // Hosted HTTPS origin → prefer HTTPS agent so browsers don't block mixed content
  return 'https://127.0.0.1:17669';
}

export function loadWorkstationProfile(): WorkstationProfile {
  if (typeof window === 'undefined') {
    return { receiptPrinterName: '', labelPrinterName: '', agentUrl: defaultAgentUrl() };
  }
  return {
    receiptPrinterName: localStorage.getItem(STORAGE_KEYS.receiptPrinter) || '',
    labelPrinterName: localStorage.getItem(STORAGE_KEYS.labelPrinter) || '',
    agentUrl: localStorage.getItem(STORAGE_KEYS.agentUrl) || defaultAgentUrl(),
  };
}

export function saveWorkstationProfile(profile: WorkstationProfile) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.receiptPrinter, profile.receiptPrinterName.trim());
  localStorage.setItem(STORAGE_KEYS.labelPrinter, profile.labelPrinterName.trim());
  localStorage.setItem(STORAGE_KEYS.agentUrl, profile.agentUrl.trim() || defaultAgentUrl());
}
