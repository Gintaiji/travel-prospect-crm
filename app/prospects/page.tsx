"use client";

import { useEffect, useState } from "react";
import {
  createProspectId,
  loadProspects,
  saveProspects,
} from "../lib/prospectStorage";
import {
  PROSPECT_CATEGORIES,
  PROSPECT_COLOR_TYPES,
  PROSPECT_STATUSES,
  PROSPECT_TEMPERATURES,
  SOCIAL_PLATFORMS,
  type ConversationEntry,
  type Prospect,
} from "../lib/types";

type ProspectFormState = {
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string;
  businessArea: string;
  mainPlatform: Prospect["mainPlatform"];
  profileUrl: string;
  category: Prospect["category"];
  temperature: Prospect["temperature"];
  colorType: Prospect["colorType"];
  city: string;
  region: string;
  country: string;
  phone: string;
  whatsapp: string;
  email: string;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  otherUrl: string;
  notes: string;
};

type ConversationFormState = {
  date: string;
  channel: Prospect["mainPlatform"];
  content: string;
  nextAction: string;
};

type QualificationFormState = {
  status: Prospect["status"];
  category: Prospect["category"];
  temperature: Prospect["temperature"];
  colorType: Prospect["colorType"];
  score: string;
  nextActionDate: string;
  notes: string;
};

type FilterValue<T extends string> = "Tous" | T;

type ProspectFilters = {
  platform: FilterValue<Prospect["mainPlatform"]>;
  status: FilterValue<Prospect["status"]>;
  category: FilterValue<Prospect["category"]>;
  temperature: FilterValue<Prospect["temperature"]>;
  colorType: FilterValue<Prospect["colorType"]>;
};

const initialFormState: ProspectFormState = {
  firstName: "",
  lastName: "",
  displayName: "",
  jobTitle: "",
  businessArea: "",
  mainPlatform: SOCIAL_PLATFORMS[0],
  profileUrl: "",
  category: PROSPECT_CATEGORIES[0],
  temperature: PROSPECT_TEMPERATURES[0],
  colorType: PROSPECT_COLOR_TYPES[0],
  city: "",
  region: "",
  country: "",
  phone: "",
  whatsapp: "",
  email: "",
  facebookUrl: "",
  instagramUrl: "",
  linkedinUrl: "",
  tiktokUrl: "",
  youtubeUrl: "",
  otherUrl: "",
  notes: "",
};

const initialConversationFormState: ConversationFormState = {
  date: "",
  channel: SOCIAL_PLATFORMS[0],
  content: "",
  nextAction: "",
};

const initialQualificationFormState: QualificationFormState = {
  status: PROSPECT_STATUSES[0],
  category: PROSPECT_CATEGORIES[0],
  temperature: PROSPECT_TEMPERATURES[0],
  colorType: PROSPECT_COLOR_TYPES[0],
  score: "0",
  nextActionDate: "",
  notes: "",
};

const initialProspectFilters: ProspectFilters = {
  platform: "Tous",
  status: "Tous",
  category: "Tous",
  temperature: "Tous",
  colorType: "Tous",
};

const socialLinkLabels: Array<{
  key: keyof Prospect["socialLinks"];
  label: string;
}> = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "other", label: "Autre" },
];

export default function ProspectsPage () {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [formState, setFormState] = useState<ProspectFormState>(initialFormState);
  const [activeConversationProspectId, setActiveConversationProspectId] = useState<string | null>(null);
  const [conversationFormState, setConversationFormState] = useState<ConversationFormState>(
    initialConversationFormState,
  );
  const [activeQualificationProspectId, setActiveQualificationProspectId] = useState<string | null>(null);
  const [qualificationFormState, setQualificationFormState] = useState<QualificationFormState>(
    initialQualificationFormState,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [prospectFilters, setProspectFilters] = useState<ProspectFilters>(initialProspectFilters);

  useEffect(() => {
    const storedProspects = loadProspects();
    setProspects(storedProspects);
  }, []);

  function updateFormField<Field extends keyof ProspectFormState>(
    field: Field,
    value: ProspectFormState[Field],
  ) {
    setFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function updateConversationFormField<Field extends keyof ConversationFormState>(
    field: Field,
    value: ConversationFormState[Field],
  ) {
    setConversationFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function updateQualificationFormField<Field extends keyof QualificationFormState>(
    field: Field,
    value: QualificationFormState[Field],
  ) {
    setQualificationFormState((currentFormState) => ({
      ...currentFormState,
      [field]: value,
    }));
  }

  function updateProspectFilter<Field extends keyof ProspectFilters>(
    field: Field,
    value: ProspectFilters[Field],
  ) {
    setProspectFilters((currentFilters) => ({
      ...currentFilters,
      [field]: value,
    }));
  }

  function resetFilters() {
    setSearchQuery("");
    setProspectFilters(initialProspectFilters);
  }

  function toggleConversationForm(prospectId: string) {
    setActiveConversationProspectId((currentProspectId) =>
      currentProspectId === prospectId ? null : prospectId,
    );
    setConversationFormState(initialConversationFormState);
  }

  function toggleQualificationForm(prospect: Prospect) {
    if (activeQualificationProspectId === prospect.id) {
      setActiveQualificationProspectId(null);
      setQualificationFormState(initialQualificationFormState);
      return;
    }

    setActiveQualificationProspectId(prospect.id);
    setQualificationFormState({
      status: prospect.status,
      category: prospect.category,
      temperature: prospect.temperature,
      colorType: prospect.colorType,
      score: String(prospect.score),
      nextActionDate: prospect.nextActionDate,
      notes: prospect.notes,
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const now = new Date().toISOString();
    const newProspect: Prospect = {
      id: createProspectId(),
      firstName: formState.firstName.trim(),
      lastName: formState.lastName.trim(),
      displayName: formState.displayName.trim(),
      jobTitle: formState.jobTitle.trim(),
      businessArea: formState.businessArea.trim(),
      city: formState.city.trim(),
      region: formState.region.trim(),
      country: formState.country.trim(),
      phone: formState.phone.trim(),
      whatsapp: formState.whatsapp.trim(),
      email: formState.email.trim(),
      mainPlatform: formState.mainPlatform,
      profileUrl: formState.profileUrl.trim(),
      socialLinks: {
        facebook: formState.facebookUrl.trim(),
        instagram: formState.instagramUrl.trim(),
        linkedin: formState.linkedinUrl.trim(),
        tiktok: formState.tiktokUrl.trim(),
        youtube: formState.youtubeUrl.trim(),
        other: formState.otherUrl.trim(),
      },
      category: formState.category,
      status: "À contacter",
      temperature: formState.temperature,
      colorType: formState.colorType,
      score: 0,
      tags: [],
      isFollower: false,
      hasSentMessage: false,
      interactionStats: {
        followerSinceDate: "",
        commentsCount: 0,
        interactionsCount: 0,
        likesCount: 0,
        messagesCount: 0,
      },
      lastInteractionDate: "",
      nextActionDate: "",
      conversationHistory: [],
      notes: formState.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };

    const updatedProspects = [newProspect, ...prospects];
    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setFormState(initialFormState);
    setIsFormVisible(false);
  }

  function handleConversationSubmit(
    prospectId: string,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const newConversationEntry: ConversationEntry = {
      id: createProspectId(),
      date: conversationFormState.date,
      channel: conversationFormState.channel,
      content: conversationFormState.content.trim(),
      nextAction: conversationFormState.nextAction.trim(),
    };

    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      return {
        ...prospect,
        conversationHistory: [
          ...prospect.conversationHistory,
          newConversationEntry,
        ],
        lastInteractionDate: conversationFormState.date,
        updatedAt: new Date().toISOString(),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setConversationFormState(initialConversationFormState);
    setActiveConversationProspectId(null);
  }

  function handleQualificationSubmit(
    prospectId: string,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const score = Number(qualificationFormState.score);
    const updatedProspects = prospects.map((prospect) => {
      if (prospect.id !== prospectId) {
        return prospect;
      }

      return {
        ...prospect,
        status: qualificationFormState.status,
        category: qualificationFormState.category,
        temperature: qualificationFormState.temperature,
        colorType: qualificationFormState.colorType,
        score: Number.isNaN(score) ? 0 : score,
        nextActionDate: qualificationFormState.nextActionDate,
        notes: qualificationFormState.notes.trim(),
        updatedAt: new Date().toISOString(),
      };
    });

    saveProspects(updatedProspects);
    setProspects(updatedProspects);
    setActiveQualificationProspectId(null);
    setQualificationFormState(initialQualificationFormState);
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredProspects = prospects.filter((prospect) => {
    const searchableText = [
      prospect.firstName,
      prospect.lastName,
      prospect.displayName,
      prospect.jobTitle,
      prospect.businessArea,
      prospect.city,
      prospect.region,
      prospect.country,
      prospect.email,
      prospect.phone,
      prospect.whatsapp,
      prospect.notes,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !normalizedSearchQuery || searchableText.includes(normalizedSearchQuery);
    const matchesPlatform =
      prospectFilters.platform === "Tous" || prospect.mainPlatform === prospectFilters.platform;
    const matchesStatus =
      prospectFilters.status === "Tous" || prospect.status === prospectFilters.status;
    const matchesCategory =
      prospectFilters.category === "Tous" || prospect.category === prospectFilters.category;
    const matchesTemperature =
      prospectFilters.temperature === "Tous" || prospect.temperature === prospectFilters.temperature;
    const matchesColorType =
      prospectFilters.colorType === "Tous" || prospect.colorType === prospectFilters.colorType;

    return (
      matchesSearch &&
      matchesPlatform &&
      matchesStatus &&
      matchesCategory &&
      matchesTemperature &&
      matchesColorType
    );
  });

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">CRM</p>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
              <h1 className="text-4xl font-bold tracking-tight">Prospects</h1>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-200">
                {prospects.length} prospect{prospects.length > 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-slate-300">
              Ici, tu retrouveras les personnes repérées sur les réseaux sociaux,
              leur niveau d’intérêt, le statut de la conversation et les prochaines
              actions à faire.
            </p>
          </div>

          <button
            className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            type="button"
            onClick={() => setIsFormVisible((currentValue) => !currentValue)}
          >
            {isFormVisible ? "Masquer le formulaire" : "Ajouter un prospect"}
          </button>
        </header>

        {isFormVisible ? (
          <form
            className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl"
            onSubmit={handleSubmit}
          >
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">
                Nouveau prospect
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Pour la V1, on ajoute les prospects manuellement afin de garder un suivi propre et naturel.
              </p>
            </div>

            <div className="grid gap-6">
              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Identité
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                Prénom
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.firstName}
                  onChange={(event) => updateFormField("firstName", event.target.value)}
                  placeholder="Prénom"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Nom
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.lastName}
                  onChange={(event) => updateFormField("lastName", event.target.value)}
                  placeholder="Nom"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Nom affiché / pseudo
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.displayName}
                  onChange={(event) => updateFormField("displayName", event.target.value)}
                  placeholder="@pseudo"
                />
              </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Métier / poste
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.jobTitle}
                      onChange={(event) => updateFormField("jobTitle", event.target.value)}
                      placeholder="Métier ou poste"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Domaine / activité
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.businessArea}
                      onChange={(event) => updateFormField("businessArea", event.target.value)}
                      placeholder="Domaine ou activité"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Ville
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.city}
                      onChange={(event) => updateFormField("city", event.target.value)}
                      placeholder="Ville"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Région
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.region}
                      onChange={(event) => updateFormField("region", event.target.value)}
                      placeholder="Région"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Pays
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.country}
                      onChange={(event) => updateFormField("country", event.target.value)}
                      placeholder="Pays"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Coordonnées
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="grid gap-2 text-sm text-slate-300">
                    Téléphone
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.phone}
                      onChange={(event) => updateFormField("phone", event.target.value)}
                      placeholder="+33..."
                      type="tel"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    WhatsApp
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.whatsapp}
                      onChange={(event) => updateFormField("whatsapp", event.target.value)}
                      placeholder="+33..."
                      type="tel"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Email
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.email}
                      onChange={(event) => updateFormField("email", event.target.value)}
                      placeholder="email@exemple.com"
                      type="email"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Réseaux sociaux
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-2">

                  <label className="grid gap-2 text-sm text-slate-300">
                    Plateforme principale
                    <select
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                      value={formState.mainPlatform}
                      onChange={(event) =>
                        updateFormField("mainPlatform", event.target.value as Prospect["mainPlatform"])
                      }
                    >
                      {SOCIAL_PLATFORMS.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </label>

              <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                Lien du profil
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                  value={formState.profileUrl}
                  onChange={(event) => updateFormField("profileUrl", event.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien Facebook
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.facebookUrl}
                      onChange={(event) => updateFormField("facebookUrl", event.target.value)}
                      placeholder="https://facebook.com/..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien Instagram
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.instagramUrl}
                      onChange={(event) => updateFormField("instagramUrl", event.target.value)}
                      placeholder="https://instagram.com/..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien LinkedIn
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.linkedinUrl}
                      onChange={(event) => updateFormField("linkedinUrl", event.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien TikTok
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.tiktokUrl}
                      onChange={(event) => updateFormField("tiktokUrl", event.target.value)}
                      placeholder="https://tiktok.com/@..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Lien YouTube
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.youtubeUrl}
                      onChange={(event) => updateFormField("youtubeUrl", event.target.value)}
                      placeholder="https://youtube.com/..."
                      type="url"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    Autre lien
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                      value={formState.otherUrl}
                      onChange={(event) => updateFormField("otherUrl", event.target.value)}
                      placeholder="https://..."
                      type="url"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Qualification
                </legend>
                <div className="mt-4 grid gap-4 md:grid-cols-3">

              <label className="grid gap-2 text-sm text-slate-300">
                Catégorie
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.category}
                  onChange={(event) =>
                    updateFormField("category", event.target.value as Prospect["category"])
                  }
                >
                  {PROSPECT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Température / marché
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.temperature}
                  onChange={(event) =>
                    updateFormField("temperature", event.target.value as Prospect["temperature"])
                  }
                >
                  {PROSPECT_TEMPERATURES.map((temperature) => (
                    <option key={temperature} value={temperature}>
                      {temperature}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Type couleur
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  value={formState.colorType}
                  onChange={(event) =>
                    updateFormField("colorType", event.target.value as Prospect["colorType"])
                  }
                >
                  {PROSPECT_COLOR_TYPES.map((colorType) => (
                    <option key={colorType} value={colorType}>
                      {colorType}
                    </option>
                  ))}
                </select>
              </label>
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <legend className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Notes
                </legend>
                <label className="mt-4 grid gap-2 text-sm text-slate-300">
                  Notes
                  <textarea
                    className="min-h-32 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={formState.notes}
                    onChange={(event) => updateFormField("notes", event.target.value)}
                    placeholder="Contexte, intérêts, prochaine idée de message..."
                  />
                </label>
              </fieldset>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                type="submit"
              >
                Enregistrer le prospect
              </button>
              <button
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                type="button"
                onClick={() => {
                  setFormState(initialFormState);
                  setIsFormVisible(false);
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        ) : null}

        {prospects.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl">
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
              <div className="mb-5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-emerald-300">
                Aucun prospect pour le moment
              </div>

              <h2 className="text-2xl font-bold">
                Commence par ajouter les profils les plus intéressants.
              </h2>

              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
                Pour la V1, tu ajouteras les profils manuellement. L’objectif est
                de rester propre, naturel et organisé : pas de spam, pas de robot,
                juste un vrai suivi des conversations.
              </p>
            </div>
          </section>
        ) : (
          <section className="grid gap-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Liste</p>
                <h2 className="text-2xl font-bold text-white">Prospects enregistrés</h2>
              </div>
              <p className="text-sm text-slate-300">
                {filteredProspects.length} prospect{filteredProspects.length > 1 ? "s" : ""} affiché{filteredProspects.length > 1 ? "s" : ""} sur {prospects.length}
              </p>
            </div>

            <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
                <label className="grid gap-2 text-sm text-slate-300">
                  Recherche
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Nom, ville, email, notes..."
                  />
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Plateforme
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.platform}
                    onChange={(event) =>
                      updateProspectFilter("platform", event.target.value as ProspectFilters["platform"])
                    }
                  >
                    <option value="Tous">Tous</option>
                    {SOCIAL_PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Statut
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.status}
                    onChange={(event) =>
                      updateProspectFilter("status", event.target.value as ProspectFilters["status"])
                    }
                  >
                    <option value="Tous">Tous</option>
                    {PROSPECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Catégorie
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.category}
                    onChange={(event) =>
                      updateProspectFilter("category", event.target.value as ProspectFilters["category"])
                    }
                  >
                    <option value="Tous">Toutes</option>
                    {PROSPECT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Température
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.temperature}
                    onChange={(event) =>
                      updateProspectFilter("temperature", event.target.value as ProspectFilters["temperature"])
                    }
                  >
                    <option value="Tous">Toutes</option>
                    {PROSPECT_TEMPERATURES.map((temperature) => (
                      <option key={temperature} value={temperature}>
                        {temperature}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Type couleur
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    value={prospectFilters.colorType}
                    onChange={(event) =>
                      updateProspectFilter("colorType", event.target.value as ProspectFilters["colorType"])
                    }
                  >
                    <option value="Tous">Tous</option>
                    {PROSPECT_COLOR_TYPES.map((colorType) => (
                      <option key={colorType} value={colorType}>
                        {colorType}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-300">
                  {filteredProspects.length} prospect{filteredProspects.length > 1 ? "s" : ""} affiché{filteredProspects.length > 1 ? "s" : ""} sur {prospects.length}
                </p>
                <button
                  className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                  type="button"
                  onClick={resetFilters}
                >
                  Réinitialiser les filtres
                </button>
              </div>
            </section>

            {filteredProspects.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-center text-slate-300">
                Aucun prospect ne correspond à ta recherche.
              </div>
            ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProspects.map((prospect) => {
                const name = prospect.displayName?.trim()
                  ? prospect.displayName
                  : `${prospect.firstName} ${prospect.lastName}`;
                const availableSocialLinks = socialLinkLabels
                  .map((socialLink) => ({
                    ...socialLink,
                    url: prospect.socialLinks[socialLink.key]?.trim(),
                  }))
                  .filter(
                    (
                      socialLink,
                    ): socialLink is {
                      key: keyof Prospect["socialLinks"];
                      label: string;
                      url: string;
                    } => Boolean(socialLink.url),
                  );
                const hasContactDetails = Boolean(
                  prospect.phone.trim() || prospect.whatsapp.trim() || prospect.email.trim(),
                );
                const conversationHistory = prospect.conversationHistory ?? [];
                const lastConversationEntry =
                  conversationHistory.length > 0
                    ? conversationHistory[conversationHistory.length - 1]
                    : null;
                const isConversationFormVisible = activeConversationProspectId === prospect.id;
                const isQualificationFormVisible = activeQualificationProspectId === prospect.id;

                return (
                  <article
                    key={prospect.id}
                    className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl transition hover:border-emerald-400/30"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{name}</h3>
                        {prospect.jobTitle ? (
                          <p className="mt-1 text-sm text-slate-400">{prospect.jobTitle}</p>
                        ) : null}
                        {prospect.businessArea ? (
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                            {prospect.businessArea}
                          </p>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                        {prospect.mainPlatform}
                      </span>
                    </div>

                    <div className="grid gap-3 text-sm text-slate-300">
                      <div className="rounded-2xl bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Qualification</p>
                            <p className="mt-1 font-medium text-white">{prospect.status}</p>
                          </div>
                          <button
                            className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                            type="button"
                            onClick={() => toggleQualificationForm(prospect)}
                          >
                            {isQualificationFormVisible ? "Masquer" : "Modifier la qualification"}
                          </button>
                        </div>

                        <div className="mt-3 grid gap-2 text-sm">
                          <p><span className="text-slate-500">Catégorie :</span> <span className="font-medium text-white">{prospect.category}</span></p>
                          <p><span className="text-slate-500">Température :</span> <span className="font-medium text-white">{prospect.temperature}</span></p>
                          <p><span className="text-slate-500">Type couleur :</span> <span className="font-medium text-white">{prospect.colorType}</span></p>
                          <p><span className="text-slate-500">Score :</span> <span className="font-medium text-white">{prospect.score}</span></p>
                          {prospect.nextActionDate ? (
                            <p><span className="text-slate-500">Prochaine relance :</span> <span className="font-medium text-white">{prospect.nextActionDate}</span></p>
                          ) : null}
                          {prospect.notes ? (
                            <p className="leading-5"><span className="text-slate-500">Notes :</span> <span className="font-medium text-white">{prospect.notes}</span></p>
                          ) : null}
                        </div>

                        {isQualificationFormVisible ? (
                          <form
                            className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                            onSubmit={(event) => handleQualificationSubmit(prospect.id, event)}
                          >
                            <label className="grid gap-1 text-xs text-slate-300">
                              Statut
                              <select
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                value={qualificationFormState.status}
                                onChange={(event) =>
                                  updateQualificationFormField("status", event.target.value as Prospect["status"])
                                }
                              >
                                {PROSPECT_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="grid gap-1 text-xs text-slate-300">
                                Catégorie
                                <select
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={qualificationFormState.category}
                                  onChange={(event) =>
                                    updateQualificationFormField("category", event.target.value as Prospect["category"])
                                  }
                                >
                                  {PROSPECT_CATEGORIES.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Température / marché
                                <select
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={qualificationFormState.temperature}
                                  onChange={(event) =>
                                    updateQualificationFormField("temperature", event.target.value as Prospect["temperature"])
                                  }
                                >
                                  {PROSPECT_TEMPERATURES.map((temperature) => (
                                    <option key={temperature} value={temperature}>
                                      {temperature}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Type couleur
                                <select
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={qualificationFormState.colorType}
                                  onChange={(event) =>
                                    updateQualificationFormField("colorType", event.target.value as Prospect["colorType"])
                                  }
                                >
                                  {PROSPECT_COLOR_TYPES.map((colorType) => (
                                    <option key={colorType} value={colorType}>
                                      {colorType}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="grid gap-1 text-xs text-slate-300">
                                Score
                                <input
                                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                  value={qualificationFormState.score}
                                  onChange={(event) => updateQualificationFormField("score", event.target.value)}
                                  type="number"
                                />
                              </label>
                            </div>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Prochaine relance
                              <input
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                value={qualificationFormState.nextActionDate}
                                onChange={(event) => updateQualificationFormField("nextActionDate", event.target.value)}
                                type="date"
                              />
                            </label>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Notes
                              <textarea
                                className="min-h-20 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                                value={qualificationFormState.notes}
                                onChange={(event) => updateQualificationFormField("notes", event.target.value)}
                                placeholder="Notes de qualification..."
                              />
                            </label>

                            <div className="flex flex-wrap gap-2">
                              <button
                                className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300"
                                type="submit"
                              >
                                Enregistrer
                              </button>
                              <button
                                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                                type="button"
                                onClick={() => {
                                  setActiveQualificationProspectId(null);
                                  setQualificationFormState(initialQualificationFormState);
                                }}
                              >
                                Annuler
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Localisation</p>
                        <p className="mt-1 font-medium text-white">
                          {[prospect.city, prospect.region, prospect.country].filter(Boolean).join(" / ") || "—"}
                        </p>
                      </div>
                      {hasContactDetails ? (
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Coordonnées</p>
                          <div className="mt-2 grid gap-1 font-medium text-white">
                            {prospect.phone ? <p>Téléphone : {prospect.phone}</p> : null}
                            {prospect.whatsapp ? <p>WhatsApp : {prospect.whatsapp}</p> : null}
                            {prospect.email ? <p>Email : {prospect.email}</p> : null}
                          </div>
                        </div>
                      ) : null}
                      {prospect.profileUrl || availableSocialLinks.length > 0 ? (
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Réseaux sociaux</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {prospect.profileUrl ? (
                              <a
                                className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:border-emerald-300/50"
                                href={prospect.profileUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Profil
                              </a>
                            ) : null}
                            {availableSocialLinks.map((socialLink) => (
                              <a
                                className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:border-emerald-300/50"
                                href={socialLink.url}
                                key={socialLink.key}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {socialLink.label}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-2xl bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Dernière interaction</p>
                        <p className="mt-1 font-medium text-white">{prospect.lastInteractionDate || "—"}</p>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Conversation</p>
                            <p className="mt-1 font-medium text-white">
                              {conversationHistory.length} échange{conversationHistory.length > 1 ? "s" : ""}
                            </p>
                          </div>
                          <button
                            className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                            type="button"
                            onClick={() => toggleConversationForm(prospect.id)}
                          >
                            {isConversationFormVisible ? "Masquer" : "Ajouter un échange"}
                          </button>
                        </div>

                        {lastConversationEntry ? (
                          <div className="mt-3 rounded-2xl bg-slate-950/50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Dernier échange
                            </p>
                            <p className="mt-2 text-xs text-slate-400">
                              {lastConversationEntry.date} · {lastConversationEntry.channel}
                            </p>
                            <p className="mt-1 text-sm leading-5 text-white">{lastConversationEntry.content}</p>
                            {lastConversationEntry.nextAction ? (
                              <p className="mt-2 text-sm text-emerald-300">
                                Prochaine action : {lastConversationEntry.nextAction}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-400">Aucun échange enregistré.</p>
                        )}

                        {isConversationFormVisible ? (
                          <form
                            className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                            onSubmit={(event) => handleConversationSubmit(prospect.id, event)}
                          >
                            <label className="grid gap-1 text-xs text-slate-300">
                              Date de l'échange
                              <input
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                value={conversationFormState.date}
                                onChange={(event) => updateConversationFormField("date", event.target.value)}
                                required
                                type="date"
                              />
                            </label>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Canal
                              <select
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                value={conversationFormState.channel}
                                onChange={(event) =>
                                  updateConversationFormField(
                                    "channel",
                                    event.target.value as Prospect["mainPlatform"],
                                  )
                                }
                              >
                                {SOCIAL_PLATFORMS.map((platform) => (
                                  <option key={platform} value={platform}>
                                    {platform}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Résumé de l'échange
                              <textarea
                                className="min-h-20 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                                value={conversationFormState.content}
                                onChange={(event) => updateConversationFormField("content", event.target.value)}
                                placeholder="Résumé court..."
                                required
                              />
                            </label>

                            <label className="grid gap-1 text-xs text-slate-300">
                              Prochaine action
                              <input
                                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                                value={conversationFormState.nextAction}
                                onChange={(event) => updateConversationFormField("nextAction", event.target.value)}
                                placeholder="Relancer, envoyer une info..."
                              />
                            </label>

                            <div className="flex flex-wrap gap-2">
                              <button
                                className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300"
                                type="submit"
                              >
                                Enregistrer
                              </button>
                              <button
                                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                                type="button"
                                onClick={() => {
                                  setConversationFormState(initialConversationFormState);
                                  setActiveConversationProspectId(null);
                                }}
                              >
                                Annuler
                              </button>
                            </div>
                          </form>
                        ) : null}

                        {conversationHistory.length > 0 ? (
                          <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto pr-1">
                            {conversationHistory.map((conversationEntry) => (
                              <div
                                className="rounded-xl border border-white/10 bg-slate-950/40 p-3"
                                key={conversationEntry.id}
                              >
                                <p className="text-xs font-semibold text-slate-300">
                                  {conversationEntry.date} · {conversationEntry.channel}
                                </p>
                                <p className="mt-1 text-sm leading-5 text-white">{conversationEntry.content}</p>
                                {conversationEntry.nextAction ? (
                                  <p className="mt-1 text-xs text-emerald-300">
                                    Prochaine action : {conversationEntry.nextAction}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
