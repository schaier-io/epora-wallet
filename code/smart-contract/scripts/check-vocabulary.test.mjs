import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const legacyTerm = ["state", "token"].join("-");
const sourcePath = `../dApp/src/mint-${legacyTerm}.test.tsx`;
const checker = fileURLToPath(new URL("check-vocabulary.mjs", import.meta.url));

function check(t, markdown, source = "") {
  const project = mkdtempSync(join(tmpdir(), "epora-vocabulary-"));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  for (const directory of ["lib", "validators", "offchain", "scripts"]) {
    mkdirSync(join(project, directory));
  }
  copyFileSync(checker, join(project, "scripts", "check-vocabulary.mjs"));
  writeFileSync(join(project, "README.md"), markdown);
  writeFileSync(join(project, "INTERACTIONS.md"), "");
  writeFileSync(join(project, "SECURITY.md"), "");
  writeFileSync(join(project, "lib", "example.ak"), source);
  return spawnSync(process.execPath, [join(project, "scripts", "check-vocabulary.mjs")], {
    encoding: "utf8",
  });
}

test("vocabulary accepts Markdown file references", (t) => {
  const result = check(t, [
    `See \`${sourcePath}\`.`,
    `[mint-${legacyTerm}.test.tsx](${sourcePath})`,
    `[\`mint-${legacyTerm}.test.tsx\`](${sourcePath})`,
    `[Test source](${sourcePath})`,
    `See \`${sourcePath}:12\`.`,
  ].join("\n"));
  assert.equal(result.status, 0, result.stderr);
});

test("vocabulary still rejects prose next to a file reference", (t) => {
  const result = check(t, `See \`${sourcePath}\`.\nThe ${legacyTerm} continues.`);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md:2: banned term/);
  assert.doesNotMatch(result.stderr, /README\.md:1: banned term/);
});

test("vocabulary still rejects prose link labels and inline identifiers", (t) => {
  const identifier = ["Wallet", "Witness"].join("");
  const result = check(t, `[${legacyTerm}](${sourcePath})\nUse \`${identifier}\`.`);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md:1: banned term/);
  assert.match(result.stderr, /README\.md:2: banned term/);
});

test("vocabulary keeps source files in scope", (t) => {
  const result = check(t, "", `// See \`${sourcePath}\`.`);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lib\/example\.ak:1: banned term/);
});
