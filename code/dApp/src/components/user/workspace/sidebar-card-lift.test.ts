import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * `user-card-lift` raises an element 2px on hover (`app/globals.css`). Every guided sidebar
 * card sits inside a `SpotlightCard`, which is `relative overflow-hidden` so the spotlight
 * stays inside the rounded rect. Put the lift on anything *inside* that wrapper and the 2px
 * it rises goes under the clip: the card's top border disappears while the pointer is on it.
 *
 * So exactly one element may carry the class, the wrapper itself, through
 * `guidedSidebarSpotlightClass`. Two lifts on nested elements is the other failure: the card
 * travels 4px against the 2px of its neighbours, and the inner border is clipped again.
 * `workspace-guided-admin-section-view.tsx` shipped that way, because it writes its own
 * button class string rather than using the shared one.
 */

const workspaceDir = fileURLToPath(new URL(".", import.meta.url));
const OWNER = "workspace-guided-sidebar-classes.ts";

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      yield path;
    }
  }
}

test("only the clipping wrapper carries the sidebar hover lift", () => {
  const offenders: string[] = [];

  for (const path of sourceFiles(workspaceDir)) {
    if (path.endsWith(OWNER)) continue;
    for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
      // A class string, not the prose explaining why it is absent.
      if (line.includes("user-card-lift") && !line.trimStart().startsWith("//")) {
        offenders.push(`${path.slice(workspaceDir.length)}:${index + 1}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `${OWNER} owns user-card-lift. Take the lift from guidedSidebarSpotlightClass instead of writing the class here: ${offenders.join(", ")}`
  );
});
