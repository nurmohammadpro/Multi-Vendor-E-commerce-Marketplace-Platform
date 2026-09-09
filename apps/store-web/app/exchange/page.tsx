import { Suspense } from 'react';

import { ExchangeWorkspace } from './exchange-workspace';

export default function ExchangePage() {
  return (
    <main>
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading exchange workspace...</div>}>
        <ExchangeWorkspace />
      </Suspense>
    </main>
  );
}
