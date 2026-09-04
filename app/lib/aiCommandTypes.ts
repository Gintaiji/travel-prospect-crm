import type { Prospect } from "./types";

export const AI_COMMAND_SCHEMA_VERSION = 1 as const;

export type AiCommandSchemaVersion = typeof AI_COMMAND_SCHEMA_VERSION;

export type ProspectCommandTarget =
  | {
      prospectId: Prospect["id"];
      query?: never;
    }
  | {
      query: string;
      prospectId?: never;
    };

type AtLeastOne<T> = {
  [Key in keyof T]: Required<Pick<T, Key>> & Partial<Omit<T, Key>>;
}[keyof T];

export type SearchProspectCommand = {
  action: "searchProspect";
  payload: {
    query: string;
  };
};

export type GetTodayFollowUpsCommand = {
  action: "getTodayFollowUps";
  payload: Record<string, never>;
};

export type CountNewProspectsThisWeekCommand = {
  action: "countNewProspectsThisWeek";
  payload: Record<string, never>;
};

export type GetProspectsNotContactedSinceDaysCommand = {
  action: "getProspectsNotContactedSinceDays";
  payload: {
    days: number;
  };
};

export type GetOverdueFollowUpsCommand = {
  action: "getOverdueFollowUps";
  payload: Record<string, never>;
};

// CRM-controlled fields such as id, score, dates and history are intentionally excluded.
export type CreateProspectPayload = Pick<Prospect, "firstName"> &
  Partial<
    Pick<
      Prospect,
      | "lastName"
      | "meetingPlace"
      | "phone"
      | "whatsapp"
      | "email"
      | "category"
      | "status"
      | "temperature"
      | "colorType"
      | "tags"
      | "notes"
      | "nextActionDate"
    >
  >;

export type CreateProspectCommand = {
  action: "createProspect";
  payload: CreateProspectPayload;
};

export type AddNoteCommand = {
  action: "addNote";
  payload: {
    target: ProspectCommandTarget;
    note: string;
  };
};

export type CreateFollowUpCommand = {
  action: "createFollowUp";
  payload: {
    target: ProspectCommandTarget;
    date: string;
  };
};

// Explicit allowlist of fields the AI can request to update.
export type UpdateProspectChanges = AtLeastOne<
  Pick<
    Prospect,
    | "colorType"
    | "temperature"
    | "status"
    | "category"
    | "tags"
    | "nextActionDate"
  >
>;

export type UpdateProspectCommand = {
  action: "updateProspect";
  payload: {
    target: ProspectCommandTarget;
    changes: UpdateProspectChanges;
  };
};

export type AiCommand =
  | SearchProspectCommand
  | GetTodayFollowUpsCommand
  | CountNewProspectsThisWeekCommand
  | GetProspectsNotContactedSinceDaysCommand
  | GetOverdueFollowUpsCommand
  | CreateProspectCommand
  | AddNoteCommand
  | CreateFollowUpCommand
  | UpdateProspectCommand;
