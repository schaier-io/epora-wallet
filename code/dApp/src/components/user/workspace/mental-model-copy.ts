// One shared explanation per Cardano mental-model term the app coins ("fund pool",
// "setup helper"). Every surface that names a term links to the same sentence here, so
// the definition cannot drift between screens or grow a bespoke paraphrase per surface.
// Pure data outside React, so the term tests can read it without a renderer.
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceMentalModelCopy.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceMentalModelCopy", defaultMessages);

/** What a "fund pool" is, and why the money in one is called locked. */
export const FUND_POOLS_HINT = i18n("fundPoolsHint");

/** What the one-time setup helper deposits, and why later actions are cheaper after it. */
export const SETUP_HELPER_HINT = i18n("setupHelperHint");
