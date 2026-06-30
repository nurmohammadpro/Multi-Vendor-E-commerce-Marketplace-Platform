import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StoreHelpPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Support</p>
        <h1 className="text-2xl font-semibold tracking-tight">Help & reference</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Use this page for quick reminders while the store console grows into the full operational dashboard.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Common tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Check POS before opening the counter.</p>
            <p>• Review billing before changing subscription plans.</p>
            <p>• Use inventory requests for stock adjustments.</p>
            <p>• Invite staff from the Staff page.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Need support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Email: support@your-domain.example</p>
            <p>Phone: +8801000000000</p>
            <p>Response time: within one business day</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">PWA install checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Windows / Android: use the `Install App` button in the header.</p>
            <p>• macOS Safari: use `File → Add to Dock`.</p>
            <p>• iPhone / iPad Safari: use `Share → Add to Home Screen`.</p>
            <p>• After install, reopen the app and confirm the header shows `Installed App`.</p>
            <p>• If offline, confirm the `Offline` badge appears and `/offline` can still load.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access & rollout checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Owners should see approvals, billing, settings, hardware, and full staff actions.</p>
            <p>• Managers should not see owner-only billing or owner-only staff removal actions.</p>
            <p>• Salesmen should stay focused on POS and daily operational routes only.</p>
            <p>• If the header shows `Limited access`, verify the assigned store role first.</p>
            <p>• If the store is inactive, reactivate it before live counter operations.</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
