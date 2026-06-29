'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Store,
  CreditCard,
  BarChart3,
  Shield,
  LogIn,
  Bell,
  Settings,
  LifeBuoy,
  Wrench,
  Headphones,
  BookOpen,
  LogOut,
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
import { logoutAdminClient } from '../lib/logout';

type NavItem = {
  href: string;
  label: string;
};

type WorkspaceShellProps = {
  badge: string;
  description?: string;
  navItems: NavItem[];
  title: string;
  children: ReactNode;
};

const iconMap: Record<string, typeof LayoutDashboard> = {
  '/': LayoutDashboard,
  '/stores': Store,
  '/payments': CreditCard,
  '/reports': BarChart3,
  '/audit': Shield,
  '/session': LogIn,
  '/notifications': Bell,
  '/support': Headphones,
  '/settings': Settings,
  '/help': BookOpen,
};

export function WorkspaceShell({ navItems, title, badge, children }: WorkspaceShellProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar navItems={navItems} pathname={pathname} badge={badge} title={title} />
        <div className="flex flex-1 min-w-0 flex-col">
          <Header />
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
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
}: {
  navItems: NavItem[];
  pathname: string;
  badge: string;
  title: string;
}) {
  const { setOpen, isMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="bg-sidebar border-r border-sidebar-border">
      <SidebarHeader>
        <div className="flex items-center justify-between gap-1.5 px-1.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center justify-center size-7 rounded-md bg-primary/10 text-primary border">
              <Wrench className="size-4" />
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="font-semibold text-sm leading-tight">{title}</span>
              <span className="text-[10px] text-muted-foreground">{badge}</span>
            </div>
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
              {navItems.map((item) => {
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

function Header() {
  const pathname = usePathname();
  const handleLogout = () => logoutAdminClient();

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-md size-8 sm:size-9">
              <Avatar className="size-7 sm:size-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs border">
                  PA
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">Seeded Platform Admin</p>
                <p className="text-xs text-muted-foreground">Use the bootstrap admin account</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 size-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
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
