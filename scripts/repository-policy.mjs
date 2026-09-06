import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const authorized = Object.freeze({
  account: "luch91",
  email: "luchijudith@gmail.com",
  name: "luch91",
});

const mode = process.argv[2] ?? "repository";
const failures = [];
const conventionalSubject =
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

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    if (options.allowFailure) {
      return "";
    }
    const message = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(" ")} failed: ${message}`);
  }
}

function verifyLocalIdentity() {
  const name = git(["config", "--local", "user.name"], { allowFailure: true });
  const email = git(["config", "--local", "user.email"], { allowFailure: true });

  if (name !== authorized.name || email !== authorized.email) {
    failures.push(
      `Local Git identity must be ${authorized.name} <${authorized.email}>; received ${name || "unset"} <${email || "unset"}>.`,
    );
  }
}

function verifyGithubActor() {
  if (process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_ACTOR !== authorized.account) {
    failures.push(
      `GitHub actor ${process.env.GITHUB_ACTOR || "unset"} is not authorized. Only ${authorized.account} may modify this repository.`,
    );
  }
}

function verifyRemoteOwner() {
  const remote = git(["remote", "get-url", "origin"], { allowFailure: true });
  if (!remote) {
    return;
  }

  const match = remote.match(/github\.com(?::|\/)([^/]+)\//i);
  if (match && match[1].toLowerCase() !== authorized.account.toLowerCase()) {
    failures.push(
      `Origin owner ${match[1]} is not authorized. GitHub origin must belong to ${authorized.account}.`,
    );
  }
}

function verifyHistory() {
  const records = git(["log", "--all", "--format=%H%x09%an%x09%ae%x09%cn%x09%ce"], {
    allowFailure: true,
  });
  if (!records) {
    return;
  }

  for (const record of records.split("\n")) {
    const [hash, authorName, authorEmail, committerName, committerEmail] = record.split("\t");
    if (
      authorName !== authorized.name ||
      authorEmail !== authorized.email ||
      committerName !== authorized.name ||
      committerEmail !== authorized.email
    ) {
      failures.push(`Commit ${hash} has an unauthorized author or committer identity.`);
    }

    const message = git(["show", "--no-patch", "--format=%B", hash]);
    const subject = message.split("\n", 1)[0];
    if (!conventionalSubject.test(subject)) {
      failures.push(`Commit ${hash} does not follow the required commit-message format.`);
    }
    if (message.includes("\u2014")) {
      failures.push(`Commit ${hash} contains an em dash character.`);
    }
    if (prohibitedAttribution.test(message)) {
      failures.push(`Commit ${hash} contains prohibited automated authorship attribution.`);
    }
  }
}

function candidateFiles() {
  if (mode === "staged") {
    const output = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    return output ? output.split("\n") : [];
  }

  const tracked = git(["ls-files"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean))];
}

function verifyTextPolicy() {
  for (const path of candidateFiles()) {
    if (!existsSync(path)) {
      continue;
    }

    const buffer = readFileSync(path);
    if (buffer.includes(0)) {
      continue;
    }

    const content = buffer.toString("utf8");
    if (content.includes("\u2014")) {
      failures.push(`${path} contains an em dash character.`);
    }
    if (prohibitedAttribution.test(content)) {
      failures.push(`${path} contains prohibited automated authorship attribution.`);
    }
  }
}

function verifyPrivateLog() {
  if (!existsSync(".hollis/decisions.md")) {
    failures.push("The private decision log .hollis/decisions.md is missing.");
  }

  const ignored = git(["check-ignore", ".hollis/decisions.md"], { allowFailure: true });
  if (ignored !== ".hollis/decisions.md") {
    failures.push("The private decision log must be ignored by Git.");
  }
}

function verifyMigrationJournal() {
  const migrationsDirectory = "packages/database/drizzle";
  const journalPath = join(migrationsDirectory, "meta", "_journal.json");

  if (!existsSync(journalPath)) {
    failures.push(`Migration journal ${journalPath} is missing.`);
    return;
  }

  const migrationTags = readdirSync(migrationsDirectory)
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .map((filename) => filename.slice(0, -".sql".length));
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const journalTags = new Set(journal.entries.map((entry) => entry.tag));
  const missing = migrationTags.filter((tag) => !journalTags.has(tag));
  const orphaned = [...journalTags].filter((tag) => !migrationTags.includes(tag));

  if (missing.length > 0) {
    failures.push(`Migration files missing from the journal: ${missing.join(", ")}.`);
  }

  if (orphaned.length > 0) {
    failures.push(`Migration journal entries without files: ${orphaned.join(", ")}.`);
  }
}

verifyLocalIdentity();
verifyGithubActor();
verifyRemoteOwner();
verifyHistory();
verifyTextPolicy();
verifyPrivateLog();
verifyMigrationJournal();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Policy violation: ${failure}`);
  }
  process.exit(1);
}

console.log(`Repository policy passed in ${mode} mode.`);
