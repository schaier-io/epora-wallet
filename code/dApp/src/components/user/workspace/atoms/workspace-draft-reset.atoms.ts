import { atom } from "jotai";

/** Explicit draft resets invalidate editor undo buffers without reacting to ordinary edits. */
export const workspaceDraftResetRevisionAtom = atom(0);
