import type { Prospect } from "./types";

export type MessageStyle = "Doux" | "Naturel" | "Direct";

export type MessageTunnelStep =
  | "Commentaire public"
  | "Demande d’ajout / connexion"
  | "Premier message privé"
  | "Relance après silence"
  | "Question de qualification voyage"
  | "Transition vers le club privé"
  | "Invitation présentation"
  | "Suivi après présentation"
  | "Relance pas maintenant"
  | "Message de clôture propre";

export type MessageTemplateVariant = {
  tone: MessageStyle;
  message: string;
  assistantTemplate?: string;
};

export type MessageTunnelStepTemplate = {
  step: MessageTunnelStep;
  objective: string;
  variants: MessageTemplateVariant[];
  nextAction: string;
  suggestedFollowUpDays: number | null;
  suggestedStatus: Prospect["status"] | null;
};

export const MESSAGE_TUNNEL_STEPS: MessageTunnelStepTemplate[] = [
  {
    step: "Commentaire public",
    objective: "Ouvrir une interaction légère sans vendre.",
    variants: [
      {
        tone: "Doux",
        message: "Super partage, ça donne envie de préparer une prochaine escapade tranquillement.",
      },
      {
        tone: "Naturel",
        message: "Très sympa comme spot, tu y es allé récemment ou c’est sur ta liste ?",
      },
      {
        tone: "Direct",
        message: "Bel endroit, clairement une bonne idée pour un prochain voyage.",
      },
    ],
    nextAction: "Surveiller si la personne répond ou interagit, puis envisager une demande d’ajout.",
    suggestedFollowUpDays: null,
    suggestedStatus: null,
  },
  {
    step: "Demande d’ajout / connexion",
    objective: "Créer un premier lien simple et naturel.",
    variants: [
      {
        tone: "Doux",
        message: "J’ai vu que tu partageais aussi des choses autour du voyage. Je t’ajoute ici, au plaisir d’échanger.",
        assistantTemplate: "Je suis tombé sur ton contenu autour du voyage{platformMention}, j’aime bien ton univers. Je t’ajoute ici, au plaisir d’échanger.",
      },
      {
        tone: "Naturel",
        message: "Ton univers voyage m’a parlé, je t’ajoute pour suivre ça de plus près.",
        assistantTemplate: "Je suis tombé sur ton contenu autour du voyage{platformMention}, ton univers m’a parlé. Je t’ajoute ici, au plaisir d’échanger.",
      },
      {
        tone: "Direct",
        message: "Je t’ajoute parce que le sujet voyage semble nous intéresser tous les deux.",
        assistantTemplate: "Je t’ajoute parce que le sujet voyage semble nous intéresser tous les deux. Au plaisir d’échanger.",
      },
    ],
    nextAction: "Attendre l’acceptation, puis envoyer un premier message privé.",
    suggestedFollowUpDays: 3,
    suggestedStatus: "Contact lancé",
  },
  {
    step: "Premier message privé",
    objective: "Démarrer la conversation sans pression.",
    variants: [
      {
        tone: "Doux",
        message: "Salut, j’ai vu que tu aimais bien le voyage. Tu as une destination en tête en ce moment ?",
        assistantTemplate: "{greeting}j’ai vu que tu partageais pas mal de choses autour du voyage. Tu voyages souvent en ce moment ou c’est plutôt un projet que tu prépares tranquillement ?{naturalNoteHint}",
      },
      {
        tone: "Naturel",
        message: "Salut, tu es plutôt du genre à partir dès que possible ou à bien préparer tes voyages ?",
        assistantTemplate: "{greeting}j’ai vu passer ton contenu autour du voyage. Tu es plutôt du genre à partir dès que possible ou à préparer tes voyages longtemps à l’avance ?{naturalNoteHint}",
      },
      {
        tone: "Direct",
        message: "Salut, je t’écris parce que le voyage semble t’intéresser. Tu voyages souvent ?",
        assistantTemplate: "{greeting}je t’écris parce que j’ai vu que le voyage semblait t’intéresser. Tu voyages souvent ou tu cherches plutôt de nouvelles idées pour tes prochains départs ?{naturalNoteHint}",
      },
    ],
    nextAction: "Attendre une réponse, puis qualifier l’intérêt voyage.",
    suggestedFollowUpDays: 3,
    suggestedStatus: "Contact lancé",
  },
  {
    step: "Relance après silence",
    objective: "Relancer proprement sans insister.",
    variants: [
      {
        tone: "Doux",
        message: "Je me permets de te relancer tranquillement, aucune pression. Le sujet voyage t’intéresse toujours ?",
        assistantTemplate: "{greeting}je me permets de te relancer tranquillement, aucune pression. Le sujet voyage t’intéresse toujours ou ce n’est plus trop le moment ?",
      },
      {
        tone: "Naturel",
        message: "Je reviens vers toi rapidement : tu voulais encore échanger sur le sujet voyage ?",
        assistantTemplate: "{greeting}je reviens vers toi rapidement : tu voulais encore échanger sur le sujet voyage ?",
      },
      {
        tone: "Direct",
        message: "Je te relance une fois ici. Si ce n’est pas le moment, aucun souci.",
        assistantTemplate: "{greeting}je te relance une fois ici. Si ce n’est pas le moment, aucun souci.",
      },
    ],
    nextAction: "Relancer une dernière fois plus tard si aucun retour, puis clôturer proprement.",
    suggestedFollowUpDays: 7,
    suggestedStatus: "À relancer",
  },
  {
    step: "Question de qualification voyage",
    objective: "Comprendre ce qui motive la personne.",
    variants: [
      {
        tone: "Doux",
        message: "Quand tu voyages, tu recherches plutôt le confort, les bons plans ou les expériences originales ?",
        assistantTemplate: "{greeting}{qualificationQuestion}",
      },
      {
        tone: "Naturel",
        message: "Tu choisis tes voyages plutôt au prix, à la destination ou au type d’expérience ?",
        assistantTemplate: "{greeting}{qualificationQuestion}",
      },
      {
        tone: "Direct",
        message: "Qu’est-ce qui compte le plus pour toi quand tu réserves un voyage ?",
        assistantTemplate: "{greeting}qu’est-ce qui compte le plus pour toi quand tu réserves un voyage ?",
      },
    ],
    nextAction: "Selon la réponse, proposer une transition douce vers le club privé.",
    suggestedFollowUpDays: 3,
    suggestedStatus: "Conversation ouverte",
  },
  {
    step: "Transition vers le club privé",
    objective: "Faire le lien vers la plateforme voyage avec tact.",
    variants: [
      {
        tone: "Doux",
        message: "Je te demande parce que je découvre aussi un club privé lié au voyage, avec des avantages membres. Si tu es curieux, je peux t’expliquer simplement.",
        assistantTemplate: "{greeting}je te demande parce que je travaille aussi autour d’un club privé lié au voyage. L’idée, c’est d’aider les gens à voyager plus intelligemment avec des avantages membres. Si tu es curieux ou curieuse, je peux t’expliquer simplement.",
      },
      {
        tone: "Naturel",
        message: "Ça rejoint justement une plateforme voyage que j’utilise pour voyager plus intelligemment avec des avantages membres. Je peux te présenter l’idée simplement.",
        assistantTemplate: "{greeting}ça rejoint justement une plateforme voyage que j’utilise pour voyager plus intelligemment avec des avantages membres. Je peux te présenter l’idée simplement si tu es curieux ou curieuse.",
      },
      {
        tone: "Direct",
        message: "Si le sujet voyage t’intéresse, je peux te montrer une présentation simple d’un club privé avec des avantages membres.",
        assistantTemplate: "{greeting}si le sujet voyage t’intéresse, je peux te montrer une présentation simple d’un club privé avec des avantages membres.",
      },
    ],
    nextAction: "Si la personne est curieuse, proposer une présentation simple.",
    suggestedFollowUpDays: 3,
    suggestedStatus: "Intérêt voyage détecté",
  },
  {
    step: "Invitation présentation",
    objective: "Proposer une présentation claire, sans engagement.",
    variants: [
      {
        tone: "Doux",
        message: "Si tu veux, je peux te montrer rapidement comment ça fonctionne. Juste une présentation simple, sans engagement.",
        assistantTemplate: "{greeting}{warmTemperatureMention}si tu veux, je peux te montrer rapidement comment ça fonctionne. Ce n’est pas un engagement, juste une présentation simple pour voir si ça peut te parler.",
      },
      {
        tone: "Naturel",
        message: "Je peux t’envoyer une présentation courte pour que tu voies si ça peut te parler.",
        assistantTemplate: "{greeting}{warmTemperatureMention}je peux t’envoyer une présentation courte pour que tu voies si ça peut te parler.",
      },
      {
        tone: "Direct",
        message: "Tu veux que je te montre la présentation pour voir si c’est pertinent pour toi ?",
        assistantTemplate: "{greeting}{warmTemperatureMention}tu veux que je te montre la présentation pour voir si c’est pertinent pour toi ?",
      },
    ],
    nextAction: "Programmer ou envoyer la présentation, puis prévoir un suivi.",
    suggestedFollowUpDays: 1,
    suggestedStatus: "Présentation proposée",
  },
  {
    step: "Suivi après présentation",
    objective: "Recueillir un retour clair après la présentation.",
    variants: [
      {
        tone: "Doux",
        message: "Merci d’avoir pris le temps de regarder. À chaud, qu’est-ce que tu en as pensé ?",
        assistantTemplate: "{greeting}merci d’avoir pris le temps de regarder. À chaud, qu’est-ce que tu en as pensé ? Tu te vois plutôt l’utiliser pour voyager, ou tu veux prendre le temps d’y réfléchir ?",
      },
      {
        tone: "Naturel",
        message: "Tu as pu regarder la présentation ? Je suis curieux d’avoir ton ressenti simple.",
        assistantTemplate: "{greeting}tu as pu regarder la présentation ? Je suis curieux d’avoir ton ressenti simple.",
      },
      {
        tone: "Direct",
        message: "Après avoir vu la présentation, tu te sens plutôt intéressé, pas maintenant ou pas concerné ?",
        assistantTemplate: "{greeting}après avoir vu la présentation, tu te sens plutôt intéressé, pas maintenant ou pas concerné ?",
      },
    ],
    nextAction: "Noter son retour et classer la personne : intéressée, pas maintenant ou refus.",
    suggestedFollowUpDays: 3,
    suggestedStatus: "Présentation faite",
  },
  {
    step: "Relance pas maintenant",
    objective: "Respecter le timing tout en gardant le lien.",
    variants: [
      {
        tone: "Doux",
        message: "Je comprends totalement. Je garde le contact, et on en reparlera simplement si le moment devient plus adapté.",
        assistantTemplate: "{greeting}je comprends totalement. Je garde le contact, et si le sujet voyage redevient d’actualité pour toi plus tard, on en reparlera simplement.",
      },
      {
        tone: "Naturel",
        message: "Aucun souci, ce n’est peut-être pas le bon timing. Je te relancerai plus tard sans pression.",
        assistantTemplate: "{greeting}aucun souci, ce n’est peut-être pas le bon timing. Je te relancerai plus tard sans pression.",
      },
      {
        tone: "Direct",
        message: "Pas de problème. Ce n’est pas le moment, je reviendrai vers toi plus tard.",
        assistantTemplate: "{greeting}pas de problème. Ce n’est pas le moment, je reviendrai vers toi plus tard.",
      },
    ],
    nextAction: "Prévoir une relance plus tard sans pression.",
    suggestedFollowUpDays: 30,
    suggestedStatus: "Pas maintenant",
  },
  {
    step: "Message de clôture propre",
    objective: "Clore sans tension et laisser une bonne impression.",
    variants: [
      {
        tone: "Doux",
        message: "Merci pour ton retour. Je ne vais pas insister, le plus important c’est que ça reste fluide.",
        assistantTemplate: "{greeting}merci pour ton retour. Je ne vais pas insister, le plus important c’est que ça reste fluide. Au plaisir d’échanger une prochaine fois.",
      },
      {
        tone: "Naturel",
        message: "Merci de m’avoir répondu. Je respecte totalement, au plaisir d’échanger une prochaine fois.",
        assistantTemplate: "{greeting}merci de m’avoir répondu. Je respecte totalement, au plaisir d’échanger une prochaine fois.",
      },
      {
        tone: "Direct",
        message: "Merci pour ta réponse. Je clôture de mon côté et je te souhaite une très bonne continuation.",
        assistantTemplate: "{greeting}merci pour ta réponse. Je clôture de mon côté et je te souhaite une très bonne continuation.",
      },
    ],
    nextAction: "Ne plus relancer sauf si la personne revient d’elle-même.",
    suggestedFollowUpDays: null,
    suggestedStatus: "Refus",
  },
];
