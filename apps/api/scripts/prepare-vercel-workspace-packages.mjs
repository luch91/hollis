import { cp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

if (!process.env.VERCEL) {
  process.exit(0);
}

const apiRoot = process.cwd();
const packageNames = ["contracts", "database"];

for (const packageName of packageNames) {
  const packageDirectory = join(apiRoot, "node_modules", "@hollis", packageName);
  const sourceDirectory = await realpath(packageDirectory);

  await rm(packageDirectory, { force: true, recursive: true });
  await cp(sourceDirectory, packageDirectory, { recursive: true });

  const packagePath = join(packageDirectory, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  packageJson.exports = { ".": "./dist/index.js" };
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}
