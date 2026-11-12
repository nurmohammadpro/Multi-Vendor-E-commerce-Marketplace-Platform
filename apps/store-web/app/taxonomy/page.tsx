import { redirect } from 'next/navigation';

// Categories & brands live in the Catalog workspace tabs now.
export default function StoreTaxonomyPage() {
  redirect('/catalog');
}
