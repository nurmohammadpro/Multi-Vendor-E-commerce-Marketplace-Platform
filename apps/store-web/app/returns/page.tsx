import { redirect } from 'next/navigation';

// Returns live in the After-Sales workspace now. Forward any saleId so the
// "Return" action from sales history still deep-links correctly.
export default async function StoreReturnsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const params = (await searchParams) ?? {};
  const query = new URLSearchParams();
  query.set('tab', 'returns');
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') query.set(key, value);
  }
  redirect(`/after-sales?${query.toString()}`);
}
