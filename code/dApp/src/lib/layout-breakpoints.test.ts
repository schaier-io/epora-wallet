import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Widening the window must never narrow the content.
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
 * So: no `xl:grid-cols-*` inside the main panel. Two exemptions, both deliberate.
 */

// The shell itself defines where the rail arrives, so it is the one file that must name `xl`.
const SHELL = "src/components/user/workspace/workspace-layout-view.tsx";

// Backlog 21b owns the loading skeleton: its innards do not match the loaded layout yet, and
// this grid is one of the mismatches. Remove this exemption when 21b lands.
const LOADING_SKELETON = "src/app/user/loading.tsx";

const ROOTS = ["src/app", "src/components"];

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
      if (path === SHELL || path === LOADING_SKELETON) {
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
