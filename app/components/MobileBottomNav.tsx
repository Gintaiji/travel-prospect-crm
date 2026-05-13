"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const bottomNavigationLinks = [
  { href: "/aujourdhui", label: "Aujourd’hui" },
  { href: "/prospects", label: "Prospects" },
  { href: "/prospects?action=add", label: "+", ariaLabel: "Ajout rapide", isQuickAdd: true },
  { href: "/relances", label: "Relances" },
  { href: "/activite", label: "Activité" },
  { href: "/ressources", label: "Ressources" },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl shadow-black/40 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
        {bottomNavigationLinks.map((navigationLink) => {
          const isActive =
            !navigationLink.isQuickAdd && isActivePath(pathname, navigationLink.href);

          return (
            <Link
              key={navigationLink.href}
              href={navigationLink.href}
              aria-label={navigationLink.ariaLabel}
              className={`flex min-h-12 items-center justify-center rounded-2xl px-1 text-center font-semibold leading-tight transition ${
                navigationLink.isQuickAdd
                  ? "bg-emerald-400 text-lg text-slate-950 shadow-lg shadow-emerald-950/30 hover:bg-emerald-300"
                  : `text-[10px] ${
                      isActive
                        ? "bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-400/30"
                        : "text-slate-300 hover:bg-white/5 hover:text-emerald-100"
                    }`
              }`}
            >
              {navigationLink.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
