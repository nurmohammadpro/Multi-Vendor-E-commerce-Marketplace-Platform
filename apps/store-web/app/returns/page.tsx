import { Suspense } from 'react';

import { ReturnsWorkspace } from './returns-workspace';

export default function ReturnsPage() {
  return (
    <main>
      <section className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="m-0 text-3xl font-semibold tracking-tight">Returns & Refunds</h2>
            <p className="mt-2 max-w-[860px] leading-relaxed text-muted-foreground">
              Process sale returns and refunds. Select a completed sale, choose items to return, and issue refunds.
            </p>
          </div>
        </div>
      </section>
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading returns workspace...</div>}>
        <ReturnsWorkspace />
      </Suspense>
    </main>
  );
}
