const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "images", "temproary");
const scriptRoot = path.join(projectRoot, "scripts");
const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, "manifest.json"), "utf8"));
const columns = 9;
const rows = 8;
const highResolutionCount = 12;
const assetCount = manifest.round_forms.length + highResolutionCount;

async function loadAsset(index, contentSize) {
  if (index < manifest.round_forms.length) {
    return sharp(path.join(sourceRoot, manifest.round_forms[index].file))
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
      .resize(contentSize, contentSize, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
  }

  const highResolutionIndex = index - manifest.round_forms.length;
  const column = highResolutionIndex % 4;
  const row = Math.floor(highResolutionIndex / 4);
  const sheetWidth = 1536;
  const sheetHeight = 1024;
  const left = Math.round((column * sheetWidth) / 4);
  const top = Math.round((row * sheetHeight) / 3);
  const right = Math.min(sheetWidth - 1, Math.round(((column + 1) * sheetWidth) / 4));
  const bottom = Math.min(sheetHeight - 1, Math.round(((row + 1) * sheetHeight) / 3));

  const crop = await sharp(path.join(sourceRoot, "index2-hires-stones-sheet.png"))
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();

  return sharp(crop)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
    .resize(contentSize, contentSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: "lanczos3"
    })
    .sharpen({ sigma: 0.75, m1: 0.65, m2: 1.4 })
    .png()
    .toBuffer();
}

async function buildAtlas(name, cellSize) {
  const inset = Math.max(1, Math.round(cellSize / 64));
  const contentSize = cellSize - (inset * 2);
  const layers = [];

  for (let index = 0; index < assetCount; index += 1) {
    const cell = await loadAsset(index, contentSize);

    layers.push({
      input: cell,
      left: (index % columns) * cellSize + inset,
      top: Math.floor(index / columns) * cellSize + inset
    });
  }

  await sharp({
    create: {
      width: columns * cellSize,
      height: rows * cellSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(layers)
    .recomb([
      [0.299, 0.587, 0.114],
      [0.299, 0.587, 0.114],
      [0.299, 0.587, 0.114]
    ])
    .webp({ lossless: true, effort: 6 })
    .toFile(path.join(sourceRoot, `${name}.webp`));
}

async function buildBodyVariants() {
  await Promise.all([384, 512, 768, 968].map((width) => (
    sharp(path.join(sourceRoot, "body-and-carrier.png"))
      .resize({ width, withoutEnlargement: true })
      .webp({ lossless: true, effort: 6 })
      .toFile(path.join(sourceRoot, `body-and-carrier-${width}.webp`))
  )));
}

function buildDataModule() {
  const stones = manifest.round_forms.map((stone, assetIndex) => {
    const [left, top, right, bottom] = stone.bounds;
    return {
      assetIndex,
      centerX: stone.center[0],
      centerY: stone.center[1],
      maxSize: Math.max(right - left, bottom - top)
    };
  });
  const source = `window.Index2CutoutData = Object.freeze(${JSON.stringify({
    masterWidth: 1121,
    masterHeight: 1403,
    ropeAnchorX: 267,
    bodyTopY: 396,
    bodyWidth: 968,
    bodyHeight: 1007,
    atlasColumns: columns,
    atlasRows: rows,
    assetCount,
    highResolutionStart: manifest.round_forms.length,
    highResolutionCount,
    stones
  })});\n`;
  fs.writeFileSync(path.join(scriptRoot, "index2-cutout-data.js"), source, "utf8");
}

async function build() {
  buildDataModule();
  await Promise.all([
    buildAtlas("index2-stone-atlas", 448),
    buildAtlas("index2-stone-atlas-compact", 224),
    buildAtlas("index2-stone-atlas-preview", 112),
    buildBodyVariants()
  ]);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
