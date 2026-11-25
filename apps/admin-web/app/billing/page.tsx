import { BillingWorkspace } from './billing-workspace';

export default function AdminBillingPage() {
  return (
    <main>
      <section className="mb-6">
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Billing Plans</h2>
        <p className="mt-2.5 max-w-[860px] leading-relaxed text-muted-foreground">
          Manage subscription plans — create custom plans with feature toggles, user/location limits, and BDT pricing.
        </p>
      </section>
      <BillingWorkspace />
    </main>
  );
}
