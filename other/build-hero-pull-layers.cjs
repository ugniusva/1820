const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "images", "hero-figure-rope.png");
const cleanSourcePath = path.join(__dirname, "hero-pull-clean-source.png");
const staticPngPath = path.join(root, "images", "hero-pull-static.png");
const staticWebpPath = path.join(root, "images", "hero-pull-static.webp");
const movingPngPath = path.join(root, "images", "hero-pull-moving.png");
const movingWebpPath = path.join(root, "images", "hero-pull-moving.webp");
const restPreviewPath = path.join(__dirname, "hero-pull-rest-preview.png");
const pullPreviewPath = path.join(__dirname, "hero-pull-motion-preview.png");

const width = 1024;
const height = 1536;
const staticCrop = { left: 280, top: 120, width: 520, height: 760 };
const movingCrop = { left: 420, top: 550, width: 270, height: 920 };

function svgMask(content) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${content}
    </svg>
  `);
}

const armShapes = `
  <path fill="#ffffff" d="
    M 438 574
    C 456 565, 491 576, 516 608
    C 511 666, 511 729, 540 795
    C 555 827, 548 854, 522 869
    C 493 874, 470 849, 459 810
    C 442 748, 430 645, 438 574
    Z
  "/>
  <path fill="#ffffff" d="
    M 604 570
    C 632 564, 658 588, 661 624
    C 658 691, 642 758, 612 820
    C 597 852, 574 869, 548 850
    C 533 831, 542 808, 560 778
    C 582 727, 588 650, 590 608
    C 592 590, 596 579, 604 570
    Z
  "/>
  <ellipse fill="#ffffff" cx="548" cy="832" rx="82" ry="68"/>
`;

const movingShapes = `
  ${armShapes}
  <path fill="#ffffff" d="
    M 494 818
    C 518 805, 570 805, 598 830
    L 574 927
    L 544 1458
    L 480 1458
    L 515 925
    Z
  "/>
`;

const connectorShapes = `
  <defs>
    <clipPath id="elbow-overlap">
      <rect x="405" y="552" width="280" height="40"/>
    </clipPath>
  </defs>
  <g clip-path="url(#elbow-overlap)">
    ${armShapes}
  </g>
  <ellipse fill="#ffffff" cx="438" cy="641" rx="13" ry="27"/>
  <ellipse fill="#ffffff" cx="633" cy="641" rx="13" ry="27"/>
`;

async function build() {
  const patchMask = await sharp(svgMask(`
    <defs>
      <clipPath id="cave-interior">
        <rect x="430" y="560" width="240" height="90"/>
      </clipPath>
    </defs>
    <g clip-path="url(#cave-interior)">
      ${armShapes}
    </g>
  `))
    .blur(2.2)
    .png()
    .toBuffer();
  const movingMask = await sharp(svgMask(movingShapes))
    .blur(1.15)
    .png()
    .toBuffer();
  const connectorMask = await sharp(svgMask(connectorShapes))
    .blur(1.15)
    .png()
    .toBuffer();

  const cleanPatch = await sharp(cleanSourcePath)
    .grayscale()
    .ensureAlpha()
    .composite([{ input: patchMask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const connectorPatch = await sharp(sourcePath)
    .ensureAlpha()
    .composite([{ input: connectorMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const cutSource = await sharp(sourcePath)
    .ensureAlpha()
    .composite([{ input: movingMask, blend: "dest-out" }])
    .png()
    .toBuffer();

  const staticLayer = await sharp(cutSource)
    .composite([
      { input: cleanPatch, blend: "over" },
      { input: connectorPatch, blend: "over" }
    ])
    .png()
    .toBuffer();

  const movingLayer = await sharp(sourcePath)
    .ensureAlpha()
    .composite([{ input: movingMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const staticCropped = await sharp(staticLayer)
    .extract(staticCrop)
    .png()
    .toBuffer();
  const movingCropped = await sharp(movingLayer)
    .extract(movingCrop)
    .png()
    .toBuffer();
  const pulledMoving = await sharp(movingCropped)
    .resize({ width: movingCrop.width, height: Math.round(movingCrop.height * 0.88), fit: "fill" })
    .png()
    .toBuffer();

  await Promise.all([
    sharp(staticCropped).png({ compressionLevel: 9 }).toFile(staticPngPath),
    sharp(staticCropped).webp({ quality: 96, alphaQuality: 100 }).toFile(staticWebpPath),
    sharp(movingCropped).png({ compressionLevel: 9 }).toFile(movingPngPath),
    sharp(movingCropped).webp({ quality: 96, alphaQuality: 100 }).toFile(movingWebpPath),
    sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([
        { input: staticCropped, left: staticCrop.left, top: staticCrop.top },
        { input: movingCropped, left: movingCrop.left, top: movingCrop.top }
      ])
      .png({ compressionLevel: 9 })
      .toFile(restPreviewPath),
    sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([
        { input: staticCropped, left: staticCrop.left, top: staticCrop.top },
        { input: pulledMoving, left: movingCrop.left, top: movingCrop.top }
      ])
      .png({ compressionLevel: 9 })
      .toFile(pullPreviewPath)
  ]);

  console.log("Built reversible hero pull layers.");
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
