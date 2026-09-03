import OpenAI from "openai";
import {
  AI_COMMAND_SCHEMA_VERSION,
  type AiCommand,
} from "../../lib/aiCommandTypes";
import { isAiCommand } from "../../lib/aiCommandValidation";
import {
  PROSPECT_CATEGORIES,
  PROSPECT_COLOR_TYPES,
  PROSPECT_STATUSES,
  PROSPECT_TAGS,
  PROSPECT_TEMPERATURES,
} from "../../lib/types";

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const CURRENT_DATE_TIME_ZONE = "Europe/Paris";

const textFieldSchema = { type: "string" } as const;
const nonEmptyTextFieldSchema = { type: "string", minLength: 1 } as const;
const tagsFieldSchema = {
  type: "array",
  items: { type: "string", enum: PROSPECT_TAGS },
} as const;

const targetSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["prospectId"],
      properties: {
        prospectId: nonEmptyTextFieldSchema,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: nonEmptyTextFieldSchema,
      },
    },
  ],
} as const;

const updateChangeSchemas = [
  {
    type: "object",
    additionalProperties: false,
    required: ["colorType"],
    properties: {
      colorType: { type: "string", enum: PROSPECT_COLOR_TYPES },
    },
  },
  {
    type: "object",
    additionalProperties: false,
    required: ["temperature"],
    properties: {
      temperature: { type: "string", enum: PROSPECT_TEMPERATURES },
    },
  },
  {
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: {
      status: { type: "string", enum: PROSPECT_STATUSES },
    },
  },
  {
    type: "object",
    additionalProperties: false,
    required: ["category"],
    properties: {
      category: { type: "string", enum: PROSPECT_CATEGORIES },
    },
  },
  {
    type: "object",
    additionalProperties: false,
    required: ["tags"],
    properties: {
      tags: tagsFieldSchema,
    },
  },
  {
    type: "object",
    additionalProperties: false,
    required: ["nextActionDate"],
    properties: {
      nextActionDate: textFieldSchema,
    },
  },
] as const;

const aiCommandResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["command"],
  properties: {
    command: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["action", "payload"],
          properties: {
            action: { type: "string", enum: ["searchProspect"] },
            payload: {
              type: "object",
              additionalProperties: false,
              required: ["query"],
              properties: {
                query: nonEmptyTextFieldSchema,
              },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["action", "payload"],
          properties: {
            action: { type: "string", enum: ["createProspect"] },
            payload: {
              type: "object",
              additionalProperties: false,
              required: ["firstName"],
              properties: {
                firstName: nonEmptyTextFieldSchema,
                lastName: textFieldSchema,
                meetingPlace: textFieldSchema,
                phone: textFieldSchema,
                whatsapp: textFieldSchema,
                email: textFieldSchema,
                category: { type: "string", enum: PROSPECT_CATEGORIES },
                status: { type: "string", enum: PROSPECT_STATUSES },
                temperature: { type: "string", enum: PROSPECT_TEMPERATURES },
                colorType: { type: "string", enum: PROSPECT_COLOR_TYPES },
                tags: tagsFieldSchema,
                notes: textFieldSchema,
                nextActionDate: textFieldSchema,
              },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["action", "payload"],
          properties: {
            action: { type: "string", enum: ["addNote"] },
            payload: {
              type: "object",
              additionalProperties: false,
              required: ["target", "note"],
              properties: {
                target: targetSchema,
                note: nonEmptyTextFieldSchema,
              },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["action", "payload"],
          properties: {
            action: { type: "string", enum: ["updateProspect"] },
            payload: {
              type: "object",
              additionalProperties: false,
              required: ["target", "changes"],
              properties: {
                target: targetSchema,
                changes: {
                  anyOf: updateChangeSchemas,
                },
              },
            },
          },
        },
      ],
    },
  },
} as const;

function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function getTodayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CURRENT_DATE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getMessageFromRequestBody(value: unknown) {
  if (!isRecord(value) || Object.keys(value).length !== 1) {
    return null;
  }

  if (typeof value.message !== "string") {
    return null;
  }

  const message = value.message.trim();

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return null;
  }

  return message;
}

function createJsonResponse(body: unknown, status: number) {
  return Response.json(body, { status });
}

function buildInstructions(todayDate: string) {
  return [
    "Tu es un interpreteur de commandes Travel Prospect CRM.",
    "Tu traduis uniquement la phrase utilisateur en une commande structuree.",
    "Les seules actions autorisees sont searchProspect, createProspect, addNote et updateProspect.",
    "Ne reponds a aucune autre tache generale.",
    "N'invente aucune autre action, jamais deleteProspect, jamais Supabase, jamais synchronisation.",
    "N'execute aucune action CRM.",
    "Ne fabrique jamais id, score, createdAt, updatedAt, interactionStats ou conversationHistory.",
    "Pour les dates relatives, utilise le format YYYY-MM-DD attendu par nextActionDate.",
    `Date courante cote serveur: ${todayDate}.`,
  ].join("\n");
}

function parseStructuredCommand(value: string): AiCommand | null {
  try {
    const parsedValue: unknown = JSON.parse(value);

    if (!isRecord(parsedValue) || !("command" in parsedValue)) {
      return null;
    }

    const command = parsedValue.command;

    return isAiCommand(command) ? command : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return createJsonResponse({ error: "Requete JSON invalide." }, 400);
  }

  const message = getMessageFromRequestBody(requestBody);

  if (!message) {
    return createJsonResponse(
      {
        error:
          "Requete invalide. Envoie uniquement un champ message non vide de 2000 caracteres maximum.",
      },
      400,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return createJsonResponse(
      { error: "Configuration serveur OpenAI manquante." },
      500,
    );
  }

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.create({
      model: getOpenAIModel(),
      instructions: buildInstructions(getTodayDateString()),
      input: message,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "travel_prospect_crm_ai_command",
          strict: true,
          schema: aiCommandResponseSchema,
        },
      },
    });
    const command = parseStructuredCommand(response.output_text);

    if (!command) {
      console.warn("Reponse OpenAI invalide pour le contrat AiCommand.");

      return createJsonResponse(
        { error: "Reponse IA invalide pour le contrat de commande." },
        500,
      );
    }

    return createJsonResponse(
      {
        schemaVersion: AI_COMMAND_SCHEMA_VERSION,
        command,
      },
      200,
    );
  } catch (error) {
    console.warn("Erreur d'appel OpenAI pour la route assistant.", error);

    return createJsonResponse(
      { error: "Service IA temporairement indisponible." },
      502,
    );
  }
}
