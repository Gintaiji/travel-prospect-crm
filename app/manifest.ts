import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Travel Prospect CRM",
    short_name: "Travel CRM",
    description:
      "CRM de prospection voyage pour suivre les contacts, relances et conversations.",
    start_url: "/aujourdhui",
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#10b981",
    lang: "fr",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
    shortcuts: [
      {
        name: "Aujourd’hui",
        short_name: "Aujourd’hui",
        description: "Ouvrir les actions importantes du jour.",
        url: "/aujourdhui",
      },
      {
        name: "Prospects",
        short_name: "Prospects",
        description: "Ouvrir la liste des prospects.",
        url: "/prospects",
      },
      {
        name: "Ressources",
        short_name: "Ressources",
        description: "Ouvrir les ressources.",
        url: "/ressources",
      },
      {
        name: "Sauvegarde",
        short_name: "Sauvegarde",
        description: "Ouvrir la protection des données.",
        url: "/sauvegarde",
      },
    ],
  };
}
