/**
 * InlineEdit state (docs/DESIGN-SYSTEM.md §6): Enter or leaving the field saves, Esc cancels.
 * A reducer so the rules (no save when unchanged, one save per edit) are unit tested.
 */

export type EditState =
  | { mode: "view"; value: string; error?: string }
  | { mode: "edit"; value: string; draft: string; error?: string }
  | { mode: "saving"; value: string; draft: string };

export type EditEvent =
  | { type: "open" }
  | { type: "type"; draft: string }
  | { type: "commit" } // Enter or blur
  | { type: "cancel" } // Esc
  | { type: "saved"; value: string }
  | { type: "failed"; error: string };

export const initialEdit = (value: string): EditState => ({ mode: "view", value });

export function editReducer(s: EditState, e: EditEvent): EditState {
  switch (e.type) {
    case "open":
      return s.mode === "view" ? { mode: "edit", value: s.value, draft: s.value } : s;
    case "type":
      return s.mode === "edit" ? { ...s, draft: e.draft } : s;
    case "cancel":
      return s.mode === "edit" ? { mode: "view", value: s.value } : s;
    case "commit":
      if (s.mode !== "edit") return s; // Enter then blur: the second commit does nothing
      if (s.draft.trim() === s.value.trim()) return { mode: "view", value: s.value };
      return { mode: "saving", value: s.value, draft: s.draft.trim() };
    case "saved":
      return s.mode === "saving" ? { mode: "view", value: e.value } : s;
    case "failed":
      return s.mode === "saving" ? { mode: "edit", value: s.value, draft: s.draft, error: e.error } : s;
  }
}

/** True when the reducer just moved into "saving": the component calls the server action then. */
export const shouldSave = (before: EditState, after: EditState) => before.mode !== "saving" && after.mode === "saving";
