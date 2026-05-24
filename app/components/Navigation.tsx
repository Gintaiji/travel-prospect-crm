"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const principalLinks = [
  { href: "/aujourdhui", label: "Aujourd’hui" },
  { href: "/prospects", label: "Prospects" },
  { href: "/relances", label: "Relances" },
  { href: "/activite", label: "Activité" },
];

const toolLinks = [
  { href: "/messages", label: "Messages & tunnel" },
  { href: "/ressources", label: "Ressources" },
  { href: "/qualification", label: "Qualification" },
];

const dataLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/sauvegarde", label: "Sauvegarde" },
  { href: "/parametres", label: "Paramètres" },
  { href: "/connexion", label: "Connexion" },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

function hasActiveLink(
  pathname: string,
  links: Array<{ href: string; label: string }>,
) {
  return links.some((navigationLink) =>
    isActivePath(pathname, navigationLink.href),
  );
}

function linkClassName(isActive: boolean) {
  return `min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition md:min-h-0 md:px-3 lg:px-4 ${
    isActive
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
      : "border-white/10 text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200"
  }`;
}

function menuButtonClassName(isActive: boolean) {
  return `min-h-11 rounded-full border px-4 py-2 text-left text-sm font-semibold transition md:min-h-0 md:px-3 lg:px-4 ${
    isActive
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : "border-white/10 text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200"
  }`;
}

type NavigationLink = {
  href: string;
  label: string;
};

type DesktopMenuProps = {
  label: string;
  links: NavigationLink[];
  isActive: boolean;
  openMenu: string | null;
  setOpenMenu: (menu: string | null) => void;
  pathname: string;
};

function DesktopMenu({
  label,
  links,
  isActive,
  openMenu,
  setOpenMenu,
  pathname,
}: DesktopMenuProps) {
  const isOpen = openMenu === label;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpenMenu(label)}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <button
        type="button"
        className={menuButtonClassName(isActive)}
        onClick={() => setOpenMenu(isOpen ? null : label)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {label}
      </button>
      <div
        className={`absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-950/98 p-2 shadow-2xl shadow-black/40 backdrop-blur ${
          isOpen ? "grid" : "hidden"
        }`}
        role="menu"
      >
        {links.map((navigationLink) => {
          const isLinkActive = isActivePath(pathname, navigationLink.href);

          return (
            <Link
              key={navigationLink.href}
              href={navigationLink.href}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                isLinkActive
                  ? "bg-emerald-400/10 text-emerald-200"
                  : "text-slate-200 hover:bg-emerald-400/10 hover:text-emerald-200"
              }`}
              onClick={() => setOpenMenu(null)}
              role="menuitem"
            >
              {navigationLink.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type MobileGroupProps = {
  title: string;
  links: NavigationLink[];
  pathname: string;
  closeMenu: () => void;
};

function MobileGroup({ title, links, pathname, closeMenu }: MobileGroupProps) {
  return (
    <section className="grid gap-2">
      <h2 className="px-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300/80">
        {title}
      </h2>
      <div className="grid gap-2">
        {links.map((navigationLink) => {
          const isActive = isActivePath(pathname, navigationLink.href);

          return (
            <Link
              key={navigationLink.href}
              href={navigationLink.href}
              className={linkClassName(isActive)}
              onClick={closeMenu}
            >
              {navigationLink.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const isToolsActive = hasActiveLink(pathname, toolLinks);
  const isDataActive = hasActiveLink(pathname, dataLinks);

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

        <div className="hidden items-center gap-2 md:flex md:flex-wrap">
          {principalLinks.map((navigationLink) => {
            const isActive = isActivePath(pathname, navigationLink.href);

            return (
              <Link
                key={navigationLink.href}
                href={navigationLink.href}
                className={linkClassName(isActive)}
              >
                {navigationLink.label}
              </Link>
            );
          })}
          <DesktopMenu
            label="Outils"
            links={toolLinks}
            isActive={isToolsActive}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            pathname={pathname}
          />
          <DesktopMenu
            label="Données"
            links={dataLinks}
            isActive={isDataActive}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            pathname={pathname}
          />
        </div>

        <div
          id="global-navigation-links"
          className={`${isMenuOpen ? "grid" : "hidden"} gap-5 md:hidden`}
        >
          <MobileGroup
            title="Principal"
            links={principalLinks}
            pathname={pathname}
            closeMenu={() => setIsMenuOpen(false)}
          />
          <MobileGroup
            title="Outils"
            links={toolLinks}
            pathname={pathname}
            closeMenu={() => setIsMenuOpen(false)}
          />
          <MobileGroup
            title="Données"
            links={dataLinks}
            pathname={pathname}
            closeMenu={() => setIsMenuOpen(false)}
          />
        </div>
      </div>
    </nav>
  );
}
