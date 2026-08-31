'use client';

import { useEffect, useState } from 'react';
import { Loader2, Edit, ArrowLeft, Package } from 'lucide-react';

type ProductDetailData = {
  product: {
    id: string;
    product_code: string;
    name: string;
    name_bn?: string;
    description?: string;
    status: string;
    is_trackable: boolean;
    has_variants: boolean;
    variant_mode: string;
    category_id?: string;
    category_name?: string;
    brand_id?: string;
    brand_name?: string;
    created_at: string;
    updated_at: string;
  };
  groups: any[];
  skus: any[];
  trackingProfile?: {
    id: string;
    name: string;
    fields: any[];
  } | null;
};

export function ProductDetail({
  productId,
  onEdit,
  onBack,
}: {
  productId: string;
  onEdit: () => void;
  onBack: () => void;
}) {
  const [data, setData] = useState<ProductDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/catalog/products/${productId}`);
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Product not found
      </div>
    );
  }

  const { product, groups, skus, trackingProfile } = data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h2 className="text-lg font-semibold">{product.name}</h2>
            <p className="text-xs text-muted-foreground">{product.product_code}</p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-md border bg-transparent px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <Edit className="size-3.5" />
          Edit
        </button>
      </div>

      {/* Product Info */}
      <div className="rounded-md border bg-card p-4">
        <h3 className="text-sm font-medium mb-3">Product Information</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Category</div>
            <div>{product.category_name || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Brand</div>
            <div>{product.brand_name || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Status</div>
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
              product.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {product.status}
            </span>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Trackable</div>
            <div>{product.is_trackable ? 'Yes' : 'No'}</div>
          </div>
          {product.description && (
            <div className="col-span-2 sm:col-span-4">
              <div className="text-muted-foreground text-xs">Description</div>
              <div>{product.description}</div>
            </div>
          )}
        </div>
      </div>

      {/* Tracking Profile */}
      {trackingProfile && (
        <div className="rounded-md border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">Tracking Profile</h3>
          <div className="mb-2">
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {trackingProfile.name}
            </span>
          </div>
          {trackingProfile.fields && trackingProfile.fields.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {trackingProfile.fields.map((f: any) => (
                <span key={f.id || f.fieldKey} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs">
                  {f.fieldLabel} ({f.fieldType})
                  {f.isRequired && <span className="ml-1 text-destructive">*</span>}
                  {f.isUnique && <span className="ml-1 text-muted-foreground">unique</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Variant Groups */}
      {groups.length > 0 && (
        <div className="rounded-md border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">Variant Groups</h3>
          <div className="space-y-2">
            {groups.map((g: any) => (
              <div key={g.id} className="flex items-center gap-2">
                <span className="text-sm font-medium">{g.name}</span>
                <span className="text-xs text-muted-foreground">({g.input_type})</span>
                {g.options && g.options.length > 0 && (
                  <div className="flex gap-1">
                    {g.options.map((o: any) => (
                      <span key={o.id} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs">
                        {o.label || o.valueText || o.valueNumber}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SKUs */}
      <div className="rounded-md border bg-card p-4">
        <h3 className="text-sm font-medium mb-3">SKUs ({skus.length})</h3>
        {skus.length === 0 ? (
          <p className="text-xs text-muted-foreground">No SKUs yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">SKU Code</th>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">Variant</th>
                  <th className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">Cost</th>
                  <th className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">Sale</th>
                  <th className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">Stock</th>
                  <th className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((sku: any) => (
                  <tr key={sku.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5 font-mono text-xs">{sku.sku_code}</td>
                    <td className="px-2 py-1.5 text-xs">{sku.variant_label || '—'}</td>
                    <td className="px-2 py-1.5 text-right text-xs">{sku.cost_price ? `৳${sku.cost_price}` : '—'}</td>
                    <td className="px-2 py-1.5 text-right text-xs">{sku.sale_price ? `৳${sku.sale_price}` : '—'}</td>
                    <td className="px-2 py-1.5 text-center text-xs">{sku.on_hand_qty ?? 0}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs ${
                        sku.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {sku.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
