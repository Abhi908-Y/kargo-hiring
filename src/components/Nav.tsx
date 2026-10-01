"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

type Counts = Record<"auto_selected" | "review" | "auto_rejected", number>;

const LINKS: { href: string; label: string; count?: keyof Counts; badge?: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/selected", label: "Auto-selected", count: "auto_selected", badge: "bg-emerald-600" },
  { href: "/review", label: "Review", count: "review", badge: "bg-amber-500" },
  { href: "/rejected", label: "Auto-rejected", count: "auto_rejected", badge: "bg-rose-600" },
  { href: "/upload", label: "Upload" },
  { href: "/rubric", label: "Rubric" },
  { href: "/emails", label: "Sent emails" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ counts }: { counts: Counts }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/candidates") : pathname.startsWith(href));

  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-px sm:mx-0 sm:px-0" aria-label="Main">
      {LINKS.map((l) => {
        const n = l.count ? counts[l.count] : 0;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cx(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium",
              isActive(l.href) ? "border-teal-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {l.label}
            {n > 0 && <span className={cx("rounded-full px-1.5 text-[11px] font-semibold leading-4 text-white", l.badge)}>{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
