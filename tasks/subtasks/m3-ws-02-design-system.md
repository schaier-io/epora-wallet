# Workspace: design system (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md)

## What landed

- [x] Tokens, type, and motion in [app/globals.css](../../code/dApp/src/app/globals.css) (+ [globals/animations.css](../../code/dApp/src/app/globals/animations.css)); brand colors live in the Tailwind config.
- [x] Primitives: shadcn under [components/ui/](../../code/dApp/src/components/ui), vendored React-Bits under [components/react-bits/](../../code/dApp/src/components/react-bits) (silk backgrounds etc.).
- [x] Asset copy + naming in [lib/copy.ts](../../code/dApp/src/lib/copy.ts); reduced-motion respected via [use-prefers-reduced-motion.ts](../../code/dApp/src/lib/hooks/use-prefers-reduced-motion.ts).

## Verified by

- `pnpm lint` / `pnpm build`; visual review in the walkthrough.
