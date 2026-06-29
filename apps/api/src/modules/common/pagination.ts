export type PageQuery = {
  page?: number;
  limit?: number;
};

export type NormalizedPageQuery = {
  page: number;
  limit: number;
  offset: number;
};

export function normalizePageQuery(query: PageQuery, maxLimit = 100): NormalizedPageQuery {
  const page = Number.isFinite(query.page) ? Math.max(1, Math.trunc(query.page as number)) : 1;
  const limit = Number.isFinite(query.limit)
    ? Math.max(1, Math.min(Math.trunc(query.limit as number), maxLimit))
    : 20;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function stripPaginationTotal<T extends Record<string, unknown>>(rows: T[]) {
  const total = Number(rows[0]?.total_count ?? 0);
  const items = rows.map((row) => {
    const next = { ...row };
    delete next.total_count;
    return next;
  });

  return { items, total };
}
