const path = require("node:path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "..");
const imageRoot = path.join(projectRoot, "images");

async function buildLosslessDisplayImage(source, output, width) {
  await sharp(path.join(imageRoot, source))
    .resize({ width, withoutEnlargement: true })
    .webp({ lossless: true, effort: 6 })
    .toFile(path.join(imageRoot, output));
}

const variants = [
  ["rockguy.png", "rockguy-loader-128.webp", 128],
  ["rockguy.png", "rockguy-loader-192.webp", 192],
  ["rockguy.png", "rockguy-loader-320.webp", 320],
  ["rockguy.png", "rockguy-loader.webp", 512],
  ["fih.png", "fih-ui-128.webp", 128],
  ["fih.png", "fih-ui-256.webp", 256],
  ["fih.png", "fih-ui.webp", 384],
  ["hero-pull-static.png", "hero-pull-static-256.webp", 256],
  ["hero-pull-static.png", "hero-pull-static-320.webp", 320],
  ["hero-pull-moving.png", "hero-pull-moving-128.webp", 128],
  ["hero-pull-moving.png", "hero-pull-moving-160.webp", 160],
  ["hero-figure-lower.png", "hero-figure-lower-384.webp", 384],
  ["hero-figure-lower.png", "hero-figure-lower-512.webp", 512],
  ["hero-figure-lower.png", "hero-figure-lower-768.webp", 768],
  ["hero-figure-lower.png", "hero-figure-lower-896.webp", 896]
];

Promise.all(variants.map(([source, output, width]) => (
  buildLosslessDisplayImage(source, output, width)
))).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
