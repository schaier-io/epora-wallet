import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Layout-scale regressions on the workspace route. Three of them, and the filename reads
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
 */

// The shell itself defines where the rail arrives, so it is the one file that must name `xl`.
// `app/user/loading.tsx` was exempt too while backlog 21b was open; 21b aligned the skeleton
// with the loaded layout and its `xl:grid-cols-3` went with the block that carried it.
const SHELL = "src/components/user/workspace/workspace-layout-view.tsx";

const ROOTS = ["src/app", "src/components"];

// The loading skeleton stands in for four real components on the primary route. None of them
// uses `rounded-2xl` or `p-3 sm:p-4`; the skeleton used both, so hydration moved every corner
// and every edge inside the card. Pinning the two strings it must not contain catches the
// drift without coupling this test to the real components' internals.
const LOADING_SKELETON = "src/app/user/loading.tsx";
const CHROME_THE_SKELETON_MUST_NOT_INVENT = ["rounded-2xl", "p-3 sm:p-4"];

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
