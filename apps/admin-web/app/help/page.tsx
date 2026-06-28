import Link from 'next/link';
import { BookOpen, LifeBuoy, Lock, Settings, Shield, Store, CreditCard, Bell, BarChart3 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const helpLinks = [
  { href: '/', label: 'Dashboard', icon: BarChart3, description: 'Live admin overview and key metrics.' },
  { href: '/stores', label: 'Store Ops', icon: Store, description: 'Activate, suspend, and review merchant records.' },
  { href: '/payments', label: 'Payments', icon: CreditCard, description: 'Monitor invoices and payment health.' },
  { href: '/audit', label: 'Audit', icon: Shield, description: 'Review platform actions and governance trails.' },
  { href: '/notifications', label: 'Notifications', icon: Bell, description: 'Broadcasts and queue processing.' },
  { href: '/settings', label: 'Settings', icon: Settings, description: 'Manage platform admins and ownership handover.' },
];

export default function AdminHelpPage() {
  return (
    <main className="flex flex-col gap-6">
      <section className="max-w-[920px]">
        <Badge variant="secondary" className="mb-3">Help & Reference</Badge>
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Support and reference</h2>
        <p className="mt-2.5 leading-relaxed text-muted-foreground">
          This page keeps the admin console self-service: quick routes, access reminders, and a clean path to the
          operational tools.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {helpLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.href} className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
                  <Icon className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href={item.href}>Open</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Login and access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
              <p>Use the login screen to sign in as an admin or store user.</p>
              <p>Admin access is controlled by platform admin membership and permission bundles.</p>
              <p>When you hand the app over, create a new platform owner in Settings and rotate the password there.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational reminders</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc pl-4">
              <li>Store routing and admin routing are separate consoles.</li>
              <li>Keep the API token available for live admin data.</li>
              <li>Use Settings to add more platform admins later.</li>
              <li>Use Audit before making destructive changes.</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Need a fast next step?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/settings">
              <Lock className="mr-2 size-4" />
              Manage admins
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/support">
              <LifeBuoy className="mr-2 size-4" />
              Open support
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
