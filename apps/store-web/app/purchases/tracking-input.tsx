'use client';

export type TrackingField = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  isRequired: boolean;
  isUnique: boolean;
  sortOrder: number;
};

export function TrackingInput({
  fields,
  values,
  onChange,
  errors,
}: {
  fields: TrackingField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  errors?: Record<string, string>;
}) {
  if (!fields || fields.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((field) => (
        <div key={field.id} className="space-y-1">
          <label className="text-xs font-medium">
            {field.fieldLabel}
            {field.isRequired && <span className="ml-0.5 text-destructive">*</span>}
          </label>
          <input
            type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
            value={values[field.fieldKey] || ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
            placeholder={field.fieldLabel}
            className={`h-8 w-full rounded-md border bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${
              errors?.[field.fieldKey] ? 'border-destructive' : ''
            }`}
          />
          {errors?.[field.fieldKey] && (
            <p className="text-xs text-destructive">{errors[field.fieldKey]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
