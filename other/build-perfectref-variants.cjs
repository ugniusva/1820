const path = require("node:path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(projectRoot, "images", "perfectref.png");

async function build() {
  for (const width of [512, 768, 1024]) {
    const filename = width === 1024 ? "perfectref.webp" : `perfectref-${width}.webp`;
    await sharp(source)
      .resize({ width, withoutEnlargement: true, kernel: "lanczos3" })
      .webp({ quality: 97, alphaQuality: 100, smartSubsample: true, effort: 6 })
      .toFile(path.join(projectRoot, "images", filename));
  }
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
