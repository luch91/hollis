import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const virtualEnvironmentPython =
  process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python";
const candidates = [
  ...(existsSync(virtualEnvironmentPython) ? [[virtualEnvironmentPython, []]] : []),
  ...(process.platform === "win32"
    ? [
        ["py", ["-3.12"]],
        ["python", []],
      ]
    : [
        ["python3.12", []],
        ["python3", []],
      ]),
];

let selected;
for (const [command, prefix] of candidates) {
  const probe = spawnSync(command, [...prefix, "-c", "import sys; print(sys.version_info[:2])"], {
    encoding: "utf8",
  });
  if (probe.status === 0 && probe.stdout.includes("(3, 12)")) {
    selected = [command, prefix];
    break;
  }
}
if (!selected) {
  throw new Error("Python 3.12 is required for contract tests.");
}

const [command, prefix] = selected;
const result = spawnSync(
  command,
  [
    ...prefix,
    "-m",
    "pytest",
    "--import-mode=importlib",
    "contracts/canonical/tests",
    "contracts/genlayer/tests",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
