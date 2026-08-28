import { readFileSync } from "node:fs";

const messagePath = process.argv[2];
if (!messagePath) {
  console.error("Commit message file path is required.");
  process.exit(1);
}

const message = readFileSync(messagePath, "utf8").trim();
const subject = message.split("\n", 1)[0];
const conventional =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|test)(\([a-z0-9][a-z0-9-]*\))?!?: [a-z0-9]/;
const attributionTerms = ["co-authored" + "-by", "generated" + " by", "authored" + " by"].join("|");
const systemNames = [
  "chat" + "gpt",
  "open" + "ai",
  "claude",
  "copilot",
  "gemini",
  "codex",
  "an ai",
].join("|");
const prohibitedAttribution = new RegExp(`(?:${attributionTerms}):?.*(?:${systemNames})`, "i");

if (!conventional.test(subject)) {
  console.error(
    "Commit subject must follow Conventional Commits and start its description in lowercase.",
  );
  process.exit(1);
}

if (message.includes("\u2014")) {
  console.error("Commit messages must not contain em dash characters.");
  process.exit(1);
}

if (prohibitedAttribution.test(message)) {
  console.error("Commit messages must not contain automated authorship attribution.");
  process.exit(1);
}
