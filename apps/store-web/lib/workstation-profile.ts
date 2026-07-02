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

export function loadWorkstationProfile(): WorkstationProfile {
  if (typeof window === 'undefined') {
    return {
      receiptPrinterName: '',
      labelPrinterName: '',
      agentUrl: 'http://127.0.0.1:17668',
    };
  }

  return {
    receiptPrinterName: localStorage.getItem(STORAGE_KEYS.receiptPrinter) || '',
    labelPrinterName: localStorage.getItem(STORAGE_KEYS.labelPrinter) || '',
    agentUrl: localStorage.getItem(STORAGE_KEYS.agentUrl) || 'http://127.0.0.1:17668',
  };
}

export function saveWorkstationProfile(profile: WorkstationProfile) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.receiptPrinter, profile.receiptPrinterName.trim());
  localStorage.setItem(STORAGE_KEYS.labelPrinter, profile.labelPrinterName.trim());
  localStorage.setItem(STORAGE_KEYS.agentUrl, profile.agentUrl.trim() || 'http://127.0.0.1:17668');
}
