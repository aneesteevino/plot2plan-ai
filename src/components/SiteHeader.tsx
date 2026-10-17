"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cloud, HardDrive, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getStatus, type Status } from "@/lib/client/store";
import { cx } from "./ui";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke="#0f1f3d" strokeWidth="1.6" strokeDasharray="3 1.6" />
        <path d="M6 18V8h7v4h5v6z" fill="#e8eefc" stroke="#0f1f3d" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M13 12v6" stroke="#1f4fd1" strokeWidth="1.4" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        Plot2Plan <span className="text-accent">AI</span>
      </span>
    </span>
  );
}

const NAV = [
  { href: "/dashboard", label: "Projects" },
  { href: "/projects/new", label: "New project" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/settings", label: "Settings" },
];

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    getStatus().then(setStatus);
  }, []);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }

  const cloud = status?.db === "connected";
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Plot2Plan AI home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx("rounded-md px-3 py-1.5 text-sm", path === n.href ? "bg-[#eef1f5] font-medium text-ink" : "text-ink-2 hover:text-ink")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {status && (
            <Link
              href="/settings"
              title={cloud ? "Projects are saved to the cloud database" : "Cloud database not configured: projects are saved in this browser only"}
              className={cx("hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs sm:flex", cloud ? "border-[#bfe0c9] bg-[#effaf2] text-ok" : "border-[#f0d9b5] bg-warn-soft text-warn")}
            >
              {cloud ? <Cloud className="h-3.5 w-3.5" aria-hidden /> : <HardDrive className="h-3.5 w-3.5" aria-hidden />}
              {cloud ? "Cloud storage" : "Browser storage only"}
            </Link>
          )}
          <button type="button" className="rounded-md p-2 text-ink-2 md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line bg-white px-4 py-2 md:hidden" aria-label="Mobile">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="block rounded-md px-2 py-2 text-sm text-ink-2 hover:bg-[#f0f2f6]">
              {n.label}
            </Link>
          ))}
          {status && <p className="px-2 py-2 text-xs text-muted">{cloud ? "Projects are saved to cloud storage." : "Projects are saved in this browser only."}</p>}
        </nav>
      )}
    </header>
  );
}
