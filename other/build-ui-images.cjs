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

Promise.all([
  buildLosslessDisplayImage("rockguy.png", "rockguy-loader.webp", 512),
  buildLosslessDisplayImage("fih.png", "fih-ui.webp", 384)
]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
