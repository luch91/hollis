import { buildApp } from "./app.js";
import { readEnvironment } from "./config.js";
import { assertGenLayerRuntimeAccount } from "./genlayer-runtime-account.js";
import { createStudioDevAttestationVerifier } from "./studio-dev-attestation.js";
import { createStudioDevPolicyContractClient } from "./studio-dev-policy-contract.js";

const environment = readEnvironment();
if (environment.GENLAYER_RUNTIME_ADDRESS && environment.GENLAYER_RUNTIME_PRIVATE_KEY) {
  assertGenLayerRuntimeAccount({
    address: environment.GENLAYER_RUNTIME_ADDRESS,
    privateKey: environment.GENLAYER_RUNTIME_PRIVATE_KEY,
  });
}
const managedRuntimeConfigured = Boolean(
  environment.GENLAYER_RUNTIME_ADDRESS && environment.GENLAYER_RUNTIME_PRIVATE_KEY,
);
const policyContractDeploymentClient = environment.GENLAYER_RUNTIME_PRIVATE_KEY
  ? createStudioDevPolicyContractClient(environment.GENLAYER_RUNTIME_PRIVATE_KEY)
  : undefined;
const candidateAttestationImporter =
  environment.GENLAYER_STUDIO_CONTRACT_ADDRESS && !managedRuntimeConfigured
    ? createStudioDevAttestationVerifier(environment.GENLAYER_STUDIO_CONTRACT_ADDRESS)
    : undefined;
let finalizedAttestationImporter = candidateAttestationImporter;
let attestationImporterUnavailable = false;

if (candidateAttestationImporter) {
  try {
    await candidateAttestationImporter.assertRepresentativeState();
  } catch {
    finalizedAttestationImporter = undefined;
    attestationImporterUnavailable = true;
  }
}

const app = await buildApp(environment, {
  finalizedAttestationImporter,
  policyContractDeploymentClient,
});

if (attestationImporterUnavailable) {
  app.log.warn(
    "Studio Dev attestation readiness could not be established; the core review service remains available.",
  );
}
if (environment.GENLAYER_STUDIO_CONTRACT_ADDRESS && managedRuntimeConfigured) {
  app.log.info(
    "Legacy Studio Dev contract import is disabled because the managed policy-contract runtime is configured.",
  );
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutdown requested");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
