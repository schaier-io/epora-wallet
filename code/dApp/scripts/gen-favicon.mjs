// Icon-set generator. Single source of truth: public/logo-mark.svg (the brand mark).
// Produces, in src/app/:
//   - icon.svg       the mark on a rounded navy tile (vector favicon for modern browsers)
//   - favicon.ico    16/32/48 px raster, for browsers/crawlers that request /favicon.ico
//   - apple-icon.png 180 px, full-bleed navy (iOS rounds the corners itself)
// Not part of the build — these are committed; re-run only when the logo changes:
//   sfw npx --yes -p sharp node scripts/gen-favicon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "src", "app");
const markRaw = readFileSync(join(here, "..", "public", "logo-mark.svg"), "utf8");

// Pull the art (paths + gradient defs) out of the brand mark's <svg> wrapper.
const inner = markRaw
  .replace(/<\?xml[\s\S]*?\?>/i, "")
  .replace(/<!DOCTYPE[\s\S]*?>/i, "")
  .replace(/<svg[\s\S]*?>/i, "")
  .replace(/<\/svg>\s*$/i, "")
  .trim();

// logo-mark.svg uses viewBox "0 0 834 938". Center it on a 512 navy tile with padding.
const SCALE = 0.4;
const tx = Math.round((512 - 834 * SCALE) / 2);
const ty = Math.round((512 - 938 * SCALE) / 2);

const iconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <title>Permission Wallet icon</title>
  <!-- Rounded navy tile so the mark stays visible on light browser chrome. -->
  <rect x="0" y="0" width="512" height="512" rx="112" fill="#0E1F2D" />
  <rect x="6" y="6" width="500" height="500" rx="108" fill="none" stroke="#2DD4BF" stroke-opacity="0.32" stroke-width="2" />
  <!-- The actual brand mark (public/logo-mark.svg), centered and scaled. -->
  <g transform="translate(${tx} ${ty}) scale(${SCALE})">
${inner}
  </g>
</svg>
`;
writeFileSync(join(appDir, "icon.svg"), iconSvg);

// favicon.ico — render the tiled mark at each size, then assemble a PNG-framed ICO.
const sizes = [16, 32, 48];
const frames = await Promise.all(
  sizes.map(async (size) => ({
    size,
    png: await sharp(Buffer.from(iconSvg), { density: 512 }).resize(size, size).png().toBuffer()
  }))
);
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = header.length + dir.length;
  frames.forEach(({ size, png }, i) => {
    const e = i * 16;
    dir[e] = size >= 256 ? 0 : size;
    dir[e + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, e + 4); // planes
    dir.writeUInt16LE(32, e + 6); // bpp
    dir.writeUInt32LE(png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...frames.map((f) => f.png)]);
}
writeFileSync(join(appDir, "favicon.ico"), buildIco(frames));

// apple-icon.png — the bare mark centered on a full-bleed navy square (iOS masks corners).
const appleMark = await sharp(Buffer.from(markRaw), { density: 512 })
  .resize(140, 140, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const apple = await sharp({
  create: { width: 180, height: 180, channels: 4, background: { r: 14, g: 31, b: 45, alpha: 1 } }
})
  .composite([{ input: appleMark, gravity: "center" }])
  .png()
  .toBuffer();
writeFileSync(join(appDir, "apple-icon.png"), apple);

console.log("wrote icon.svg, favicon.ico, apple-icon.png from public/logo-mark.svg");
