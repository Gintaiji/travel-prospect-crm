import { calculateProspectScore } from "./prospectUtils";
import type { Prospect } from "./types";

export type UpdateProspectColorAndTemperatureChanges = Partial<
  Pick<Prospect, "colorType" | "temperature">
>;

export function appendProspectNote(
  prospect: Prospect,
  note: string,
  updatedAt = new Date().toISOString(),
): Prospect {
  const trimmedNote = note.trim();

  if (!trimmedNote) {
    return prospect;
  }

  const existingNotes = prospect.notes.trim();

  return {
    ...prospect,
    notes: existingNotes ? `${existingNotes}\n${trimmedNote}` : trimmedNote,
    updatedAt,
  };
}

export function updateProspectColorAndTemperature(
  prospect: Prospect,
  changes: UpdateProspectColorAndTemperatureChanges,
  updatedAt = new Date().toISOString(),
): Prospect {
  const hasColorTypeChange =
    changes.colorType !== undefined && changes.colorType !== prospect.colorType;
  const hasTemperatureChange =
    changes.temperature !== undefined &&
    changes.temperature !== prospect.temperature;

  if (!hasColorTypeChange && !hasTemperatureChange) {
    return prospect;
  }

  const updatedProspect: Prospect = {
    ...prospect,
    ...(hasColorTypeChange ? { colorType: changes.colorType } : {}),
    ...(hasTemperatureChange ? { temperature: changes.temperature } : {}),
    updatedAt,
  };

  return {
    ...updatedProspect,
    score: calculateProspectScore(updatedProspect),
  };
}
