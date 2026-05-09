"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Headphones, Home, Newspaper, Settings, Users, Workflow } from "lucide-react";

const navItems = [
  { href: "/app", label: "Home", icon: Home },
  { href: "/app/creators", label: "Creators", icon: Users },
  { href: "/app/daily", label: "Daily", icon: Newspaper },
  { href: "/app/weekly", label: "Weekly", icon: CalendarDays },
  { href: "/app/podcasts", label: "Podcasts", icon: Headphones },
  { href: "/app/jobs", label: "Jobs", icon: Workflow },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="nav-scroll flex min-w-0 flex-nowrap gap-0.5 overflow-x-auto">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-2 text-[0.82rem] font-bold text-blue-700"
                : "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2 text-[0.82rem] font-medium text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
            }
          >
            <Icon aria-hidden className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
