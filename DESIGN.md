---
name: Epora Wallet
description: Calm, explicit control for a self-custodial Cardano permission wallet.
colors:
  midnight-canvas: "oklch(0.145 0.018 195)"
  deep-panel: "oklch(0.205 0.020 190)"
  clear-text: "oklch(0.985 0.006 185)"
  quiet-text: "oklch(0.708 0.018 185)"
  protective-teal: "oklch(0.760 0.150 167)"
  signal-cyan: "oklch(0.790 0.135 205)"
  caution-amber: "oklch(0.820 0.135 75)"
  danger-red: "oklch(0.704 0.191 22.216)"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
  mono:
    fontFamily: "JetBrains Mono, SFMono-Regular, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.protective-teal}"
    textColor: "{colors.midnight-canvas}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  input-default:
    backgroundColor: "{colors.midnight-canvas}"
    textColor: "{colors.clear-text}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
---

# Design System: Epora Wallet

## 1. Overview

**Creative North Star: "The Trusted Ledger"**

Epora is a focused control surface for reviewing and authorizing consequential on-chain actions. Its dark, cool canvas suits deliberate transaction review while restrained teal, cyan, and amber signals separate actions, information, and risk. The interface should feel calm under complexity: dense enough for expert work, but layered so a first-time user always knows where to start.

The system rejects speculative crypto spectacle, decorative dashboards, generic SaaS card grids, and unexplained protocol language. Familiar controls, explicit state, and consequence-first copy earn trust.

**Key Characteristics:**

- Restrained dark palette with purposeful semantic color.
- Clear task hierarchy and one dominant next action.
- Plain-language explanations paired with exact on-chain details.
- Compact product typography with monospace reserved for identifiers and amounts.
- Motion used only to explain state changes.

## 2. Colors

Cool, tinted neutrals create a quiet canvas. Teal marks primary actions and confirmed live state, cyan supports information, amber marks experimental or cautionary context, and red is reserved for destructive or failed states.

### Primary

- **Protective Teal** (`oklch(0.760 0.150 167)`): primary actions, focus cues, selected task state, and confirmed safe progress.
- **Signal Cyan** (`oklch(0.790 0.135 205)`): secondary information and technical links.

### Tertiary

- **Caution Amber** (`oklch(0.820 0.135 75)`): Preprod, unaudited, pending, and risk notices.
- **Danger Red** (`oklch(0.704 0.191 22.216)`): errors and destructive actions only.

### Neutral

- **Midnight Canvas** (`oklch(0.145 0.018 195)`): page background.
- **Deep Panel** (`oklch(0.205 0.020 190)`): navigation, controls, and raised task regions.
- **Clear Text** (`oklch(0.985 0.006 185)`): primary copy.
- **Quiet Text** (`oklch(0.708 0.018 185)`): secondary copy that still meets contrast requirements.

### Named Rules

**The Semantic Color Rule.** Accent color must communicate action or state. It is never filler decoration.

## 3. Typography

**Display Font:** Geist (with `ui-sans-serif` fallback)  
**Body Font:** Geist (with `system-ui` fallback)  
**Label/Mono Font:** JetBrains Mono (with `SFMono-Regular` fallback)

**Character:** One sans family keeps the product familiar and efficient. Monospace makes addresses, hashes, token amounts, and machine state easy to distinguish from instructions.

### Hierarchy

- **Headline** (600, 1.5rem, 1.2): page task and major workflow state.
- **Title** (600, 1rem, 1.3): section and editor titles.
- **Body** (400, 0.875rem, 1.5): instructions and explanations, capped near 70 characters when prose runs long.
- **Label** (600, 0.75rem, 1.25): field labels, compact status, and navigation.
- **Mono** (400, 0.75rem, 1.5): exact technical values only.

### Named Rules

**The Plain Instruction Rule.** Headings name the task. Supporting copy explains the decision or consequence without restating the heading.

## 4. Elevation

Depth comes from tonal layering, fine borders, and one restrained panel shadow. Surfaces stay flat at rest; hover elevation is limited to clearly interactive regions.

### Shadow Vocabulary

- **Panel** (`0 20px 55px -28px hsl(173 70% 18% / 0.35)`): major floating workspace or dialog only.

### Named Rules

**The Flat-by-Default Rule.** Use borders and background contrast before shadows. Nested shadows and nested cards are not allowed.

## 5. Components

### Buttons

- **Shape:** compact rounded rectangle (10px) with a 40px default height.
- **Primary:** protective teal, high-contrast dark text, and 16px horizontal padding.
- **Hover / Focus:** subtle tonal shift; visible 2px focus ring; active state compresses briefly.
- **Secondary / Ghost:** neutral tonal states. Destructive buttons never borrow primary styling.

### Chips

- **Style:** pill only for status, filter, role, or network metadata.
- **State:** selected chips use accent plus a non-color cue; action chips retain button semantics.

### Cards / Containers

- **Corner Style:** 14px for major regions, 10px for controls.
- **Background:** deep tinted panels over the midnight canvas.
- **Shadow Strategy:** panel shadow only when hierarchy requires separation.
- **Border:** one low-contrast full border. No colored side stripe.
- **Internal Padding:** 16px compact, 24px standard, 32px only for sparse onboarding.

### Inputs / Fields

- **Style:** 40px minimum height, dark tonal fill, full border, 10px radius.
- **Focus:** border shift plus visible 2px ring.
- **Error / Disabled:** text explanation and icon or label in addition to color.

### Navigation

Use familiar top navigation with a visible current-page state. Collapse deliberately on small screens without hiding destinations. Wallet and network status remain distinct from page navigation.

### Transaction Preview

Show human outcome first, then exact addresses, assets, fees, signers, and contract details. Put irreversible or permission-changing consequences immediately before the signing action.

## 6. Do's and Don'ts

### Do:

- **Do** keep one primary action visually dominant in each workflow state.
- **Do** explain Cardano terms at first use and keep exact values available nearby.
- **Do** distinguish loading, empty, blocked, error, success, and read-only states in words and visuals.
- **Do** preserve visible keyboard focus, reduced motion, high contrast, and 44px touch targets where space permits.
- **Do** use before and after screenshots at matching routes, states, and viewport sizes.

### Don't:

- **Don't** use speculative crypto aesthetics, neon-on-black spectacle, or decorative dashboard chrome.
- **Don't** use generic SaaS card grids or nest cards to create hierarchy.
- **Don't** show raw provider errors, validator constructors, or protocol jargon without translation.
- **Don't** use copy that restates a heading, placeholder copy, or text that does not change the user's next decision.
- **Don't** use gradient text, decorative glassmorphism, colored side stripes, or motion without state meaning.
