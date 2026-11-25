import { redirect } from 'next/navigation';

// Locations are a tab inside Inventory now.
export default function StoreLocationsPage() {
  redirect('/inventory?tab=locations');
}
