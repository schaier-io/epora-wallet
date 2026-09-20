import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const changedFiles = [
  new URL("./action-configuration-card.tsx", import.meta.url),
  new URL("./review-panel-sections.tsx", import.meta.url),
  new URL("./workspace/workspace-sidebar-view.tsx", import.meta.url),
  new URL("../layout/wallet-panel.tsx", import.meta.url)
];

const animationsCss = new URL("../../app/globals/animations.css", import.meta.url);

test("switched native summaries hide the UA marker and use expand-chevron", () => {
  for (const url of changedFiles) {
    const path = fileURLToPath(url);
    const source = readFileSync(path, "utf8");
    assert.match(source, /expand-chevron/, `${path} missing expand-chevron`);
    assert.ok(
      source.includes("list-none") || source.includes("::-webkit-details-marker"),
      `${path} missing list-none or ::-webkit-details-marker`
    );
  }
});

test("animations.css still defines .expand-chevron", () => {
  const source = readFileSync(fileURLToPath(animationsCss), "utf8");
  assert.match(source, /\.expand-chevron\s*\{/);
});
