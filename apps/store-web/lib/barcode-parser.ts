export type ParsedBarcode = {
  imei: string | null;
  serialNumber: string | null;
  raw: string;
};

/**
 * Simple barcode parser.
 * - 15-digit string → IMEI
 * - Everything else → serial number
 */
export function parseBarcode(raw: string): ParsedBarcode {
  const cleaned = raw.trim().replace(/\s+/g, '');

  // IMEI is always 15 digits
  if (/^\d{15}$/.test(cleaned)) {
    return { imei: cleaned, serialNumber: null, raw };
  }

  // Otherwise treat as serial number
  return { imei: null, serialNumber: cleaned, raw };
}

/**
 * Parse batch paste input: one unit per line, fields separated by tab or comma.
 * Returns an array of parsed units with field values.
 */
export function parseBatchPaste(
  text: string,
  fieldKeys: string[],
): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  const units: Record<string, string>[] = [];

  // Detect header row: if first line contains any field key or label, skip it
  const firstLine = lines[0]?.toLowerCase() || '';
  const hasHeader = fieldKeys.some(
    (key) => firstLine.includes(key.toLowerCase().replace('_', ' ')),
  );
  const startIdx = hasHeader ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/[,\t]/).map((p) => p.trim());
    const unit: Record<string, string> = {};

    for (let j = 0; j < fieldKeys.length; j++) {
      if (j < parts.length && parts[j]) {
        unit[fieldKeys[j]] = parts[j];
      }
    }

    // If only one field key and one part, use it
    if (fieldKeys.length === 1 && parts.length === 1) {
      unit[fieldKeys[0]] = parts[0];
    }

    units.push(unit);
  }

  return units;
}

/**
 * Parse CSV content with header row detection.
 */
export function parseCsvUpload(
  csvText: string,
  fieldKeys: string[],
  fieldLabels: string[],
): Record<string, string>[] {
  const lines = csvText.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return [];

  // Parse header row
  const headerParts = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const columnMapping: number[] = [];

  for (const key of fieldKeys) {
    const idx = headerParts.findIndex(
      (h) =>
        h === key.toLowerCase() ||
        h === key.replace(/_/g, ' ').toLowerCase() ||
        h === fieldLabels[fieldKeys.indexOf(key)]?.toLowerCase(),
    );
    columnMapping.push(idx);
  }

  // If no header match, assume columns map directly to fieldKeys
  const useDirectMapping = columnMapping.every((idx) => idx === -1);
  const startIdx = useDirectMapping ? 0 : 1;

  const units: Record<string, string>[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    const unit: Record<string, string> = {};

    for (let j = 0; j < fieldKeys.length; j++) {
      const colIdx = useDirectMapping ? j : columnMapping[j];
      if (colIdx >= 0 && colIdx < parts.length && parts[colIdx]) {
        unit[fieldKeys[j]] = parts[colIdx];
      }
    }

    units.push(unit);
  }

  return units;
}
