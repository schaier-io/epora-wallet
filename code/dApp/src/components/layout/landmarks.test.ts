import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    if (!full.endsWith(".tsx") || full.includes(".test.")) return [];
    return [full];
  });
}

const files = tsxFiles(SRC).map((path) => ({
  path: path.slice(SRC.length + 1),
  source: readFileSync(path, "utf8")
}));

/**
 * A document may hold one `main`. Every route file already opens one around its page, so a
 * component that opens a second one nests it: `workspace-view.tsx` did, and landmark
 * navigation offered a `main` inside a `main` on the app's busiest screen. The route files are
 * the only place the element belongs.
 */
test("only route files open a main landmark", () => {
  const offenders = files
    .filter(({ source }) => /<main[\s>]/.test(source))
    .map(({ path }) => path)
    .filter((path) => !/^app\/(?:[^/]+\/)*(?:page|not-found|layout|error)\.tsx$/.test(path));

  assert.deepEqual(
    offenders,
    [],
    `these render a <main> inside the one their route already opened. Use a <section> with an aria-label:\n${offenders.join("\n")}`
  );
});

/**
 * `aria-labelledby` names an element by id, and an id that is not in the document names
 * nothing: the reference does not fall back, it leaves the element unnamed. The workspace
 * landmark pointed at the header's `h2`, which the header deliberately stops rendering once a
 * wallet is open, so on the screen the app spends most of its life on the landmark had no
 * accessible name at all.
 *
 * Its blind spot is exactly that case. This reads source, so it can only see whether the id is
 * written down somewhere; it cannot see that the element carrying it renders behind a
 * condition. It catches the target being deleted outright, which is the other half of the same
 * bug. A reference whose target is conditional needs a literal label instead, and no scan of
 * the source will tell you that.
 */
test("every aria-labelledby target id exists in the source", () => {
  const ids = new Set(
    files.flatMap(({ source }) => [...source.matchAll(/\bid="([^"{}]+)"/g)].map((m) => m[1]))
  );

  const dangling = files.flatMap(({ path, source }) =>
    [...source.matchAll(/aria-labelledby="([^"{}]+)"/g)]
      .map((m) => m[1])
      .filter((id) => !ids.has(id))
      .map((id) => `${path} -> #${id}`)
  );

  assert.deepEqual(dangling, [], `aria-labelledby points at ids nothing renders:\n${dangling.join("\n")}`);
});
