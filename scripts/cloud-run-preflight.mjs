import { execFileSync } from "node:child_process";

const options = readOptions(process.argv.slice(2));
const requiredOptions = [
  "project",
  "region",
  "repository",
  "instance",
  "bucket",
  "bucket-location",
  "service-account",
  "claims-webhook-secret",
];

for (const name of requiredOptions) {
  if (!options[name]) fail(`Missing --${name}.`);
}

const project = options.project;
const serviceAccount = options["service-account"];
const requiredSecrets = [
  "hollis-db-name",
  "hollis-db-runtime-password",
  "hollis-db-runtime-user",
  options["claims-webhook-secret"],
];

progress(`Cloud SQL instance ${options.instance}`);
const instance = gcloudJson([
  "sql",
  "instances",
  "describe",
  options.instance,
  "--project",
  project,
]);
assert(instance.state === "RUNNABLE", `Cloud SQL instance ${options.instance} is not runnable.`);
assert(instance.region === options.region, "Cloud SQL instance is not in the requested region.");

progress(`Artifact Registry repository ${options.repository}`);
const repository = gcloudJson([
  "artifacts",
  "repositories",
  "describe",
  options.repository,
  "--location",
  options.region,
  "--project",
  project,
]);
assert(
  repository.format === "DOCKER",
  `Artifact Registry repository ${options.repository} is not Docker.`,
);

progress(`Evidence bucket ${options.bucket}`);
const bucketLocation = gcloudText([
  "storage",
  "buckets",
  "describe",
  `gs://${options.bucket}`,
  "--project",
  project,
  "--format=value(location)",
]);
assert(bucketLocation === options["bucket-location"], "Evidence bucket location does not match.");
assert(
  /\bEnabled:\s+True\b/.test(
    gsutilText(["uniformbucketlevelaccess", "get", `gs://${options.bucket}`]),
  ),
  "Evidence bucket must enforce uniform bucket-level access.",
);
assert(
  gsutilText(["pap", "get", `gs://${options.bucket}`]).endsWith(": enforced"),
  "Evidence bucket must enforce public access prevention.",
);

progress("Cloud SQL Client binding");
const projectPolicy = gcloudJson(["projects", "get-iam-policy", project]);
assert(
  hasMember(projectPolicy.bindings, "roles/cloudsql.client", `serviceAccount:${serviceAccount}`),
  "Runtime service account lacks roles/cloudsql.client.",
);

progress("Evidence bucket runtime access");
const bucketPolicy = gcloudJson([
  "storage",
  "buckets",
  "get-iam-policy",
  `gs://${options.bucket}`,
  "--project",
  project,
]);
for (const role of ["roles/storage.objectCreator", "roles/storage.objectViewer"]) {
  assert(
    hasMember(bucketPolicy.bindings, role, `serviceAccount:${serviceAccount}`),
    `Runtime service account lacks ${role} on the evidence bucket.`,
  );
}

for (const secret of requiredSecrets) {
  progress(`Secret ${secret}`);
  gcloudJson(["secrets", "describe", secret, "--project", project]);

  const secretPolicy = gcloudJson(["secrets", "get-iam-policy", secret, "--project", project]);
  assert(
    hasMember(
      secretPolicy.bindings,
      "roles/secretmanager.secretAccessor",
      `serviceAccount:${serviceAccount}`,
    ),
    `Runtime service account lacks roles/secretmanager.secretAccessor on ${secret}.`,
  );
}

process.stdout.write(
  `${[
    "Cloud Run preflight passed.",
    `Cloud SQL socket: /cloudsql/${instance.connectionName}`,
    `Verified secret names: ${requiredSecrets.join(", ")}`,
    "No service deployment or secret value was created, read, or changed.",
  ].join("\n")}\n`,
);

function gcloudJson(args) {
  try {
    const result = gcloudText([...args, "--format=json"]);
    return JSON.parse(result);
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    fail(`gcloud ${args.join(" ")} failed: ${detail}`);
  }
}

function gcloudText(args) {
  return commandText("gcloud", args);
}

function gsutilText(args) {
  return commandText("gsutil", args);
}

function commandText(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function hasMember(bindings, role, member) {
  return bindings?.some((binding) => binding.role === role && binding.members?.includes(member));
}

function readOptions(argumentsList) {
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      fail("Use named options in --name value pairs.");
    }
    const name = flag.slice(2);
    if (values[name]) fail(`Duplicate --${name}.`);
    values[name] = value;
  }
  return values;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function progress(message) {
  process.stdout.write(`Checking ${message}...\n`);
}

function fail(message) {
  process.stderr.write(`Cloud Run preflight failed: ${message}\n`);
  process.exit(1);
}
