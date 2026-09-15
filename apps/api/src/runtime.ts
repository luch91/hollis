import { buildApp } from "./app.js";
import { readEnvironment } from "./config.js";
import { assertGenLayerRuntimeAccount } from "./genlayer-runtime-account.js";
import { createStudioDevAttestationVerifier } from "./studio-dev-attestation.js";
import { createStudioDevManagedAttestationClient } from "./studio-dev-managed-attestation.js";
import { createStudioDevPolicyContractClient } from "./studio-dev-policy-contract.js";

export async function createRuntimeApp() {
  const environment = readEnvironment();
  if (environment.GENLAYER_RUNTIME_ADDRESS && environment.GENLAYER_RUNTIME_PRIVATE_KEY) {
    assertGenLayerRuntimeAccount({
      address: environment.GENLAYER_RUNTIME_ADDRESS,
      privateKey: environment.GENLAYER_RUNTIME_PRIVATE_KEY,
    });
  }

  const managedRuntimeConfigured = Boolean(
    environment.GENLAYER_RPC_URL &&
      environment.GENLAYER_RUNTIME_ADDRESS &&
      environment.GENLAYER_RUNTIME_PRIVATE_KEY,
  );
  const policyContractDeploymentClient =
    environment.GENLAYER_RUNTIME_PRIVATE_KEY && environment.GENLAYER_RPC_URL
      ? createStudioDevPolicyContractClient(
          environment.GENLAYER_RUNTIME_PRIVATE_KEY,
          environment.GENLAYER_RPC_URL,
        )
      : undefined;
  const managedAttestationClient =
    environment.GENLAYER_RUNTIME_PRIVATE_KEY && environment.GENLAYER_RPC_URL
      ? createStudioDevManagedAttestationClient(
          environment.GENLAYER_RUNTIME_PRIVATE_KEY,
          environment.GENLAYER_RPC_URL,
        )
      : undefined;
  const candidateAttestationImporter =
    environment.GENLAYER_STUDIO_CONTRACT_ADDRESS && !managedRuntimeConfigured
      ? createStudioDevAttestationVerifier(
          environment.GENLAYER_STUDIO_CONTRACT_ADDRESS,
          environment.GENLAYER_RPC_URL ?? "https://studio-next.genlayer.com/api",
        )
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
    managedAttestationClient,
    policyContractDeploymentClient,
  });

  if (attestationImporterUnavailable) {
    app.log.warn(
      "Studio Next legacy attestation-import readiness could not be established; the core review service remains available.",
    );
  }
  if (environment.GENLAYER_STUDIO_CONTRACT_ADDRESS && managedRuntimeConfigured) {
    app.log.info(
      "Legacy Studio Next contract import is disabled because the managed policy-contract runtime is configured.",
    );
  }

  return { app, environment };
}
