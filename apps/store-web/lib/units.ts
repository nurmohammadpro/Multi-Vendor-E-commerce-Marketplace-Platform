// Units of measure for dealership / wholesale goods. Free-text friendly:
// the product form suggests these but any short value is accepted.

export const DEALERSHIP_UNITS: string[] = [
  'pcs',
  'bag',
  'ton',
  'kg',
  'gram',
  'cft',
  'hanna',
  'trip',
  'suta',
  'litre',
  'drum',
  'box',
  'sqft',
  'foot',
  'sheet',
  'coil',
  'yard',
  'carton',
  'cylinder',
  'roll',
  'bundle',
  'packet',
];

// Sensible default unit per starter category code (see STARTER_CATEGORIES).
export const CATEGORY_DEFAULT_UNITS: Record<string, string> = {
  ROD: 'ton',
  CEM: 'bag',
  SAND: 'cft',
  BRK: 'pcs',
  PNT: 'litre',
  TIL: 'box',
  SAN: 'pcs',
  PIP: 'foot',
  GAS: 'cylinder',
  GLS: 'sqft',
  THAI: 'kg',
  WIRE: 'coil',
  ELC: 'pcs',
  LGT: 'pcs',
  ELEC: 'pcs',
  FOOD: 'kg',
  APPL: 'pcs',
};

export function defaultUnitForCategoryCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return CATEGORY_DEFAULT_UNITS[code.toUpperCase()] ?? null;
}
