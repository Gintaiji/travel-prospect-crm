import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navigation from "./components/Navigation";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
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
  description:
    "CRM de prospection voyage pour suivre les contacts, relances et conversations.",
  manifest: "/manifest.webmanifest",
  applicationName: "Travel Prospect CRM",
  appleWebApp: {
    capable: true,
    title: "Travel Prospect CRM",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
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
        <ServiceWorkerRegister />
        <Navigation />
        {children}
      </body>
    </html>
  );
}
