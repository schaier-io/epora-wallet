/**
 * Shared brand wording.
 *
 * This used to be a 111-key dictionary for the whole product, of which 94 keys had no
 * consumer. It did not fail by accident: strings written away from their surface cannot know
 * the surface, so the app grew its own wording in place and this file quietly drifted out of
 * step with it. Some keys described screens that were never built (a wallet picker with a
 * search field, a "receipt code"), and the generic hints were weaker than the specific help
 * text that shipped beside each field.
 *
 * What is left is the one thing that genuinely belongs in a single place: how the product
 * names itself. Everything else lives at the surface that renders it.
 *
 * `copy.test.ts` fails when a key here has no consumer, so this cannot grow back into a
 * dictionary nobody reads.
 */
export const COPY = {
  brand: {
    name: "Epora Wallet",
    nameDisplay: ["Epora", "Wallet"] as const,
    tagline: "Cardano smart wallet"
  }
} as const;
