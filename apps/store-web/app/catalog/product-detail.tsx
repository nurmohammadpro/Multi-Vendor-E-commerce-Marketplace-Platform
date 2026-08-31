'use client';

import { useEffect, useState } from 'react';
import { Loader2, Edit, ArrowLeft, Package } from 'lucide-react';
import {
  emptyStateStyle,
  neutralButtonStyle,
  pageShellStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../merchflow-theme';

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
        <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: 'var(--muted-foreground)' }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted-foreground)' }}>
        Product not found
      </div>
    );
  }

  const { product, groups, skus, trackingProfile } = data;

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      {/* Header */}
      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onBack} style={{ ...neutralButtonStyle, minWidth: 32, minHeight: 32, padding: 0 }}>
              <ArrowLeft style={{ width: 14, height: 14 }} />
            </button>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{product.name}</h2>
              <p style={{ ...tokenMutedStyle, marginBottom: 0 }}>{product.product_code}</p>
            </div>
          </div>
          <button
            onClick={onEdit}
            style={neutralButtonStyle}
          >
            <Edit style={{ width: 13, height: 13, marginRight: 4 }} />
            Edit
          </button>
        </div>
      </article>

      {/* Product Info */}
      <article style={surfaceCardStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>Product Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, fontSize: 13 }}>
          <div>
            <div style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>Category</div>
            <div>{product.category_name || '—'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>Brand</div>
            <div>{product.brand_name || '—'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>Status</div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 500,
              background: product.status === 'active' ? 'var(--success)' : 'var(--muted)',
              color: product.status === 'active' ? 'var(--success-foreground)' : 'var(--muted-foreground)',
            }}>
              {product.status}
            </span>
          </div>
          <div>
            <div style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>Trackable</div>
            <div>{product.is_trackable ? 'Yes' : 'No'}</div>
          </div>
          {product.description && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>Description</div>
              <div>{product.description}</div>
            </div>
          )}
        </div>
      </article>

      {/* Tracking Profile */}
      {trackingProfile && (
        <article style={surfaceCardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>Tracking Profile</h3>
          <div style={{ marginBottom: 8 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 500,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}>
              {trackingProfile.name}
            </span>
          </div>
          {trackingProfile.fields && trackingProfile.fields.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {trackingProfile.fields.map((f: any) => (
                <span key={f.id || f.fieldKey} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 4,
                  padding: '2px 8px',
                  background: 'var(--muted)',
                  fontSize: 11,
                }}>
                  {f.fieldLabel} ({f.fieldType})
                  {f.isRequired && <span style={{ marginLeft: 4, color: 'var(--destructive)' }}>*</span>}
                  {f.isUnique && <span style={{ marginLeft: 4, color: 'var(--muted-foreground)' }}>unique</span>}
                </span>
              ))}
            </div>
          )}
        </article>
      )}

      {/* Variant Groups */}
      {groups.length > 0 && (
        <article style={surfaceCardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>Variant Groups</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {groups.map((g: any) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>({g.input_type})</span>
                {g.options && g.options.length > 0 && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {g.options.map((o: any) => (
                      <span key={o.id} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: 4,
                        padding: '2px 6px',
                        background: 'var(--muted)',
                        fontSize: 11,
                      }}>
                        {o.label || o.valueText || o.valueNumber}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </article>
      )}

      {/* SKUs */}
      <article style={surfaceCardStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>SKUs ({skus.length})</h3>
        {skus.length === 0 ? (
          <p style={tokenMutedStyle}>No SKUs yet</p>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>SKU Code</th>
                  <th style={tableHeaderCellStyle}>Variant</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Cost</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Sale</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>Stock</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((sku: any) => (
                  <tr key={sku.id}>
                    <td style={{ ...tableCellStyle, fontFamily: 'monospace', fontSize: 11 }}>{sku.sku_code}</td>
                    <td style={{ ...tableCellStyle, fontSize: 11 }}>{sku.variant_label || '—'}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontSize: 11 }}>{sku.cost_price ? `৳${sku.cost_price}` : '—'}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontSize: 11 }}>{sku.sale_price ? `৳${sku.sale_price}` : '—'}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'center', fontSize: 11 }}>{sku.on_hand_qty ?? 0}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontSize: 11,
                        background: sku.status === 'active' ? 'var(--success)' : 'var(--muted)',
                        color: sku.status === 'active' ? 'var(--success-foreground)' : 'var(--muted-foreground)',
                      }}>
                        {sku.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
