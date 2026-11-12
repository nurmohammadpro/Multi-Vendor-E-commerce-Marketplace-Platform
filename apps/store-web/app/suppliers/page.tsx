import { redirect } from 'next/navigation';

// Supplier management lives in the Purchases workspace (Suppliers tab) now.
export default function StoreSuppliersPage() {
  redirect('/purchases?tab=suppliers');
}
