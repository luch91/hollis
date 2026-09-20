import { buildApp } from "../../../apps/api/src/app.ts";
import { readEnvironment } from "../../../apps/api/src/config.ts";

const identities = new Map(
  ["owner", "administrator", "reviewer", "contributor", "auditor", "outside-owner", "new-user"].map(
    (role) => [
      `e2e-${role}`,
      {
        avatarUrl: null,
        displayName: `E2E ${role}`,
        email: `${role}@hollis.test`,
        subject: `e2e-${role}`,
      },
    ],
  ),
);

const identityPlatformTokenVerifier = {
  async verify(token) {
    const identity = identities.get(token);
    if (!identity) throw new Error("Invalid E2E identity token.");
    return identity;
  },
};

const objects = new Map();
const deliveredEmails = [];
const evidenceStorage = {
  async createDownloadUrl(tenantId, objectName) {
    return `http://127.0.0.1:4321/__e2e/storage/${encodeURIComponent(tenantId)}/${encodeURIComponent(objectName)}`;
  },
  async createUploadUrl() {
    return "";
  },
  async delete(_tenantId, objectName) {
    objects.delete(objectName);
  },
  async put(_tenantId, objectName, content, mediaType, expectedDigest) {
    objects.set(objectName, { content, mediaType, expectedDigest });
    return { digest: expectedDigest, mediaType, objectName, sizeBytes: content.byteLength };
  },
  async promote(_tenantId, quarantineObjectName, immutableObjectName) {
    const object = objects.get(quarantineObjectName);
    if (!object) throw new Error("E2E quarantine object was not found.");
    if (!objects.has(immutableObjectName)) objects.set(immutableObjectName, object);
    const immutable = objects.get(immutableObjectName);
    return {
      digest: immutable.expectedDigest,
      mediaType: immutable.mediaType,
      objectName: immutableObjectName,
      providerEtag: `e2e-${immutable.expectedDigest.slice(-12)}`,
      providerVersion: "1",
      sizeBytes: immutable.content.byteLength,
    };
  },
  async verify(_tenantId, objectName, expected) {
    const object = objects.get(objectName);
    if (!object) throw new Error("E2E object was not found.");
    return { ...expected, objectName };
  },
};

const environment = readEnvironment(process.env);
const rateLimiter = { consume() {} };
const transactionalEmailService = {
  async sendWelcome(input) {
    deliveredEmails.push({
      deliveryId: input.deliveryId,
      recipientEmail: input.recipientEmail,
      userId: input.userId,
    });
    return { providerMessageId: `e2e-email-${deliveredEmails.length}` };
  },
};
const app = await buildApp(environment, {
  evidenceStorage,
  identityPlatformTokenVerifier,
  rateLimiter,
  transactionalEmailService,
});
app.get("/__e2e/emails", async () => deliveredEmails);
await app.listen({ host: environment.API_HOST, port: environment.API_PORT });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
