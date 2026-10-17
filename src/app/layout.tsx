import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Plot2Plan AI — Preliminary architectural planning", template: "%s · Plot2Plan AI" },
  description:
    "Turn plot dimensions and building requirements into dimensioned preliminary floor plans and a planning report. Preliminary concepts only, for review by qualified professionals.",
};

export const viewport: Viewport = { themeColor: "#0f1f3d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Suspense fallback={<div className="h-14 border-b border-line bg-white" />}>
          <SiteHeader />
        </Suspense>
        <main id="main">{children}</main>
        <footer className="no-print border-t border-line bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-6 text-xs text-muted sm:px-6">
            <p className="font-medium text-ink-2">
              Preliminary concept tool. Outputs are not for construction or permit submission without review and approval by qualified professionals.
            </p>
            <p className="mt-1">Plot2Plan AI does not verify legal compliance, structural safety or site conditions.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
