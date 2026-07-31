const path = require("path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "..");
const imageRoot = path.join(projectRoot, "images");
const sources = Array.from(
  { length: 10 },
  (_, index) => path.join(imageRoot, `hero-rock-${String(index + 1).padStart(2, "0")}.png`)
);

async function buildAtlas(name, cellSize) {
  const columns = 4;
  const rows = 3;
  const insetSize = Math.round(cellSize * 0.94);
  const insetOffset = Math.round((cellSize - insetSize) / 2);
  const layers = [];

  for (let index = 0; index < sources.length; index += 1) {
    const input = sources[index];
    const cell = await sharp(input)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
      .resize(insetSize, insetSize, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();

    layers.push({
      input: cell,
      left: (index % columns) * cellSize + insetOffset,
      top: Math.floor(index / columns) * cellSize + insetOffset
    });
  }

  const atlas = sharp({
    create: {
      width: columns * cellSize,
      height: rows * cellSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite(layers);

  await atlas
    .clone()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(imageRoot, `${name}.png`));

  await atlas
    .clone()
    .webp({ lossless: true, effort: 6 })
    .toFile(path.join(imageRoot, `${name}.webp`));
}

async function buildFigure(name) {
  await sharp(path.join(imageRoot, `${name}.png`))
    .webp({ lossless: true, effort: 6 })
    .toFile(path.join(imageRoot, `${name}.webp`));
}

Promise.all([
  buildAtlas("hero-rock-atlas", 768),
  buildAtlas("hero-rock-atlas-compact", 512),
  buildFigure("hero-figure-lower"),
  buildFigure("hero-figure-rope")
]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
