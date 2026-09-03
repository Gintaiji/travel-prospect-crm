import type { Prospect } from "./types";

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
