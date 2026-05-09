import Link from "next/link";
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
  return (
    <nav className="flex flex-wrap gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex h-10 items-center gap-2 rounded border border-transparent px-3 text-sm font-medium text-stone-700 hover:border-stone-300 hover:bg-white"
          >
            <Icon aria-hidden className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
