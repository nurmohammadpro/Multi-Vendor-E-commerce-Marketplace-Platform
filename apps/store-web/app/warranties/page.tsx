import { redirect } from 'next/navigation';

// Warranties live in the After-Sales workspace now.
export default function StoreWarrantiesPage() {
  redirect('/after-sales?tab=warranties');
}
