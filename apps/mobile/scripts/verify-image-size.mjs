import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedVersion = "2.0.3-payshield.0";
const packageRoots = [
  resolve(mobileRoot, "vendor/image-size"),
  resolve(mobileRoot, "node_modules/image-size"),
].filter((root) => existsSync(root));

function verifyPackage(root) {
  const packageJson = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  const icns = readFileSync(resolve(root, "dist/types/icns.js"), "utf8");
  const utils = readFileSync(resolve(root, "dist/types/utils.js"), "utf8");
  const icnsGuards = (icns.match(/imageHeader\[1\] < SIZE_HEADER/g) || [])
    .length;
  const boxGuarded = utils.includes("offset += box.size > 0 ? box.size : 8;");

  if (packageJson.version !== expectedVersion) {
    throw new Error(
      `Expected image-size ${expectedVersion}, found ${packageJson.version}.`,
    );
  }

  if (icnsGuards !== 2 || !boxGuarded) {
    throw new Error(`image-size parser hardening is incomplete in ${root}.`);
  }

  if (utils.includes("offset += box.size;")) {
    throw new Error(`Vulnerable image-size box advancement remains in ${root}.`);
  }
}

if (packageRoots.length === 0) {
  throw new Error("The vendored image-size package is missing.");
}

packageRoots.forEach(verifyPackage);
console.log("vendored image-size parser hardening verified");
