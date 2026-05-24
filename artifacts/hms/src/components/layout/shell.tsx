import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, Users, Calendar, Clock, BedDouble, TestTube, Cross, ShieldPlus, IndianRupee, Package, Scissors, Syringe, FileSignature, ClipboardCheck, Video, MessageSquare, ListTree, UserCog, Settings, Bell, Search, Menu, LogOut, Sun, Moon } from "lucide-react";

import { useMe, useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

export function Shell({ children }: { children: React.ReactNode }) {
  const { data: session } = useMe();
  const [, setLocation] = useLocation();

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 h-[100dvh]">
          <Topbar />
          <main className="flex-1 overflow-auto bg-muted/30">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar() {
  const [location] = useLocation();
  const { data: session } = useMe();
  const role = (session?.role as string | undefined) ?? "";

  type Item = { icon: React.ComponentType<{ className?: string }>; label: string; href: string; roles?: string[] };
  type Group = { label: string; items: Item[] };
  const allGroups: Group[] = [
    {
      label: "Clinical",
      items: [
        { icon: Activity, label: "Dashboard", href: "/dashboard" },
        { icon: Users, label: "Patients", href: "/patients", roles: ["admin", "doctor", "nurse", "receptionist", "labtech", "pharmacist"] },
        { icon: Calendar, label: "Appointments", href: "/appointments", roles: ["admin", "doctor", "nurse", "receptionist"] },
        { icon: Clock, label: "OPD Queue", href: "/opd", roles: ["admin", "doctor", "nurse", "receptionist"] },
        { icon: BedDouble, label: "IPD Wards", href: "/ipd", roles: ["admin", "doctor", "nurse"] },
      ],
    },
    {
      label: "Diagnostics & Pharmacy",
      items: [
        { icon: TestTube, label: "Laboratory", href: "/lab", roles: ["admin", "doctor", "labtech", "nurse"] },
        { icon: Cross, label: "Radiology", href: "/radiology", roles: ["admin", "doctor", "nurse"] },
        { icon: ShieldPlus, label: "Pharmacy", href: "/pharmacy", roles: ["admin", "pharmacist", "doctor"] },
        { icon: ClipboardCheck, label: "Prescriptions", href: "/prescriptions", roles: ["admin", "doctor", "pharmacist", "nurse"] },
      ],
    },
    {
      label: "Operations",
      items: [
        { icon: Scissors, label: "OT Bookings", href: "/ot", roles: ["admin", "doctor", "nurse"] },
        { icon: BedDouble, label: "Bed Manager", href: "/beds", roles: ["admin", "nurse", "doctor", "receptionist"] },
        { icon: Syringe, label: "Vaccinations", href: "/vaccinations", roles: ["admin", "doctor", "nurse"] },
        { icon: FileSignature, label: "Consent Forms", href: "/consent", roles: ["admin", "doctor", "nurse"] },
        { icon: Activity, label: "Checkups", href: "/checkups", roles: ["admin", "doctor", "nurse"] },
        { icon: Video, label: "Video Library", href: "/videos", roles: ["admin", "doctor", "nurse"] },
      ],
    },
    {
      label: "Inventory & Billing",
      items: [
        { icon: IndianRupee, label: "Billing", href: "/billing", roles: ["admin", "accountant", "cashier", "receptionist"] },
        { icon: Package, label: "Inventory", href: "/inventory", roles: ["admin", "pharmacist"] },
        { icon: ShieldPlus, label: "Drug Library", href: "/drugs", roles: ["admin", "pharmacist", "doctor"] },
      ],
    },
    {
      label: "People",
      items: [
        { icon: UserCog, label: "Staff Directory", href: "/staff", roles: ["admin"] },
        { icon: Calendar, label: "Duty Roster", href: "/roster", roles: ["admin", "nurse", "doctor"] },
      ],
    },
    {
      label: "System",
      items: [
        { icon: MessageSquare, label: "Notifications", href: "/notifications/templates", roles: ["admin"] },
        { icon: Bell, label: "Notification Log", href: "/notifications/log", roles: ["admin"] },
        { icon: ListTree, label: "Audit Log", href: "/audit", roles: ["admin"] },
        { icon: Settings, label: "Settings", href: "/settings" },
      ],
    },
  ];
  const navGroups = allGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.roles || it.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

  return (
    <Sidebar variant="sidebar" className="border-r border-border">
      <SidebarHeader className="h-16 flex items-center px-4 border-b border-sidebar-border gap-2">
        <div className="bg-primary text-primary-foreground p-1.5 rounded-md flex items-center justify-center">
          <Activity className="w-5 h-5" />
        </div>
        <div className="font-semibold text-lg tracking-tight truncate flex-1 text-sidebar-foreground">
          MediCare Plus
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, i) => (
          <SidebarGroup key={i}>
            <SidebarGroupLabel className="text-xs font-semibold tracking-wider uppercase text-sidebar-foreground/50">{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href))}
                    tooltip={item.label}
                  >
                    <Link href={item.href} className="flex items-center gap-3">
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

function Topbar() {
  const { toggleSidebar } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { data: session } = useMe();
  const [, setLocation] = useLocation();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setLocation("/login");
      }
    });
  };

  return (
    <header className="h-16 shrink-0 border-b border-border bg-card flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="lg:hidden">
          <Menu className="w-5 h-5" />
        </Button>
        <div className="max-w-md w-full relative hidden sm:flex">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search patients by UHID, name, or phone..." 
            className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-muted-foreground"
        >
          {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>
        
        <Button variant="ghost" size="icon" className="relative text-muted-foreground">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full border-2 border-card"></span>
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full ml-2">
              <Avatar className="h-9 w-9 border border-border">
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {session?.name?.substring(0, 2).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium leading-none">{session?.name || "User"}</span>
                <span className="text-xs leading-none text-muted-foreground">
                  {session?.email || "user@example.com"}
                </span>
                <span className="mt-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary w-fit inline-flex capitalize">
                  {session?.role || "Staff"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer flex w-full">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
