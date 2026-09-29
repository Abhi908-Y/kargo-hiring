"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/emails", label: "Sent emails" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ toSend }: { toSend: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/candidates") : pathname.startsWith(href));

  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-px sm:mx-0 sm:px-0" aria-label="Main">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cx(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium",
            isActive(l.href) ? "border-teal-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {l.label}
          {l.href === "/" && toSend > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-4 text-white" title="Drafts waiting to be sent">
              {toSend}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
