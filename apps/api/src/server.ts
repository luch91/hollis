import { buildApp } from "./app.js";
import { readEnvironment } from "./config.js";
import { createStudioDevAttestationVerifier } from "./studio-dev-attestation.js";

const environment = readEnvironment();
const finalizedAttestationImporter = environment.GENLAYER_STUDIO_CONTRACT_ADDRESS
  ? createStudioDevAttestationVerifier(environment.GENLAYER_STUDIO_CONTRACT_ADDRESS)
  : undefined;

if (finalizedAttestationImporter) {
  await finalizedAttestationImporter.assertRepresentativeState();
}

const app = await buildApp(environment, {
  finalizedAttestationImporter,
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutdown requested");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
