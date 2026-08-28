import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const icnsPath = resolve(mobileRoot, "node_modules/image-size/dist/types/icns.js");
const utilsPath = resolve(mobileRoot, "node_modules/image-size/dist/types/utils.js");
const verifyOnly = process.argv.includes("--verify");

let icns = readFileSync(icnsPath, "utf8");
let utils = readFileSync(utilsPath, "utf8");

if (!verifyOnly && !icns.includes("if (imageHeader[1] < SIZE_HEADER)")) {
  const initialNeedle = `        let imageSize = getImageSize(imageHeader[0]);
        imageOffset += imageHeader[1];`;
  const initialReplacement = `        let imageSize = getImageSize(imageHeader[0]);
        if (imageHeader[1] < SIZE_HEADER)
            return imageSize;
        imageOffset += imageHeader[1];`;
  const loopNeedle = `            imageSize = getImageSize(imageHeader[0]);
            imageOffset += imageHeader[1];`;
  const loopReplacement = `            imageSize = getImageSize(imageHeader[0]);
            if (imageHeader[1] < SIZE_HEADER)
                break;
            imageOffset += imageHeader[1];`;

  if (!icns.includes(initialNeedle) || !icns.includes(loopNeedle)) {
    throw new Error("The image-size ICNS parser changed; review the security patch before installing.");
  }

  icns = icns.replace(initialNeedle, initialReplacement).replace(loopNeedle, loopReplacement);
  writeFileSync(icnsPath, icns);
}

if (!verifyOnly && !utils.includes("box.size > 0 ? box.size : 8")) {
  const vulnerableAdvance = "        offset += box.size;";

  if (!utils.includes(vulnerableAdvance)) {
    throw new Error("The image-size box parser changed; review the security patch before installing.");
  }

  utils = utils.replace(vulnerableAdvance, "        offset += box.size > 0 ? box.size : 8;");
  writeFileSync(utilsPath, utils);
}

const icnsGuards = (icns.match(/imageHeader\[1\] < SIZE_HEADER/g) || []).length;
const boxGuarded = utils.includes("box.size > 0 ? box.size : 8");

if (icnsGuards !== 2 || !boxGuarded) {
  throw new Error("The image-size parser hardening is not installed.");
}

console.log("image-size parser hardening verified");
