import { Suspense } from 'react';

import { ReturnsWorkspace } from './returns-workspace';

export default function ReturnsPage() {
  return (
    <main>
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading returns workspace...</div>}>
        <ReturnsWorkspace />
      </Suspense>
    </main>
  );
}
