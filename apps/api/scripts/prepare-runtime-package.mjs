import { access, cp, readFile, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

const [workspaceRoot, outputRoot] = process.argv.slice(2);

if (!workspaceRoot || !outputRoot) {
  throw new Error("Usage: prepare-runtime-package.mjs <workspace-root> <output-root>.");
}

const packages = ["@hollis/contracts", "@hollis/database"];
const outputRootRealPath = await realpath(outputRoot);

await copyRequiredDirectory(join(workspaceRoot, "apps", "api", "dist"), join(outputRoot, "dist"));

for (const packageName of packages) {
  const sourceDirectory = join(workspaceRoot, "packages", packageName.split("/").at(-1), "dist");
  const installedDirectory = await realpath(join(outputRoot, "node_modules", packageName));

  assertWithinOutput(installedDirectory, outputRootRealPath);

  await copyRequiredDirectory(sourceDirectory, join(installedDirectory, "dist"));
  await setRuntimeExport(installedDirectory);
}

async function copyRequiredDirectory(source, destination) {
  await access(source, constants.R_OK);
  await cp(source, destination, { recursive: true });
}

async function setRuntimeExport(packageDirectory) {
  const packagePath = join(packageDirectory, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

  packageJson.exports = {
    ".": "./dist/index.js",
  };

  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function assertWithinOutput(path, parent) {
  const pathFromOutput = relative(parent, path);
  if (pathFromOutput === "" || (!pathFromOutput.startsWith("..") && !isAbsolute(pathFromOutput))) {
    return;
  }

  throw new Error(`Refusing to modify a workspace package outside ${parent}.`);
}
