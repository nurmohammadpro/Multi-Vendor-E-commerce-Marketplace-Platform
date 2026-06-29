'use client';

import { secondaryButtonStyle, tokenMutedStyle } from './motocore-theme';

export type PaginationState = {
  page: number;
  limit: number;
  total: number;
};

export function totalPagesFor(pagination: PaginationState) {
  return Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20)));
}

export function ListPager({
  loading,
  page,
  pagination,
  onPrevious,
  onNext,
  label,
}: {
  loading?: boolean;
  page: number;
  pagination: PaginationState;
  onPrevious: () => void;
  onNext: () => void;
  label: string;
}) {
  const totalPages = totalPagesFor(pagination);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
      <span style={tokenMutedStyle}>
        Page {page} of {totalPages} · {pagination.total} {label}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onPrevious} style={secondaryButtonStyle} disabled={loading || page <= 1}>Previous</button>
        <button onClick={onNext} style={secondaryButtonStyle} disabled={loading || page >= totalPages}>Next</button>
      </div>
    </div>
  );
}
