import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Travel Prospect CRM",
  description: "Dashboard et suivi des prospects voyage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-white">
        <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="min-w-0 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300 sm:text-sm sm:tracking-[0.25em]"
            >
              Travel Prospect CRM
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 sm:px-4"
              >
                Dashboard
              </Link>
              <Link
                href="/prospects"
                className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20 sm:px-4"
              >
                Prospects
              </Link>
              <Link
                href="/relances"
                className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 sm:px-4"
              >
                Relances
              </Link>
              <Link
                href="/activite"
                className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 sm:px-4"
              >
                Activité
              </Link>
              <Link
                href="/messages"
                className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 sm:px-4"
              >
                Messages
              </Link>
              <Link
                href="/tunnel"
                className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 sm:px-4"
              >
                Tunnel
              </Link>
              <Link
                href="/ressources"
                className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 sm:px-4"
              >
                Ressources
              </Link>
              <Link
                href="/sauvegarde"
                className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 sm:px-4"
              >
                Sauvegarde
              </Link>
              <Link
                href="/parametres"
                className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 sm:px-4"
              >
                Paramètres
              </Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
