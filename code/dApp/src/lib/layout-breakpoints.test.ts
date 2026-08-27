import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Layout-scale regressions on the workspace route. Nine of them, and the filename reads
 * narrower than that -- the breakpoint rule below came first and the others joined it rather
 * than earning files of their own.
 *
 * 1. Widening the window must never narrow the content.
 *
 * The workspace shell inserts the 260px review rail at `xl` (1280), which takes the main
 * panel from 903px to 629px. Ten grids inside that panel added columns at the same
 * breakpoint, so growing the window past 1280 cut a field from 401.5px to 172.3px -- a 57%
 * loss for 2px more window. Measured, at `focused-people-editor.tsx`'s owner row.
 *
 * The step was dropped rather than moved up a rung. `2xl` was tried first and re-created the
 * defect: at 1540 the panel is 748px, so three columns give 212px, still narrower than the
 * 264.5px two columns give at 1281. Three columns only break even above ~1610px, and there
 * is no rung there worth inventing for this.
 *
 * So: no `xl:grid-cols-*` inside the main panel. One exemption, deliberate.
 *
 * 2. Neither loading skeleton invents chrome the components it stands for never use.
 * 3. 20px is off the spacing scale (4/8/12/16/24/40) and is not a rung anything may land on.
 * 4. No workspace child rounds harder than the 14px `<Card>` that holds it.
 * 5. The eight list-row editors are one box style, not three.
 * 6. `.eyebrow` is the uppercase rung; nothing hand-rolls it with an arbitrary size.
 * 7. Padding and gap come off the scale, never out of a bracket.
 * 8. The motion ladder stays ordered: fast is shorter than normal is shorter than slow.
 * 9. Transition durations come off Tailwind's scale, never out of a bracket.
 */

// The shell itself defines where the rail arrives, so it is the one file that must name `xl`.
// `app/user/loading.tsx` was exempt too while backlog 21b was open; 21b aligned the skeleton
// with the loaded layout and its `xl:grid-cols-3` went with the block that carried it.
const SHELL = "src/components/user/workspace/workspace-layout-view.tsx";

const ROOTS = ["src/app", "src/components"];

// The loading skeleton stands in for four real components on the primary route, so drift shows
// up as the layout moving at hydration. Pinning the strings it must and must not contain catches
// that without coupling this test to the real components' internals.
//
// `p-3 sm:p-4` moved from one list to the other. It was banned while the real panels were a flat
// `p-4` and the skeleton alone stepped down. Backlog 21e made the panels step down -- a `p-4`
// child of the `p-4 sm:p-6` Card matched its parent below 640, so the nesting step vanished on
// phones -- so the skeleton now has to carry it too.
const LOADING_SKELETON = "src/app/user/loading.tsx";
const CHROME_THE_SKELETON_MUST_NOT_INVENT = ["rounded-2xl"];
const CHROME_THE_SKELETON_MUST_MATCH = ["p-3 sm:p-4"];

// Same rule, one rung up. `SkeletonCard` stands in for `<Card>` on `/` and `/payee`, and it
// had drifted the other way: `bg-card/70` against the card's `bg-card/85`, so the panel
// lightened at hydration. Pinned strings would go stale the moment `<Card>` changed, so the
// tokens are read out of `card.tsx` itself and the two sets are compared.
//
// `shadow-panel` and the colour/transition utilities are left out on purpose: a skeleton
// carries no text and needs no colour transition, so only geometry and surface are shared.
const CARD_SOURCE = "src/components/ui/card.tsx";
const SKELETON_SOURCE = "src/components/ui/skeleton.tsx";
const SHARED_CARD_CHROME = /(?<![\w:-])(?:sm:)?(?:rounded-\w+|border-border\/\d+|bg-card\/\d+|p-\d+)(?![\w-])/g;

/** The class tokens one component declares, from `from` up to `to` in its source. */
function chromeTokens(path: string, from: string, to: string): string[] {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(from);
  assert.ok(start >= 0, `${path} no longer contains "${from}"`);
  const end = source.indexOf(to, start);
  assert.ok(end > start, `${path} no longer contains "${to}" after "${from}"`);
  const block = source
    .slice(start, end)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
  return [...new Set(block.match(SHARED_CARD_CHROME) ?? [])].sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    const isSource = /\.tsx$/.test(entry) && !entry.includes(".test.");
    return isSource ? [path] : [];
  });
}

test("no grid adds columns at the breakpoint that inserts the review rail", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const path of sourceFiles(root)) {
      if (path === SHELL) {
        continue;
      }

      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          // `2xl:grid-cols-*` would match a bare `xl:` search, and it is a different rung.
          if (/(?<!\d)xl:grid-cols-/.test(line)) {
            offenders.push(`${path}:${index + 1} ${line.trim()}`);
          }
        });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `The review rail already took 274px of the main panel at this breakpoint. Adding columns here cuts each one again:\n${offenders.join("\n")}`
  );
});

test("the loading skeleton does not invent chrome the real components never use", () => {
  // The file's own docblock quotes the classes it used to carry, which is the point of the
  // docblock. Only what can render is held to the rule.
  const source = readFileSync(LOADING_SKELETON, "utf8")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");

  for (const chrome of CHROME_THE_SKELETON_MUST_NOT_INVENT) {
    assert.ok(
      !source.includes(chrome),
      `${LOADING_SKELETON} uses "${chrome}". The wallet home, hero, sidebar and assets panel use none of it, so this moves the layout at hydration. Copy the class string from the component this block stands for.`
    );
  }

  for (const chrome of CHROME_THE_SKELETON_MUST_MATCH) {
    assert.ok(
      source.includes(chrome),
      `${LOADING_SKELETON} has lost "${chrome}". The panels it stands for step their padding down below 640, so a skeleton that does not step re-opens the hydration jump this test exists to catch.`
    );
  }
});

test("the skeleton card carries the same chrome as the Card it stands for", () => {
  const card = chromeTokens(CARD_SOURCE, "const Card = ", "Card.displayName");
  const skeleton = chromeTokens(SKELETON_SOURCE, "export function SkeletonCard", "\n}");

  assert.deepEqual(
    skeleton,
    card,
    `SkeletonCard and <Card> disagree on chrome, so the panel changes shape or shade at hydration on every route that shows one.\n  Card:         ${card.join(" ")}\n  SkeletonCard: ${skeleton.join(" ")}`
  );
});

// The two 20px values that stay. `wallet-membership-card.tsx` renders a fixed-aspect card face
// inside a react-bits ProfileCard: `h-full` with `justify-between`, so the padding places the
// logo and the footer rather than spacing a stack. Moving it to 16px shifts a designed
// graphic, which is a visual change this rule has no business making. The sparkle easter egg
// is a deliberate terminal pastiche and is not held to the app's rungs either.
const DESIGNED_CARD_FACE = "src/components/user/wallet-membership-card.tsx";

// Padding, margin, gap and space only. `h-5` / `w-5` / `top-5` are 20px too, but they size
// icons and place absolutes rather than spacing a stack, and 20px icons are everywhere.
const TWENTY_PX_RUNG = /(?:^|[\s"'`:])(?:sm:|md:|lg:|xl:|2xl:)?(?:[pm][xytrbl]?|gap(?:-[xy])?|space-[xy])-5(?=[\s"'`]|$)/;

test("nothing lands on 20px, which is not a rung on the spacing scale", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const path of sourceFiles(root)) {
      if (path === DESIGNED_CARD_FACE || path === EASTER_EGG) {
        continue;
      }

      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//")) {
            return;
          }
          if (TWENTY_PX_RUNG.test(line)) {
            offenders.push(`${path}:${index + 1} ${trimmed}`);
          }
        });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `20px sits between the 16 and 24 rungs. As padding it also out-pads the Card that holds it below 640px:\n${offenders.join("\n")}`
  );
});

// Everything the workspace renders sits inside `<Card>`, which is `rounded-xl` (14px). A child
// at `rounded-2xl` (18px) or above therefore rounds HARDER than the box holding it, which reads
// as the child floating loose rather than nesting. Seven sites did it: the focused-task panel
// and its icon badge, the task empty state's badge, the wallet-detection block, and the two
// activity empty states with one of their badges.
//
// The rungs under the 14px Card are the ones the codebase already uses most: `rounded-lg` (10px)
// for a panel directly inside the Card, `rounded-md` (8px) for a tile inside that panel.
const WORKSPACE = "src/components/user/workspace";

// The two full-screen overlays in `editors/primitives.tsx` are the exception. Neither is inside
// a Card -- each IS the top-level surface, centred over a backdrop -- so 18px is its own card
// rung, not a child that outgrew its parent.
const OVERLAY_CARDS = "src/components/user/workspace/editors/primitives.tsx";

test("nothing in the workspace rounds harder than the Card holding it", () => {
  const offenders: string[] = [];

  for (const path of sourceFiles(WORKSPACE)) {
    if (path === OVERLAY_CARDS) {
      continue;
    }

    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) {
          return;
        }
        if (/\brounded-(?:2xl|3xl|4xl)\b/.test(line)) {
          offenders.push(`${path}:${index + 1} ${trimmed}`);
        }
      });
  }

  assert.deepEqual(
    offenders,
    [],
    `The Card is 14px, so a child must come down to 10px (\`rounded-lg\`) or 8px (\`rounded-md\`), not up to 18px:\n${offenders.join("\n")}`
  );
});

// Eight editors render the same thing: one removable row of fields for a person, a recovery
// contact, an approval rule, a proof of life, or a scheduled payment. They had drifted to
// three radii -- 8px, 10px and 14px -- so the same kind of row read as a different kind of box
// depending on which task tab you were on. Each is a direct child of the 14px `<Card>`
// (measured: the row's nearest bordered ancestor IS the Card, with no panel between), so they
// all belong on the 10px depth-2 rung.
//
// Scoped to `editors/` on purpose. `config-sttspend-view.tsx`'s payout row is also a
// `user-list-item`, but it sits one level deeper, inside a panel, and 8px is right for it.
const ROW_EDITORS = "src/components/user/workspace/editors";
const ROW_RADIUS = "rounded-lg";

test("every list-row editor is the same box", () => {
  const offenders: string[] = [];

  for (const path of sourceFiles(ROW_EDITORS)) {
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (!line.includes("user-list-item") || line.includes(ROW_RADIUS)) {
          return;
        }
        offenders.push(`${path}:${index + 1} ${line.trim()}`);
      });
  }

  assert.deepEqual(
    offenders,
    [],
    `A row editor left the ${ROW_RADIUS} rung. Its twins on the other task tabs did not, so the same row now renders as two different boxes:\n${offenders.join("\n")}`
  );
});

// `.eyebrow` (globals.css:121) is the 11px uppercase rung. The migration that introduced it
// replaced 46 hand-written variants, but 11 sites kept re-creating the pattern with an
// arbitrary size -- 8, 9, 10, 10.5 and 11px crossed with six trackings -- and unlike the
// already-migrated markup these carry no `.eyebrow`, so their sizes really did apply. An 8px
// label in the top-nav wallet button was the smallest text anywhere in the app.
//
// The rule is narrow on purpose: an arbitrary `text-[...]` size on the SAME element as
// `uppercase` is the eyebrow pattern being hand-rolled. `text-[11px]` on ordinary lowercase
// helper text is a separate, larger question this rule says nothing about.
const VENDORED_CARD_FACE = "src/components/user/wallet-membership-card.tsx";
const EASTER_EGG = "src/components/layout/sparkle-easter-egg.tsx";

test("nothing hand-rolls the eyebrow with an arbitrary size", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const path of sourceFiles(root)) {
      // The ProfileCard face is vendored artwork on a fixed-aspect card, and the easter egg is
      // a deliberate terminal pastiche. Neither is app chrome that has to match a rung.
      if (path === VENDORED_CARD_FACE || path === EASTER_EGG) {
        continue;
      }

      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//")) {
            return;
          }
          if (/\btext-\[[^\]]+\]/.test(line) && /\buppercase\b/.test(line)) {
            offenders.push(`${path}:${index + 1} ${trimmed}`);
          }
        });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Use the \`eyebrow\` class instead. It is 11px, uppercase, 0.16em, and it beats Tailwind's sizes because this stylesheet is unlayered:\n${offenders.join("\n")}`
  );
});

// The spacing scale has no arbitrary rung. Two `gap-[...]` values survived inside the brand
// wordmark -- 0.15rem (2.4px) between the name and its eyebrow, 0.35rem (5.6px) between the
// two words -- and both are now `gap-1`.
//
// Padding and gap only. `mt-[2px]` on a 16px icon (`wallet-connect-section.tsx:185,194`) is an
// optical nudge to sit an icon on a text baseline; there is no rung between 0 and 4px to hold
// it, and calling it a scale violation would be pedantry rather than a fix.
const ARBITRARY_PADDING_OR_GAP = /(?:^|[\s"'`:])(?:sm:|md:|lg:|xl:|2xl:)?(?:p[xytrbl]?|gap(?:-[xy])?)-\[/;

test("no padding or gap is an arbitrary value", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const path of sourceFiles(root)) {
      if (path === DESIGNED_CARD_FACE || path === EASTER_EGG) {
        continue;
      }

      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//")) {
            return;
          }
          if (ARBITRARY_PADDING_OR_GAP.test(line)) {
            offenders.push(`${path}:${index + 1} ${trimmed}`);
          }
        });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Pick a rung: 4 / 8 / 12 / 16 / 24 / 40.\n${offenders.join("\n")}`
  );
});

// `--user-motion-fast` shipped at 220ms against a `--user-motion-normal` of 200ms. The names
// were the only thing saying which was quicker, and they said it wrong: `.user-surface` runs
// colour at `fast` and transform at `normal`, so a hover's movement landed 20ms before its
// colour did. Nothing type-checks a token name against its value, so this asserts the order.
const MOTION_TOKENS = "src/app/globals.css";
const MOTION_RUNGS = ["--user-motion-fast", "--user-motion-normal", "--user-motion-slow"];

test("the motion ladder gets faster the further up it you go", () => {
  const stylesheet = readFileSync(MOTION_TOKENS, "utf8");

  const durations = MOTION_RUNGS.map((token) => {
    const declaration = new RegExp(`${token}:\\s*(\\d+)ms`).exec(stylesheet);
    assert.ok(declaration, `${token} is gone, or no longer declared in milliseconds.`);
    return { token, ms: Number(declaration[1]) };
  });

  assert.deepEqual(
    durations.filter((rung, index) => index > 0 && rung.ms <= durations[index - 1].ms),
    [],
    `Each rung must be longer than the one before it: ${durations
      .map((rung) => `${rung.token} ${rung.ms}ms`)
      .join(" < ")}`
  );
});

// Two components typed a duration into a bracket instead of picking one: `ui/card.tsx` ran its
// hover at 240ms and `recent-activity-timeline.tsx` at 220ms -- while line 180 of that same file
// used `duration-200`. Both are now `duration-200`, which 17 other sites already use.
//
// Tailwind's numeric durations are deliberately still allowed. `duration-75` on the button's
// active press and `duration-700` on the review progress bar are different jobs, not drift, and
// rewriting 17 settled `duration-200` sites into `duration-(--user-motion-normal)` would churn
// every class string in the app to change nothing a user can see.
const ARBITRARY_DURATION = /\bduration-\[/;

test("no transition duration is an arbitrary value", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const path of sourceFiles(root)) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//")) {
            return;
          }
          if (ARBITRARY_DURATION.test(line)) {
            offenders.push(`${path}:${index + 1} ${trimmed}`);
          }
        });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Use a Tailwind duration, or the token if the rule lives in CSS.\n${offenders.join("\n")}`
  );
});
