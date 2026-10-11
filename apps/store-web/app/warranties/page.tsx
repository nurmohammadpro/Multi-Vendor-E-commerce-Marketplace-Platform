import { Suspense } from 'react';

import { WarrantiesWorkspace } from './warranties-workspace';

export default function WarrantiesPage() {
  return (
    <main>
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading warranties workspace...</div>}>
        <WarrantiesWorkspace />
      </Suspense>
    </main>
  );
}
