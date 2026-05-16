"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigationLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/aujourdhui", label: "Aujourd’hui" },
  { href: "/prospects", label: "Prospects" },
  { href: "/qualification", label: "Qualification" },
  { href: "/relances", label: "Relances" },
  { href: "/activite", label: "Activité" },
  { href: "/messages", label: "Messages" },
  { href: "/tunnel", label: "Tunnel" },
  { href: "/ressources", label: "Ressources" },
  { href: "/sauvegarde", label: "Sauvegarde" },
  { href: "/parametres", label: "Paramètres" },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export default function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="min-w-0 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300 sm:text-sm sm:tracking-[0.25em]"
            onClick={() => setIsMenuOpen(false)}
          >
            Travel Prospect CRM
          </Link>
          <button
            className="min-h-11 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20 md:hidden"
            type="button"
            onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
            aria-expanded={isMenuOpen}
            aria-controls="global-navigation-links"
          >
            Menu
          </button>
        </div>

        <div
          id="global-navigation-links"
          className={`${isMenuOpen ? "grid" : "hidden"} gap-2 md:flex md:flex-wrap md:items-center md:gap-2`}
        >
          {navigationLinks.map((navigationLink) => {
            const isActive = isActivePath(pathname, navigationLink.href);

            return (
              <Link
                key={navigationLink.href}
                href={navigationLink.href}
                className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition md:min-h-0 md:px-3 lg:px-4 ${
                  isActive
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                    : "border-white/10 text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                {navigationLink.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
