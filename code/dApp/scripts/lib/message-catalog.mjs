import fs from "node:fs";
import path from "node:path";

const maxShardLines = 650;

export function readMessageCatalog(locale) {
  const directory = path.resolve(`messages/${locale}`);
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .toSorted()
    .reduce(
      (catalog, name) => ({
        ...catalog,
        ...JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"))
      }),
      {}
    );
}

export function writeMessageCatalog(locale, catalog) {
  const directory = path.resolve(`messages/${locale}`);
  const modulePath = path.resolve(`src/i18n/messages/${locale}.ts`);
  const shards = [];
  let current = {};

  for (const [namespace, namespaceMessages] of Object.entries(catalog).toSorted(([a], [b]) => a.localeCompare(b))) {
    const candidate = { ...current, [namespace]: namespaceMessages };
    if (
      Object.keys(current).length > 0 &&
      JSON.stringify(candidate, null, 2).split("\n").length > maxShardLines
    ) {
      shards.push(current);
      current = { [namespace]: namespaceMessages };
    } else {
      current = candidate;
    }
  }
  if (Object.keys(current).length > 0) shards.push(current);

  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.dirname(modulePath), { recursive: true });
  for (const name of fs.readdirSync(directory)) {
    if (name.endsWith(".json")) fs.unlinkSync(path.join(directory, name));
  }

  const imports = [];
  const spreads = [];
  shards.forEach((shard, index) => {
    const fileName = `catalog-${index + 1}`;
    const identifier = `catalog${index + 1}`;
    fs.writeFileSync(
      path.join(directory, `${fileName}.json`),
      `${JSON.stringify(shard, null, 2)}\n`
    );
    imports.push(`import ${identifier} from "../../../messages/${locale}/${fileName}.json";`);
    spreads.push(`  ...${identifier}`);
  });

  fs.writeFileSync(
    modulePath,
    `${imports.join("\n")}\n\nconst messages = {\n${spreads.join(",\n")}\n};\n\nexport default messages;\n`
  );
  return shards.length;
}
