import fs from "node:fs";
import path from "node:path";
import { writeMessageCatalog } from "./lib/message-catalog.mjs";

const locale = process.argv[2];
if (!locale) throw new Error("Usage: node scripts/shard-message-catalog.mjs <locale>");

const sourcePath = path.resolve(`messages/${locale}.json`);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const shardCount = writeMessageCatalog(locale, source);
fs.unlinkSync(sourcePath);
console.log(`Sharded ${locale} into ${shardCount} catalogs; removed ${sourcePath}.`);
