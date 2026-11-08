"use client";

import { BookOpen, ClipboardList, Pill, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/diary", label: "Diary", icon: BookOpen, also: ["/foods", "/exercise"] },
  { href: "/supplements", label: "Supplements", icon: Pill, also: [] },
  { href: "/summary", label: "Summary", icon: ClipboardList, also: [] },
  { href: "/targets", label: "Targets", icon: Target, also: [] },
] as const;

/** Bottom tab bar: the thumb-reachable way around a phone app. Four tabs, never more than five. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map(({ href, label, icon: Icon, also }) => {
          const active = [href, ...also].some((p) => pathname === p || pathname.startsWith(`${p}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  active ? "text-primary" : "text-muted"
                }`}
              >
                <Icon aria-hidden className="size-6" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
