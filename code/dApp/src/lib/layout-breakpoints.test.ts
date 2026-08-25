import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Layout-scale regressions on the workspace route. Five of them, and the filename reads
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
 * 2. The loading skeleton must not invent chrome the components it stands for never use.
 * 3. `p-5` is off the spacing scale (4/8/12/16/24/40) and is not a rung anything may land on.
 * 4. No workspace child rounds harder than the 14px `<Card>` that holds it.
 * 5. The eight list-row editors are one box style, not three.
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

// The one `p-5` that stays. `wallet-membership-card.tsx` renders a fixed-aspect card face
// inside a react-bits ProfileCard: `h-full` with `justify-between`, so the padding places the
// logo and the footer rather than spacing a stack. Moving it to 16px shifts a designed
// graphic, which is a visual change this rule has no business making.
const DESIGNED_CARD_FACE = "src/components/user/wallet-membership-card.tsx";

test("nothing lands on p-5, which is not a rung on the spacing scale", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const path of sourceFiles(root)) {
      if (path === DESIGNED_CARD_FACE) {
        continue;
      }

      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//")) {
            return;
          }
          if (/(?:^|[\s"'`:])(?:sm:|md:|lg:|xl:|2xl:)?p-5(?=[\s"'`]|$)/.test(line)) {
            offenders.push(`${path}:${index + 1} ${trimmed}`);
          }
        });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `20px sits between the 16 and 24 rungs, and below 640px it out-pads the Card that holds it:\n${offenders.join("\n")}`
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
// contact, an approval rule, a wake-up timer, or a scheduled payment. They had drifted to
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
