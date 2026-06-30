'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardCheck,
  CreditCard,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import type { StoreConsoleAccess } from '../lib/access';
import { canAccessStoreFeature, type StoreConsoleFeature } from '../lib/store-plan';
import { logoutStoreClient } from '../lib/logout';
import { PwaClient } from './pwa-client';

type NavItem = {
  href: string;
  label: string;
  permission?: string;
  feature?: StoreConsoleFeature;
};

type WorkspaceShellProps = {
  badge: string;
  description?: string;
  access: StoreConsoleAccess;
  navItems: NavItem[];
  title: string;
  children: ReactNode;
};

const iconMap: Record<string, typeof LayoutDashboard> = {
  '/': LayoutDashboard,
  '/catalog': Package,
  '/inventory': Boxes,
  '/approvals': ClipboardCheck,
  '/pos': ShoppingCart,
  '/customers': Users,
  '/shipping': Truck,
  '/reports': BarChart3,
  '/activity': Activity,
  '/disputes': AlertTriangle,
  '/support': LifeBuoy,
  '/billing': CreditCard,
  '/session': LogIn,
  '/staff': UserCog,
  '/expenses': Receipt,
  '/payroll': Wallet,
  '/banking': Landmark,
  '/settings': Settings,
  '/hardware': Wrench,
};

export function WorkspaceShell({ navItems, title, badge, children, access }: WorkspaceShellProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar access={access} navItems={navItems} pathname={pathname} badge={badge} title={title} />
        <div className="flex flex-1 min-w-0 flex-col">
          <Header access={access} />
          <main className="flex-1 overflow-auto bg-slate-50/80 p-4 sm:p-6 lg:p-8">
            <div className="w-full">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({
  navItems,
  pathname,
  badge,
  title,
  access,
}: {
  navItems: NavItem[];
  pathname: string;
  badge: string;
  title: string;
  access: StoreConsoleAccess;
}) {
  const { setOpen, isMobile } = useSidebar();
  const visibleNavItems = navItems.filter(
    (item) =>
      (!item.permission || access.permissions.includes(item.permission))
      && canAccessStoreFeature(access, item.feature),
  );

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="bg-sidebar border-r border-sidebar-border">
      <SidebarHeader>
        <div className="flex items-center justify-between gap-1.5 px-1.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center justify-center size-8 rounded-md border bg-white p-1">
              {access.storeLogoUrl ? (
                <img
                  src={access.storeLogoUrl}
                  alt={`${access.storeName || 'Store'} logo`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src="/marketone-logo.svg"
                  alt="MarketOne logo"
                  className="h-full w-full object-contain"
                />
              )}
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="font-semibold text-sm leading-tight">{title}</span>
              <span className="text-[10px] text-muted-foreground">{badge}</span>
            </div>
          </div>
        </div>
        <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
          <div className="rounded-md border bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
            <div className="font-medium text-foreground">{access.planName} plan</div>
            <div>{access.storeName || 'Store workspace'}</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-normal text-muted-foreground">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => {
                const Icon = iconMap[item.href] || LayoutDashboard;
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => {
                        if (isMobile) setOpen(false);
                      }}
                      asChild
                    >
                      <Link href={item.href}>
                        <Icon className="size-3.5" />
                        <span className="text-xs font-normal">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-normal text-muted-foreground">
            Support
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Get Help">
                  <Link href="/help">
                    <LifeBuoy className="size-3.5" />
                    <span className="text-xs font-normal">Help & Reference</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
}

function Header({ access }: { access: StoreConsoleAccess }) {
  const pathname = usePathname();
  const handleLogout = () => logoutStoreClient();

  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard';
    const segment = pathname.split('/')[1];
    if (!segment) return 'Dashboard';
    return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center gap-3 sm:gap-4 border-b bg-background px-3 sm:px-4 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5 sm:h-6 mr-1 sm:mr-2" />

      <div className="flex-1 min-w-0">
        <h1 className="text-sm sm:text-base font-medium truncate">
          {getPageTitle()}
        </h1>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <PwaClient />
        <span className="hidden sm:inline-flex items-center rounded-md border bg-muted px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {access.role === 'unknown' ? 'Limited access' : `${access.role} access`}
        </span>
        <span className="hidden md:inline-flex items-center rounded-md border bg-muted px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {access.planName}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-md size-8 sm:size-9">
              <Avatar className="size-7 sm:size-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs border">
                  ST
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">Store Operator</p>
                <p className="text-xs text-muted-foreground">operator@store.dev</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {access.canManageSettings ? (
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 size-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>
                <Settings className="mr-2 size-4" />
                <span>Settings unavailable</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOut className="mr-2 size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
