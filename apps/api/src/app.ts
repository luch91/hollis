import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import {
  canonicalJson,
  createAttestationRequestSchema,
  createPolicyVersionSchema,
  createPublicAttestationCaseFileRequestSchema,
  createReviewCaseSchema,
  decideReviewCaseSchema,
  escalateReviewCaseSchema,
  importFinalizedAttestationRequestSchema,
  type ReviewExportIdentityLabels,
  reviewCaseStatusSchema,
} from "@hollis/contracts";
import { createDatabase } from "@hollis/database";
import Fastify, { LogController } from "fastify";
import { z } from "zod";
import type {
  AttestationProvider,
  AttestationStore,
  FinalizedAttestationImporter,
  PublicAttestationCaseFileStore,
} from "./attestation.js";
import {
  AttestationPreconditionError,
  buildAdjudicationCaseFile,
  buildCanonicalReviewMetadata,
  buildGenLayerAttestationRequest,
  verifyAdjudicationCaseFileIntegrity,
} from "./attestation-workflow.js";
import {
  type AccessTokenVerifier,
  type ApplicationSessionStore,
  createHollisAccessTokenVerifier,
  createHollisUnscopedAccessTokenVerifier,
  InsufficientPermissionError,
  InvalidAccessTokenError,
  readBearerToken,
  type StoredApplicationSession,
  type UnscopedAccessTokenVerifier,
} from "./auth.js";
import { databaseConnectionFromEnvironment, type Environment } from "./config.js";
import { createConfiguredEvidenceStorage } from "./configured-evidence-storage.js";
import { EvidenceVerificationError, evidenceUploadSchema } from "./evidence.js";
import {
  createApplicationSessionToken,
  createIdentityPlatformTokenVerifier,
  digestApplicationSessionToken,
  type IdentityPlatformTokenVerifier,
  type VerifiedIdentityPlatformIdentity,
} from "./identity-platform.js";
import {
  createOrganizationLogoService,
  OrganizationLogoError,
  type OrganizationLogoService,
} from "./organization-logo.js";
import {
  createPostgresApplicationSessionStore,
  createPostgresAttestationStore,
  createPostgresEvidenceMetadataStore,
  createPostgresManagedAttestationSubmissionStore,
  createPostgresPolicyLibraryStore,
  createPostgresPolicyContractDeploymentStore,
  createPostgresPublicAttestationCaseFileStore,
  createPostgresReviewIntakeStore,
  createPostgresReviewWorkflowStore,
  createPostgresTenantResolver,
  createPostgresUserProfileStore,
  createPostgresWelcomeEmailDeliveryStore,
  createPostgresWorkspaceControlsStore,
  createPostgresWorkspaceProvisioningStore,
  setEvidenceLegalHold,
} from "./persistence.js";
import {
  reconcileManagedAttestationForCase,
  startManagedAttestationForCase,
  type ManagedAttestationProgress,
} from "./managed-attestation-orchestrator.js";
import type {
  ManagedAttestationClient,
  ManagedAttestationSubmissionStore,
} from "./managed-attestation-submission.js";
import {
  beginPolicyContractDeployment,
  ensurePolicyContractDeployment,
  PolicyContractDeploymentError,
  reconcilePolicyContractDeployment,
  type PolicyContractDeploymentClient,
  type PolicyContractDeploymentStore,
} from "./policy-contract-deployment.js";
import {
  assertPublishedCasePolicy,
  createPublishedPolicy,
  PolicyBindingError,
  PolicyVersionConflictError,
  type PolicyLibraryStore,
} from "./policy-library.js";
import {
  assertStoredPolicySource,
  createPolicySource,
  policySourceObjectName,
  PolicySourceError,
} from "./policy-source.js";
import {
  createInMemoryRateLimiter,
  createRateLimitPreHandler,
  type RateLimiter,
} from "./rate-limit.js";
import {
  createReviewIntake,
  ReviewIntakeConflictError,
  type ReviewIntakeStore,
  type TenantResolver,
} from "./review-intake.js";
import {
  createSecurityPreHandler,
  requireRequestContext,
  sendSecurityError,
  TenantAccessError,
} from "./security.js";
import { StudioDevAttestationVerificationError } from "./studio-dev-attestation.js";
import {
  createResendTransactionalEmailService,
  type TransactionalEmailService,
} from "./transactional-email.js";
import { claimsWebhookSchema, InvalidWebhookError, verifyClaimsWebhook } from "./webhook.js";
import type {
  PendingWelcomeEmailDelivery,
  WelcomeEmailDeliveryStore,
} from "./welcome-email-delivery.js";
import {
  ReviewCaseNotFoundError,
  ReviewCaseTransitionError,
  type ReviewWorkflowStore,
  toDetailResponse,
  toExportResponse,
  toQueueResponse,
  toWorkflowResponse,
} from "./workflow.js";
import {
  acceptInvitationSchema,
  changeMemberRoleSchema,
  createInvitationSchema,
  createInvitationToken,
  workspaceProfileSchema,
} from "./workspace-controls.js";
import {
  createHollisWorkspaceProvisioner,
  createWorkspaceSchema,
  type WorkspaceProvisioner,
  WorkspaceProvisioningError,
} from "./workspace-provisioning.js";
import {
  createProfileAvatar,
  ProfileAvatarError,
  serializeProfileTimestamp,
  updateUserProfileSchema,
} from "./user-profile.js";

type AppDependencies = {
  accessTokenVerifier?: AccessTokenVerifier;
  reviewIntakeStore?: ReviewIntakeStore;
  policyLibraryStore?: PolicyLibraryStore;
  policyContractDeploymentStore?: PolicyContractDeploymentStore;
  policyContractDeploymentClient?: PolicyContractDeploymentClient;
  managedAttestationSubmissionStore?: ManagedAttestationSubmissionStore;
  managedAttestationClient?: ManagedAttestationClient;
  policyContractSource?: string;
  tenantResolver?: TenantResolver;
  workflowStore?: ReviewWorkflowStore;
  evidenceStorage?: import("./evidence-storage.js").EvidenceStorage;
  evidenceMetadataStore?: import("./evidence.js").EvidenceMetadataStore;
  attestationProvider?: AttestationProvider;
  finalizedAttestationImporter?: FinalizedAttestationImporter;
  publicAttestationCaseFileStore?: PublicAttestationCaseFileStore;
  attestationStore?: AttestationStore;
  legalHoldStore?: (
    tenantId: string,
    caseId: string,
    evidenceId: string,
    active: boolean,
    actorId: string,
  ) => Promise<boolean>;
  workspaceProvisioner?: WorkspaceProvisioner;
  unscopedAccessTokenVerifier?: UnscopedAccessTokenVerifier;
  applicationSessionStore?: ApplicationSessionStore;
  identityPlatformTokenVerifier?: IdentityPlatformTokenVerifier;
  workspaceControlsStore?: ReturnType<typeof createPostgresWorkspaceControlsStore>;
  userProfileStore?: ReturnType<typeof createPostgresUserProfileStore>;
  transactionalEmailService?: TransactionalEmailService | null;
  welcomeEmailDeliveryStore?: WelcomeEmailDeliveryStore;
  rateLimiter?: RateLimiter;
  organizationLogoService?: OrganizationLogoService;
};

const rateLimitPolicies = {
  attestation: { maxRequests: 10, windowMs: 60 * 60 * 1000 },
  claimsWebhook: { maxRequests: 10, windowMs: 60 * 1000 },
  evidenceUpload: { maxRequests: 30, windowMs: 60 * 60 * 1000 },
  export: { maxRequests: 60, windowMs: 60 * 60 * 1000 },
  exportIdentity: { maxRequests: 60, windowMs: 60 * 60 * 1000 },
  invitation: { maxRequests: 30, windowMs: 60 * 60 * 1000 },
  logoDiscovery: { maxRequests: 10, windowMs: 60 * 60 * 1000 },
  policySource: { maxRequests: 10, windowMs: 60 * 60 * 1000 },
  profileAvatar: { maxRequests: 10, windowMs: 60 * 60 * 1000 },
  sessionExchange: { maxRequests: 10, windowMs: 15 * 60 * 1000 },
  workspaceSetup: { maxRequests: 10, windowMs: 60 * 60 * 1000 },
} as const;

export async function buildApp(environment: Environment, dependencies: AppDependencies = {}) {
  const rateLimiter = dependencies.rateLimiter ?? createInMemoryRateLimiter();
  const rateLimit = (scope: keyof typeof rateLimitPolicies) =>
    createRateLimitPreHandler(rateLimiter, scope, rateLimitPolicies[scope]);
  const databaseResource =
    dependencies.reviewIntakeStore &&
    dependencies.tenantResolver &&
    dependencies.workflowStore &&
    dependencies.evidenceMetadataStore &&
    dependencies.publicAttestationCaseFileStore &&
    dependencies.applicationSessionStore
      ? null
      : createDatabase(databaseConnectionFromEnvironment(environment));

  function requireDatabase() {
    if (!databaseResource) {
      throw new Error("Database dependencies are incomplete.");
    }

    return databaseResource.database;
  }

  const reviewIntakeStore =
    dependencies.reviewIntakeStore ?? createPostgresReviewIntakeStore(requireDatabase());
  const policyLibraryStore =
    dependencies.policyLibraryStore ?? createPostgresPolicyLibraryStore(requireDatabase());
  const policyContractDeploymentStore =
    dependencies.policyContractDeploymentStore ??
    (databaseResource
      ? createPostgresPolicyContractDeploymentStore(databaseResource.database)
      : null);
  const managedAttestationSubmissionStore =
    dependencies.managedAttestationSubmissionStore ??
    (databaseResource
      ? createPostgresManagedAttestationSubmissionStore(databaseResource.database)
      : null);
  const policyContractSource =
    dependencies.policyContractSource ??
    readFileSync(
      new URL("../../../contracts/genlayer/policy_process_attestation_v7.py", import.meta.url),
      "utf8",
    );
  const tenantResolver =
    dependencies.tenantResolver ?? createPostgresTenantResolver(requireDatabase());
  const workflowStore =
    dependencies.workflowStore ?? createPostgresReviewWorkflowStore(requireDatabase());
  const evidenceMetadataStore =
    dependencies.evidenceMetadataStore ?? createPostgresEvidenceMetadataStore(requireDatabase());
  const attestationStore =
    dependencies.attestationStore ??
    (databaseResource ? createPostgresAttestationStore(databaseResource.database) : null);
  const publicAttestationCaseFileStore =
    dependencies.publicAttestationCaseFileStore ??
    (databaseResource
      ? createPostgresPublicAttestationCaseFileStore(databaseResource.database)
      : null);
  const legalHoldStore =
    dependencies.legalHoldStore ??
    ((tenantId, caseId, evidenceId, active, actorId) =>
      setEvidenceLegalHold(requireDatabase(), tenantId, caseId, evidenceId, active, actorId));
  const workspaceProvisioner =
    dependencies.workspaceProvisioner ??
    createHollisWorkspaceProvisioner(createPostgresWorkspaceProvisioningStore(requireDatabase()));
  const applicationSessionStore =
    dependencies.applicationSessionStore ??
    createPostgresApplicationSessionStore(requireDatabase());
  const welcomeEmailDeliveryStore =
    dependencies.welcomeEmailDeliveryStore ??
    (databaseResource
      ? createPostgresWelcomeEmailDeliveryStore(databaseResource.database)
      : (() => {
          const unavailable = async () => {
            throw new Error("Welcome email delivery dependencies are unavailable.");
          };
          return {
            claimPending: unavailable,
            markFailed: unavailable,
            markSent: unavailable,
            recordNewUser: unavailable,
          } as WelcomeEmailDeliveryStore;
        })());
  const transactionalEmailService =
    dependencies.transactionalEmailService ??
    (environment.RESEND_API_KEY && environment.RESEND_FROM
      ? createResendTransactionalEmailService({
          apiKey: environment.RESEND_API_KEY,
          from: environment.RESEND_FROM,
        })
      : null);
  const workspaceControlsStore =
    dependencies.workspaceControlsStore ??
    (databaseResource
      ? createPostgresWorkspaceControlsStore(databaseResource.database)
      : (() => {
          const unavailable = async () => {
            throw new Error("Workspace control dependencies are unavailable.");
          };
          return {
            acceptInvitation: unavailable,
            changeMemberRole: unavailable,
            createInvitation: unavailable,
            getMemberIdentity: unavailable,
            getProfile: unavailable,
            listInvitations: unavailable,
            listAuditEvents: unavailable,
            listMembers: unavailable,
            listUserWorkspaces: unavailable,
            removeLogo: unavailable,
            revokeInvitation: unavailable,
            searchMembers: unavailable,
            setLogo: unavailable,
            updateProfile: unavailable,
          } as ReturnType<typeof createPostgresWorkspaceControlsStore>;
        })());
  const userProfileStore =
    dependencies.userProfileStore ??
    (databaseResource
      ? createPostgresUserProfileStore(databaseResource.database)
      : (() => {
          const unavailable = async () => {
            throw new Error("Personal profile dependencies are unavailable.");
          };
          return {
            get: unavailable,
            removeAvatar: unavailable,
            setAvatar: unavailable,
            update: unavailable,
          } as ReturnType<typeof createPostgresUserProfileStore>;
        })());
  const accessTokenVerifier =
    dependencies.accessTokenVerifier ?? createHollisAccessTokenVerifier(applicationSessionStore);
  const unscopedAccessTokenVerifier =
    dependencies.unscopedAccessTokenVerifier ??
    createHollisUnscopedAccessTokenVerifier(applicationSessionStore);
  const identityPlatformTokenVerifier =
    dependencies.identityPlatformTokenVerifier ?? createIdentityPlatformTokenVerifier(environment);
  const evidenceStorage =
    dependencies.evidenceStorage ?? (await createConfiguredEvidenceStorage(environment));
  const organizationLogoService =
    dependencies.organizationLogoService ??
    (evidenceStorage ? createOrganizationLogoService(evidenceStorage) : null);
  const managedAttestationDependencies =
    environment.PUBLIC_ATTESTATION_ORIGIN &&
    environment.GENLAYER_RUNTIME_ADDRESS &&
    dependencies.policyContractDeploymentClient &&
    dependencies.managedAttestationClient &&
    policyContractDeploymentStore &&
    managedAttestationSubmissionStore &&
    publicAttestationCaseFileStore
      ? {
          attestationClient: dependencies.managedAttestationClient,
          deploymentClient: dependencies.policyContractDeploymentClient,
          deploymentStore: policyContractDeploymentStore,
          evidenceMetadataStore,
          policyLibraryStore,
          publicCaseFileStore: publicAttestationCaseFileStore,
          publicOrigin: environment.PUBLIC_ATTESTATION_ORIGIN,
          runtimeAddress: environment.GENLAYER_RUNTIME_ADDRESS,
          source: policyContractSource,
          submissionStore: managedAttestationSubmissionStore,
          workflowStore,
        }
      : null;

  async function recordManagedReceipt(
    tenantId: string,
    caseId: string,
    progress: ManagedAttestationProgress,
  ) {
    const submission = progress.submission;
    if (
      submission?.status !== "finalized" ||
      !submission.transactionHash ||
      !submission.verdict ||
      !publicAttestationCaseFileStore ||
      !attestationStore
    ) {
      return;
    }
    const publicId = new URL(submission.publicCaseFileUrl).pathname.split("/").at(-1);
    if (!publicId || !z.uuid().safeParse(publicId).success) return;
    const caseFile = await publicAttestationCaseFileStore.findForCase(
      tenantId,
      caseId,
      publicId,
      submission.publicCaseFileUrl,
    );
    if (!caseFile) return;
    verifyAdjudicationCaseFileIntegrity(caseFile.caseFile);
    await attestationStore.create(
      tenantId,
      caseId,
      "hollis-managed-runtime",
      caseFile.caseFile,
      submission.publicCaseFileUrl,
      {
        contractAddress: submission.contractAddress,
        provider: "genlayer",
        providerSubmissionId: submission.transactionHash,
        status: "finalized",
        transactionHash: submission.transactionHash,
        verdict: submission.verdict,
      },
    );
  }

  async function resolveCanonicalPolicy(
    tenantId: string,
    exported: NonNullable<Awaited<ReturnType<typeof workflowStore.exportCase>>>,
  ) {
    if (!exported.case.policyId) {
      throw new AttestationPreconditionError("The completed case has no published policy binding.");
    }
    const policy = await policyLibraryStore.findControl(
      tenantId,
      exported.case.policyId,
      exported.case.policyVersion,
      exported.case.ruleId,
    );
    const control = policy?.controls.find((item) => item.controlId === exported.case.ruleId);
    if (!policy || !control) {
      throw new AttestationPreconditionError(
        "The completed case policy binding is unavailable for a canonical commitment.",
      );
    }
    return {
      control: {
        attestationCriterion: control.attestationCriterion,
        controlId: control.controlId,
        controlVersion: control.controlVersion,
        evidenceRequirement: control.evidenceRequirement,
        interpretation: control.interpretation,
        policyDocumentDigest: policy.documentDigest,
      },
      policyId: policy.policyId,
      policyVersion: policy.version,
    };
  }

  function requireExactPolicyBinding(input: unknown, canonical: unknown) {
    if (canonicalJson(input) !== canonicalJson(canonical)) {
      throw new AttestationPreconditionError(
        "The requested attestation policy does not match the published case binding.",
      );
    }
  }

  async function reconcileManagedAttestation(
    tenantId: string,
    caseId: string,
    actorId: string,
  ): Promise<ManagedAttestationProgress | null> {
    if (!managedAttestationDependencies) return null;
    const progress = await reconcileManagedAttestationForCase({
      actorId,
      caseId,
      dependencies: managedAttestationDependencies,
      tenantId,
    });
    await recordManagedReceipt(tenantId, caseId, progress);
    return progress;
  }
  const app = Fastify({
    bodyLimit: 262_144,
    logController: new LogController({ disableRequestLogging: true }),
    logger: environment.NODE_ENV !== "test",
    trustProxy: false,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    credentials: true,
    methods: ["DELETE", "GET", "PATCH", "POST", "PUT"],
    origin: environment.WEB_ORIGIN,
  });

  app.decorateRequest("principal", null);
  app.decorateRequest("tenant", null);
  app.addContentTypeParser(
    ["image/jpeg", "image/png", "image/webp"],
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );
  app.addContentTypeParser(
    [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/markdown",
      "text/plain",
    ],
    { bodyLimit: 5_242_880, parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  app.addHook("onResponse", (request, reply, done) => {
    if (reply.statusCode >= 400) {
      app.log.warn(
        {
          method: request.method,
          path: request.routeOptions.url ?? request.url,
          statusCode: reply.statusCode,
        },
        "request rejected",
      );
    }
    done();
  });

  const caseParamsSchema = z.object({ caseId: z.uuid() }).strict();
  const policyContractParamsSchema = z
    .object({ controlId: z.string().min(1).max(128), policyVersionId: z.uuid() })
    .strict();
  const attestationParamsSchema = z.object({ attestationId: z.uuid(), caseId: z.uuid() }).strict();
  const publicCaseFileParamsSchema = z.object({ publicCaseFileId: z.uuid() }).strict();
  const evidenceParamsSchema = z.object({ caseId: z.uuid(), evidenceId: z.uuid() }).strict();
  const legalHoldSchema = z.object({ active: z.boolean() }).strict();
  const identitySessionSchema = z.object({ identityToken: z.string().min(1) }).strict();
  const activateWorkspaceSchema = z.object({ tenantId: z.uuid() }).strict();
  const memberParamsSchema = z.object({ userId: z.uuid() }).strict();
  const invitationParamsSchema = z.object({ invitationId: z.uuid() }).strict();

  async function readUserProfile(userId: string) {
    const profile = await userProfileStore.get(userId);
    if (!profile) throw new InvalidAccessTokenError();

    let avatarUrl = profile.avatarUrl;
    if (profile.profileAvatarObjectName && profile.profileAvatarTenantId && evidenceStorage) {
      try {
        avatarUrl = await evidenceStorage.createDownloadUrl(
          profile.profileAvatarTenantId,
          profile.profileAvatarObjectName,
        );
      } catch (error) {
        app.log.warn(
          { errorName: error instanceof Error ? error.name : "unknown" },
          "profile avatar could not be resolved",
        );
      }
    }

    return {
      avatarUrl,
      bio: profile.bio,
      displayName: profile.displayName,
      email: profile.email,
      emailVerifiedAt: serializeProfileTimestamp(profile.emailVerifiedAt),
      hasUploadedAvatar: Boolean(profile.profileAvatarObjectName),
      jobTitle: profile.jobTitle,
      timeZone: profile.timeZone,
    };
  }

  async function deliverWelcomeEmail(input: {
    displayName: string | null;
    isNewUser: boolean;
    userId: string;
  }) {
    if (input.isNewUser) {
      try {
        await welcomeEmailDeliveryStore.recordNewUser(input.userId);
      } catch (error) {
        app.log.error(
          { errorName: error instanceof Error ? error.name : "unknown" },
          "welcome email delivery record failed",
        );
        return;
      }
    }

    if (!transactionalEmailService) return;

    let delivery: PendingWelcomeEmailDelivery | null;
    try {
      delivery = await welcomeEmailDeliveryStore.claimPending(input.userId);
    } catch (error) {
      app.log.error(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "welcome email delivery claim failed",
      );
      return;
    }
    if (!delivery) return;

    try {
      const result = await transactionalEmailService.sendWelcome({
        deliveryId: delivery.deliveryId,
        displayName: input.displayName,
        recipientEmail: delivery.recipientEmail,
        userId: input.userId,
      });
      await welcomeEmailDeliveryStore.markSent(delivery.deliveryId, result.providerMessageId);
    } catch (error) {
      app.log.error(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "welcome email delivery failed",
      );
      try {
        await welcomeEmailDeliveryStore.markFailed(delivery.deliveryId);
      } catch (recordError) {
        app.log.error(
          { errorName: recordError instanceof Error ? recordError.name : "unknown" },
          "welcome email failure record failed",
        );
      }
    }
  }

  if (databaseResource) {
    app.addHook("onClose", async () => databaseResource.client.end());
  }

  app.setErrorHandler((error, request, reply) => {
    if (
      error instanceof InvalidAccessTokenError ||
      error instanceof InsufficientPermissionError ||
      error instanceof TenantAccessError
    ) {
      app.log.warn({ securityError: error.name }, "request rejected by security policy");
    }

    if (sendSecurityError(error, reply)) {
      return;
    }

    if (error instanceof InvalidWebhookError) {
      return reply
        .code(401)
        .send({ code: "invalid_webhook", message: "Webhook authentication failed." });
    }

    if (error instanceof ReviewIntakeConflictError) {
      return reply.code(409).send({
        code: "intake_conflict",
        message: "The external reference already exists with different content.",
      });
    }

    if (error instanceof PolicyBindingError) {
      return reply.code(409).send({
        code: "policy_not_published",
        message: "The selected policy control is not published for this workspace.",
      });
    }

    if (error instanceof PolicyVersionConflictError) {
      return reply.code(409).send({
        code: "policy_version_conflict",
        message: "A different policy version already exists for this policy ID and version.",
      });
    }

    if (error instanceof PolicyContractDeploymentError) {
      return reply.code(409).send({ code: error.code, message: error.message });
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "FST_ERR_CTP_INVALID_JSON_BODY"
    ) {
      return reply
        .code(400)
        .send({ code: "invalid_request", message: "Request validation failed." });
    }

    if (error instanceof z.ZodError) {
      app.log.warn(
        {
          validationIssues: error.issues.map((issue) => ({
            code: issue.code,
            path: issue.path.join("."),
            ...(issue.code === "unrecognized_keys" ? { keys: issue.keys } : {}),
          })),
        },
        "request rejected by input validation",
      );
      return reply
        .code(400)
        .send({ code: "invalid_request", message: "Request validation failed." });
    }

    if (error instanceof ReviewCaseNotFoundError) {
      return reply
        .code(404)
        .send({ code: "review_case_not_found", message: "Review case not found." });
    }

    if (error instanceof ReviewCaseTransitionError) {
      return reply
        .code(409)
        .send({ code: "invalid_transition", message: "Review case transition is not allowed." });
    }

    if (
      error instanceof EvidenceVerificationError ||
      (error instanceof Error && error.name === "EvidenceVerificationError")
    ) {
      return reply.code(422).send({
        code: "evidence_verification_failed",
        message: "Evidence object does not match its declared metadata.",
      });
    }

    if (error instanceof OrganizationLogoError) {
      const messages = {
        logo_candidate_unavailable:
          "That logo option is no longer available. Find logo options again and choose one.",
        logo_discovery_failed: "Hollis could not safely retrieve a logo from this website.",
        logo_not_found: "No supported logo image was found on this website.",
        logo_website_requires_https: "Use an HTTPS organization website before finding a logo.",
      } as const;
      return reply.code(422).send({ code: error.code, message: messages[error.code] });
    }

    if (error instanceof ProfileAvatarError) {
      const messages = {
        avatar_invalid: "The selected image could not be verified.",
        avatar_too_large: "Profile images must be 192 KB or smaller.",
        avatar_unsupported: "Use a PNG, JPEG, or WebP profile image.",
      } as const;
      return reply.code(422).send({ code: error.code, message: messages[error.code] });
    }

    if (error instanceof PolicySourceError) {
      const messages = {
        policy_source_invalid: "The policy document could not be verified.",
        policy_source_too_large: "Policy documents must be 5 MB or smaller.",
        policy_source_unavailable: "The uploaded policy document is no longer available.",
        policy_source_unsupported: "Use a PDF, DOCX, TXT, or Markdown policy document.",
      } as const;
      return reply.code(error.code === "policy_source_unavailable" ? 409 : 422).send({
        code: error.code,
        message: messages[error.code],
      });
    }

    if (error instanceof AttestationPreconditionError) {
      return reply.code(409).send({ code: "attestation_not_ready", message: error.message });
    }

    if (error instanceof StudioDevAttestationVerificationError) {
      return reply.code(422).send({
        code: "attestation_verification_failed",
        message: "The finalized GenLayer attestation could not be verified for this case.",
      });
    }

    if (error instanceof WorkspaceProvisioningError) {
      app.log.error(
        { diagnostic: error.diagnostic, provisioningCode: error.code },
        "workspace provisioning failed",
      );
      return reply.code(502).send({
        code: error.code,
        message: "Workspace provisioning could not be completed.",
      });
    }

    const causedError =
      error instanceof Error &&
      typeof error.cause === "object" &&
      error.cause !== null &&
      "name" in error.cause
        ? error.cause
        : null;
    const diagnosticSource = causedError ?? error;
    const errorCode =
      typeof diagnosticSource === "object" &&
      diagnosticSource !== null &&
      "code" in diagnosticSource &&
      typeof diagnosticSource.code === "string"
        ? diagnosticSource.code
        : undefined;
    const databaseDiagnostic =
      typeof diagnosticSource === "object" && diagnosticSource !== null
        ? {
            constraint:
              "constraint" in diagnosticSource && typeof diagnosticSource.constraint === "string"
                ? diagnosticSource.constraint
                : undefined,
            routine:
              "routine" in diagnosticSource && typeof diagnosticSource.routine === "string"
                ? diagnosticSource.routine
                : undefined,
          }
        : undefined;
    app.log.error(
      {
        ...databaseDiagnostic,
        errorCode,
        errorCauseName:
          causedError && "name" in causedError && typeof causedError.name === "string"
            ? causedError.name
            : undefined,
        errorName: error instanceof Error ? error.name : "unknown",
        path: request.routeOptions.url ?? request.url,
      },
      "request failed",
    );
    return reply.code(500).send({ code: "internal_error", message: "Request failed." });
  });

  app.get("/health/live", async () => ({ status: "ok" }));

  app.post(
    "/v1/auth/sessions",
    { preHandler: rateLimit("sessionExchange") },
    async (request, reply) => {
      const input = identitySessionSchema.parse(request.body);
      let identity: VerifiedIdentityPlatformIdentity;
      try {
        identity = await identityPlatformTokenVerifier.verify(input.identityToken);
      } catch (error) {
        app.log.warn(
          { errorName: error instanceof Error ? error.name : "unknown" },
          "identity token verification failed",
        );
        throw error;
      }
      const sessionToken = createApplicationSessionToken();
      const expiresAt = new Date(
        Date.now() + environment.HOLLIS_SESSION_TTL_HOURS * 60 * 60 * 1000,
      );
      let session: StoredApplicationSession;
      try {
        session = await applicationSessionStore.establish({
          ...identity,
          expiresAt,
          tokenDigest: digestApplicationSessionToken(sessionToken),
        });
      } catch (error) {
        app.log.error(
          { errorName: error instanceof Error ? error.name : "unknown" },
          "application session establishment failed",
        );
        throw error;
      }
      await deliverWelcomeEmail({
        displayName: identity.displayName,
        isNewUser: session.isNewUser,
        userId: session.userId,
      });
      return reply.code(201).send({
        activeWorkspace: session.tenantId
          ? { id: session.tenantId, name: session.workspaceName, role: session.role }
          : null,
        expiresAt: expiresAt.toISOString(),
        sessionToken,
        userId: session.userId,
      });
    },
  );

  app.delete("/v1/auth/sessions/current", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    await applicationSessionStore.revoke(digestApplicationSessionToken(token));
    return reply.code(204).send();
  });

  app.get("/v1/auth/me", async (request) => {
    const principal = await unscopedAccessTokenVerifier.verify(
      readBearerToken(request.headers.authorization),
    );
    return {
      activeWorkspace: principal.activeWorkspace,
      sessionId: principal.sessionId,
      userId: principal.userId,
    };
  });

  app.post("/v1/auth/active-workspace", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    const input = activateWorkspaceSchema.parse(request.body);
    const session = await applicationSessionStore.activate(
      digestApplicationSessionToken(token),
      input.tenantId,
    );
    if (!session?.tenantId || !session.workspaceName || !session.role) {
      throw new InvalidAccessTokenError();
    }
    return reply.send({
      activeWorkspace: { id: session.tenantId, name: session.workspaceName, role: session.role },
      userId: session.userId,
    });
  });

  app.post(
    "/v1/workspaces",
    { preHandler: rateLimit("workspaceSetup") },
    async (request, reply) => {
      const principal = await unscopedAccessTokenVerifier.verify(
        readBearerToken(request.headers.authorization),
      );
      const input = createWorkspaceSchema.parse(request.body);
      const workspace = await workspaceProvisioner.create({
        name: input.name,
        userId: principal.userId,
      });
      const token = readBearerToken(request.headers.authorization);
      const session = await applicationSessionStore.activate(
        digestApplicationSessionToken(token),
        workspace.tenantId,
      );
      if (!session?.tenantId || !session.workspaceName || !session.role) {
        throw new WorkspaceProvisioningError("tenant_provisioning_failed", "session:activation");
      }
      return reply.code(201).send({
        activeWorkspace: { id: session.tenantId, name: session.workspaceName, role: session.role },
      });
    },
  );

  app.get("/v1/workspaces", async (request) => {
    const principal = await unscopedAccessTokenVerifier.verify(
      readBearerToken(request.headers.authorization),
    );
    return workspaceControlsStore.listUserWorkspaces(principal.userId);
  });

  app.post(
    "/v1/workspace-invitations/accept",
    { preHandler: rateLimit("workspaceSetup") },
    async (request, reply) => {
      const token = readBearerToken(request.headers.authorization);
      const principal = await unscopedAccessTokenVerifier.verify(token);
      const input = acceptInvitationSchema.parse(request.body);
      const accepted = await workspaceControlsStore.acceptInvitation(input.token, principal.userId);
      if (!accepted)
        return reply
          .code(404)
          .send({ code: "invitation_unavailable", message: "This invitation is unavailable." });
      const session = await applicationSessionStore.activate(
        digestApplicationSessionToken(token),
        accepted.tenantId,
      );
      if (!session?.tenantId || !session.workspaceName || !session.role)
        throw new InvalidAccessTokenError();
      return reply.send({
        activeWorkspace: { id: session.tenantId, name: session.workspaceName, role: session.role },
      });
    },
  );

  app.get("/v1/public/attestation-case-files/:publicCaseFileId", async (request, reply) => {
    if (!environment.PUBLIC_ATTESTATION_ORIGIN || !publicAttestationCaseFileStore) {
      return reply.code(404).send({ code: "not_found", message: "Not found." });
    }
    const { publicCaseFileId } = publicCaseFileParamsSchema.parse(request.params);
    const publicCaseFileUrl = publicAttestationCaseFileUrl(
      environment.PUBLIC_ATTESTATION_ORIGIN,
      publicCaseFileId,
    );
    const record = await publicAttestationCaseFileStore.findPublic(
      publicCaseFileId,
      publicCaseFileUrl,
    );
    if (!record) return reply.code(404).send({ code: "not_found", message: "Not found." });
    verifyAdjudicationCaseFileIntegrity(record.caseFile);

    return reply.header("cache-control", "no-store").type("application/json").send(record.caseFile);
  });

  app.post(
    "/v1/webhooks/claims",
    { preHandler: rateLimit("claimsWebhook") },
    async (request, reply) => {
      if (!environment.CLAIMS_WEBHOOK_SECRET) {
        throw new InvalidWebhookError();
      }

      const payload = claimsWebhookSchema.parse(request.body);
      verifyClaimsWebhook(
        payload,
        {
          idempotencyKey:
            typeof request.headers["idempotency-key"] === "string"
              ? request.headers["idempotency-key"]
              : undefined,
          signature:
            typeof request.headers["x-hollis-signature"] === "string"
              ? request.headers["x-hollis-signature"]
              : undefined,
          timestamp:
            typeof request.headers["x-hollis-timestamp"] === "string"
              ? request.headers["x-hollis-timestamp"]
              : undefined,
        },
        environment.CLAIMS_WEBHOOK_SECRET,
      );
      return reply.code(503).send({
        code: "claims_workspace_resolution_unconfigured",
        message: "Claims intake is not configured for public workspaces.",
      });
    },
  );

  app.get(
    "/v1/session",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver) },
    async (request) => {
      const { principal, tenant } = requireRequestContext(request);
      return {
        permissions: principal.permissions,
        role: principal.role,
        tenantId: tenant.id,
        userId: principal.userId,
      };
    },
  );

  app.get(
    "/v1/profile",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:read") },
    async (request) => {
      const { principal } = requireRequestContext(request);
      return readUserProfile(principal.userId);
    },
  );
  app.put(
    "/v1/profile",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:read") },
    async (request) => {
      const { principal } = requireRequestContext(request);
      await userProfileStore.update(principal.userId, updateUserProfileSchema.parse(request.body));
      return readUserProfile(principal.userId);
    },
  );
  app.put(
    "/v1/profile/avatar",
    {
      preHandler: [
        rateLimit("profileAvatar"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:read"),
      ],
    },
    async (request, reply) => {
      if (!evidenceStorage) {
        return reply.code(503).send({
          code: "media_storage_unconfigured",
          message: "Profile media storage is not configured.",
        });
      }
      const { principal, tenant } = requireRequestContext(request);
      if (!Buffer.isBuffer(request.body)) throw new ProfileAvatarError("avatar_invalid");
      const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0] ?? "";
      const avatar = createProfileAvatar(tenant.id, principal.userId, request.body, contentType);
      const existingProfile = await userProfileStore.get(principal.userId);
      if (!existingProfile) throw new InvalidAccessTokenError();
      const replacesExistingObject =
        existingProfile.profileAvatarObjectName === avatar.objectName &&
        existingProfile.profileAvatarTenantId === tenant.id;
      try {
        await evidenceStorage.put(
          tenant.id,
          avatar.objectName,
          request.body,
          avatar.mediaType,
          avatar.digest,
        );
        const prior = await userProfileStore.setAvatar(principal.userId, {
          ...avatar,
          tenantId: tenant.id,
        });
        if (
          prior?.previousObjectName &&
          prior.previousTenantId &&
          (prior.previousObjectName !== avatar.objectName || prior.previousTenantId !== tenant.id)
        ) {
          await evidenceStorage
            .delete(prior.previousTenantId, prior.previousObjectName)
            .catch((error) => {
              request.log.warn(
                { errorName: error instanceof Error ? error.name : "unknown" },
                "previous profile avatar could not be removed",
              );
            });
        }
      } catch (error) {
        if (!replacesExistingObject) {
          await evidenceStorage.delete(tenant.id, avatar.objectName).catch(() => undefined);
        }
        throw error;
      }
      return reply.code(201).send(await readUserProfile(principal.userId));
    },
  );
  app.delete(
    "/v1/profile/avatar",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:read") },
    async (request, reply) => {
      const { principal } = requireRequestContext(request);
      const prior = await userProfileStore.removeAvatar(principal.userId);
      if (prior?.previousObjectName && prior.previousTenantId && evidenceStorage) {
        await evidenceStorage
          .delete(prior.previousTenantId, prior.previousObjectName)
          .catch((error) => {
            request.log.warn(
              { errorName: error instanceof Error ? error.name : "unknown" },
              "profile avatar could not be removed",
            );
          });
      }
      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/workspace",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:read") },
    async (request) => {
      const { tenant } = requireRequestContext(request);
      const profile = await workspaceControlsStore.getProfile(tenant.id);
      if (!profile) return null;
      let logoUrl: string | null = null;
      if (profile.logoObjectName && evidenceStorage) {
        try {
          logoUrl = await evidenceStorage.createDownloadUrl(tenant.id, profile.logoObjectName);
        } catch (error) {
          request.log.warn(
            { errorName: error instanceof Error ? error.name : "unknown" },
            "workspace logo could not be resolved",
          );
        }
      }
      return { ...profile, logoUrl };
    },
  );
  app.put(
    "/v1/workspace",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request) => {
      const { principal, tenant } = requireRequestContext(request);
      return workspaceControlsStore.updateProfile(
        tenant.id,
        principal.userId,
        workspaceProfileSchema.parse(request.body),
      );
    },
  );
  app.post(
    "/v1/workspace/logo/discover",
    {
      preHandler: [
        rateLimit("logoDiscovery"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
      ],
    },
    async (request, reply) => {
      z.object({})
        .strict()
        .parse(request.body ?? {});
      if (!organizationLogoService)
        return reply.code(503).send({
          code: "media_storage_unconfigured",
          message: "Organization media storage is not configured.",
        });
      const { tenant } = requireRequestContext(request);
      const profile = await workspaceControlsStore.getProfile(tenant.id);
      if (!profile?.website)
        return reply.code(409).send({
          code: "workspace_website_required",
          message: "Save an HTTPS organization website before finding a logo.",
        });
      return { candidates: await organizationLogoService.discover(profile.website) };
    },
  );
  app.post(
    "/v1/workspace/logo",
    {
      preHandler: [
        rateLimit("logoDiscovery"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
      ],
    },
    async (request, reply) => {
      if (!organizationLogoService || !evidenceStorage)
        return reply.code(503).send({
          code: "media_storage_unconfigured",
          message: "Organization media storage is not configured.",
        });
      const input = z
        .object({ sourceUrl: z.string().url().max(2048) })
        .strict()
        .parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const profile = await workspaceControlsStore.getProfile(tenant.id);
      if (!profile?.website)
        return reply.code(409).send({
          code: "workspace_website_required",
          message: "Save an HTTPS organization website before finding a logo.",
        });
      const imported = await organizationLogoService.importSelected(
        tenant.id,
        profile.website,
        input.sourceUrl,
      );
      try {
        const updated = await workspaceControlsStore.setLogo(tenant.id, principal.userId, imported);
        if (!updated) throw new Error("Organization logo metadata was not stored.");
        if (profile.logoObjectName && profile.logoObjectName !== imported.objectName) {
          await evidenceStorage
            .delete(tenant.id, profile.logoObjectName)
            .catch((error: unknown) => {
              request.log.warn(
                { errorName: error instanceof Error ? error.name : "unknown" },
                "previous workspace logo could not be removed",
              );
            });
        }
        return reply.code(201).send(updated);
      } catch (error) {
        await evidenceStorage.delete(tenant.id, imported.objectName).catch(() => undefined);
        throw error;
      }
    },
  );
  app.delete(
    "/v1/workspace/logo",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request, reply) => {
      const { principal, tenant } = requireRequestContext(request);
      const objectName = await workspaceControlsStore.removeLogo(tenant.id, principal.userId);
      if (!objectName) return reply.code(204).send();
      if (evidenceStorage) {
        await evidenceStorage.delete(tenant.id, objectName).catch((error: unknown) => {
          request.log.warn(
            { errorName: error instanceof Error ? error.name : "unknown" },
            "workspace logo object could not be removed",
          );
        });
      }
      return reply.code(204).send();
    },
  );
  app.get(
    "/v1/workspace/members",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:read"),
    },
    async (request) => {
      const { principal, tenant } = requireRequestContext(request);
      const canManage = principal.permissions.includes("workspace:manage");
      const members = await workspaceControlsStore.listMembers(tenant.id, principal.userId);
      return members.map(({ userId, ...member }) => ({
        ...member,
        isCurrentUser: userId === principal.userId,
        userId: canManage ? userId : null,
      }));
    },
  );
  app.get(
    "/v1/workspace/search/reviewers",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request) => {
      const { q } = z
        .object({ q: z.string().trim().min(2).max(120) })
        .strict()
        .parse(request.query);
      const { tenant } = requireRequestContext(request);
      return workspaceControlsStore.searchMembers(tenant.id, q);
    },
  );
  app.patch(
    "/v1/workspace/members/:userId",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request) => {
      const { principal, tenant } = requireRequestContext(request);
      const { userId } = memberParamsSchema.parse(request.params);
      return workspaceControlsStore.changeMemberRole(
        tenant.id,
        principal.userId,
        userId,
        changeMemberRoleSchema.parse(request.body).role,
      );
    },
  );
  app.get(
    "/v1/workspace/invitations",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request) => {
      const { tenant } = requireRequestContext(request);
      return workspaceControlsStore.listInvitations(tenant.id);
    },
  );
  app.get(
    "/v1/workspace/audit-events",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request) => {
      const { tenant } = requireRequestContext(request);
      return workspaceControlsStore.listAuditEvents(tenant.id);
    },
  );
  app.post(
    "/v1/workspace/invitations",
    {
      preHandler: [
        rateLimit("invitation"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
      ],
    },
    async (request, reply) => {
      const { principal, tenant } = requireRequestContext(request);
      const input = createInvitationSchema.parse(request.body);
      if (principal.role === "administrator" && input.role === "administrator")
        return reply
          .code(403)
          .send({ code: "owner_required", message: "Only an owner may invite an administrator." });
      const token = createInvitationToken();
      const invitation = await workspaceControlsStore.createInvitation(
        tenant.id,
        principal.userId,
        { ...input, token },
      );
      return reply.code(201).send({ ...invitation, token });
    },
  );
  app.delete(
    "/v1/workspace/invitations/:invitationId",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request, reply) => {
      const { principal, tenant } = requireRequestContext(request);
      const { invitationId } = invitationParamsSchema.parse(request.params);
      const revoked = await workspaceControlsStore.revokeInvitation(
        tenant.id,
        principal.userId,
        invitationId,
      );
      if (!revoked)
        return reply
          .code(404)
          .send({ code: "invitation_unavailable", message: "This invitation is unavailable." });
      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/review-cases/:caseId/attestations",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request, reply) => {
      if (!attestationStore)
        return reply.code(503).send({
          code: "attestation_unconfigured",
          message: "Attestation storage is not configured.",
        });
      const { caseId } = caseParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      return attestationStore.list(tenant.id, caseId);
    },
  );

  app.get(
    "/v1/review-cases/:caseId/attestation-case-files",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request, reply) => {
      if (!environment.PUBLIC_ATTESTATION_ORIGIN || !publicAttestationCaseFileStore) {
        return reply.code(503).send({
          code: "attestation_publisher_unconfigured",
          message: "The public attestation case-file publisher is not configured.",
        });
      }
      const { caseId } = caseParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      const records = await publicAttestationCaseFileStore.list(
        tenant.id,
        caseId,
        environment.PUBLIC_ATTESTATION_ORIGIN,
      );
      for (const record of records) verifyAdjudicationCaseFileIntegrity(record.caseFile);
      return records;
    },
  );

  app.post(
    "/v1/review-cases/:caseId/attestations",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:attest") },
    async (request, reply) => {
      if (!dependencies.attestationProvider || !attestationStore)
        return reply.code(503).send({
          code: "attestation_unconfigured",
          message: "GenLayer attestation is not activated.",
        });
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = createAttestationRequestSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const exported = await workflowStore.exportCase(tenant.id, caseId);
      if (!exported) throw new ReviewCaseNotFoundError();
      const canonicalPolicy = await resolveCanonicalPolicy(tenant.id, exported);
      requireExactPolicyBinding(input.policy, canonicalPolicy);
      const caseFile = buildGenLayerAttestationRequest(
        exported,
        await evidenceMetadataStore.list(tenant.id, caseId),
        { ...input, policy: canonicalPolicy },
      );
      const receipt = await dependencies.attestationProvider.submit(caseFile);
      return reply
        .code(201)
        .send(
          await attestationStore.create(
            tenant.id,
            caseId,
            principal.userId,
            caseFile.caseFile,
            caseFile.publicCaseFileUrl,
            receipt,
          ),
        );
    },
  );

  app.post(
    "/v1/review-cases/:caseId/attestation-case-files",
    {
      preHandler: [
        rateLimit("attestation"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:attest"),
      ],
    },
    async (request, reply) => {
      if (!environment.PUBLIC_ATTESTATION_ORIGIN || !publicAttestationCaseFileStore) {
        return reply.code(503).send({
          code: "attestation_publisher_unconfigured",
          message: "The public attestation case-file publisher is not configured.",
        });
      }
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = createPublicAttestationCaseFileRequestSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const exported = await workflowStore.exportCase(tenant.id, caseId);
      if (!exported) throw new ReviewCaseNotFoundError();
      const canonicalPolicy = await resolveCanonicalPolicy(tenant.id, exported);
      requireExactPolicyBinding(input.policy, canonicalPolicy);
      const publicId = randomUUID();
      const publicCaseFileUrl = publicAttestationCaseFileUrl(
        environment.PUBLIC_ATTESTATION_ORIGIN,
        publicId,
      );
      const caseFile = buildAdjudicationCaseFile(
        exported,
        await evidenceMetadataStore.list(tenant.id, caseId),
        { policy: canonicalPolicy },
      );
      return reply
        .code(201)
        .send(
          await publicAttestationCaseFileStore.create(
            tenant.id,
            caseId,
            principal.userId,
            publicId,
            caseFile,
            publicCaseFileUrl,
          ),
        );
    },
  );

  app.post(
    "/v1/review-cases/:caseId/attestations/import",
    {
      preHandler: [
        rateLimit("attestation"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:attest"),
      ],
    },
    async (request, reply) => {
      if (!dependencies.finalizedAttestationImporter || !attestationStore) {
        return reply.code(503).send({
          code: "attestation_unconfigured",
          message: "Finalized GenLayer attestation import is not activated.",
        });
      }
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = importFinalizedAttestationRequestSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      if (!environment.PUBLIC_ATTESTATION_ORIGIN || !publicAttestationCaseFileStore) {
        return reply.code(503).send({
          code: "attestation_publisher_unconfigured",
          message: "The public attestation case-file publisher is not configured.",
        });
      }
      const publicCaseFileUrl = publicAttestationCaseFileUrl(
        environment.PUBLIC_ATTESTATION_ORIGIN,
        input.publicCaseFileId,
      );
      const publicCaseFile = await publicAttestationCaseFileStore.findForCase(
        tenant.id,
        caseId,
        input.publicCaseFileId,
        publicCaseFileUrl,
      );
      if (!publicCaseFile) {
        return reply.code(404).send({
          code: "public_attestation_case_file_not_found",
          message: "Public attestation case file not found.",
        });
      }
      verifyAdjudicationCaseFileIntegrity(publicCaseFile.caseFile);
      const receipt = await dependencies.finalizedAttestationImporter.importFinalized({
        caseFile: publicCaseFile.caseFile,
        publicCaseFileUrl: publicCaseFile.publicCaseFileUrl,
        transactionHash: input.transactionHash,
      });
      return reply
        .code(201)
        .send(
          await attestationStore.create(
            tenant.id,
            caseId,
            principal.userId,
            publicCaseFile.caseFile,
            publicCaseFile.publicCaseFileUrl,
            receipt,
          ),
        );
    },
  );

  app.post(
    "/v1/review-cases/:caseId/evidence/:evidenceId/verify",
    {
      preHandler: [
        rateLimit("evidenceUpload"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:create"),
      ],
    },
    async (request, reply) => {
      if (!evidenceStorage)
        return reply
          .code(503)
          .send({ code: "storage_unconfigured", message: "Evidence storage is not configured." });
      const { caseId, evidenceId } = evidenceParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      const { verifyEvidenceUpload } = await import("./evidence.js");
      const verified = await verifyEvidenceUpload(
        tenant.id,
        caseId,
        evidenceId,
        evidenceStorage,
        evidenceMetadataStore,
        principal.userId,
      );
      if (!verified)
        return reply.code(404).send({ code: "evidence_not_found", message: "Evidence not found." });
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/review-cases",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:create") },
    async (request, reply) => {
      const input = createReviewCaseSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      if (!input.policyId) {
        return reply.code(400).send({
          code: "policy_identity_required",
          message: "A published policy ID is required for a new review case.",
        });
      }
      assertPublishedCasePolicy(
        await policyLibraryStore.findControl(
          tenant.id,
          input.policyId,
          input.policyVersion,
          input.ruleId,
        ),
        input.policyId,
        input.policyVersion,
        input.ruleId,
      );
      const reviewCase = await createReviewIntake(
        input,
        { actorId: principal.userId, tenantId: tenant.id },
        reviewIntakeStore,
      );

      return reply.code(reviewCase.replayed ? 200 : 201).send(reviewCase);
    },
  );

  app.get(
    "/v1/policies",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request) => {
      const { tenant } = requireRequestContext(request);
      return policyLibraryStore.list(tenant.id);
    },
  );

  app.put(
    "/v1/policy-source",
    {
      preHandler: [
        rateLimit("policySource"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "policies:manage"),
      ],
    },
    async (request, reply) => {
      if (!evidenceStorage) {
        return reply.code(503).send({
          code: "policy_source_storage_unconfigured",
          message: "Policy document storage is not configured.",
        });
      }
      if (!Buffer.isBuffer(request.body)) throw new PolicySourceError("policy_source_invalid");
      const rawFileName = request.headers["x-hollis-policy-source-name"];
      const fileName = Array.isArray(rawFileName) ? rawFileName[0] : rawFileName;
      const mediaType = String(request.headers["content-type"] ?? "").split(";", 1)[0] ?? "";
      const source = createPolicySource({
        content: request.body,
        fileName: fileName ?? "",
        mediaType,
      });
      const { tenant } = requireRequestContext(request);
      await evidenceStorage.put(
        tenant.id,
        policySourceObjectName(tenant.id, source.digest),
        request.body,
        source.mediaType,
        source.digest,
      );
      return reply.code(201).send({
        digest: source.digest,
        fileName: source.fileName,
        mediaType: source.mediaType,
        sizeBytes: source.sizeBytes,
      });
    },
  );

  app.post(
    "/v1/policies",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "policies:manage"),
    },
    async (request, reply) => {
      const input = createPolicyVersionSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      if (!evidenceStorage) {
        return reply.code(503).send({
          code: "policy_source_storage_unconfigured",
          message: "Policy document storage is not configured.",
        });
      }
      await assertStoredPolicySource(tenant.id, input, evidenceStorage);
      const policy = await createPublishedPolicy(
        tenant.id,
        principal.userId,
        input,
        policyLibraryStore,
      );
      if (managedAttestationDependencies) {
        for (const control of policy.controls) {
          const record = await policyLibraryStore.findControlRecord(
            tenant.id,
            policy.id,
            control.controlId,
          );
          if (!record) continue;
          try {
            await beginPolicyContractDeployment({
              binding: record.binding,
              client: managedAttestationDependencies.deploymentClient,
              createdByUserId: principal.userId,
              policyControlRecordId: record.controlRecordId,
              runtimeAddress: managedAttestationDependencies.runtimeAddress,
              source: managedAttestationDependencies.source,
              sourceVersion: "v7",
              store: managedAttestationDependencies.deploymentStore,
              tenantId: tenant.id,
            });
          } catch (error) {
            app.log.error(
              {
                controlId: control.controlId,
                errorName: error instanceof Error ? error.name : "unknown",
              },
              "managed GenLayer deployment could not start after policy publication",
            );
          }
        }
      }
      return reply.code(201).send(policy);
    },
  );

  app.post(
    "/v1/policies/:policyVersionId/controls/:controlId/genlayer-deployment",
    {
      preHandler: [
        rateLimit("attestation"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "policies:manage"),
      ],
    },
    async (request, reply) => {
      if (
        !environment.GENLAYER_RUNTIME_ADDRESS ||
        !environment.GENLAYER_RUNTIME_PRIVATE_KEY ||
        !dependencies.policyContractDeploymentClient ||
        !policyContractDeploymentStore
      ) {
        return reply.code(503).send({
          code: "managed_genlayer_unconfigured",
          message: "The Hollis-managed GenLayer deployment runtime is not activated.",
        });
      }
      const { controlId, policyVersionId } = policyContractParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      const control = await policyLibraryStore.findControlRecord(
        tenant.id,
        policyVersionId,
        controlId,
      );
      if (!control) {
        return reply.code(404).send({
          code: "policy_control_not_found",
          message: "The published policy control was not found.",
        });
      }
      return reply.code(200).send(
        await ensurePolicyContractDeployment({
          binding: control.binding,
          client: dependencies.policyContractDeploymentClient,
          createdByUserId: principal.userId,
          policyControlRecordId: control.controlRecordId,
          runtimeAddress: environment.GENLAYER_RUNTIME_ADDRESS,
          source: policyContractSource,
          sourceVersion: "v7",
          store: policyContractDeploymentStore,
          tenantId: tenant.id,
        }),
      );
    },
  );

  app.get(
    "/v1/policies/:policyVersionId/controls/:controlId/genlayer-deployment",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "policies:manage"),
    },
    async (request, reply) => {
      if (!policyContractDeploymentStore)
        return reply.code(503).send({ code: "managed_genlayer_unconfigured" });
      const { controlId, policyVersionId } = policyContractParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      const control = await policyLibraryStore.findControlRecord(
        tenant.id,
        policyVersionId,
        controlId,
      );
      if (!control) return reply.code(404).send({ code: "policy_control_not_found" });
      const deployment = await policyContractDeploymentStore.findByPolicyControl(
        tenant.id,
        control.controlRecordId,
      );
      if (!deployment || !managedAttestationDependencies) return deployment;
      return reconcilePolicyContractDeployment({
        client: managedAttestationDependencies.deploymentClient,
        deployment,
        store: policyContractDeploymentStore,
        tenantId: tenant.id,
      });
    },
  );

  app.post(
    "/v1/review-cases/:caseId/evidence/:evidenceId/legal-hold",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:retain") },
    async (request, reply) => {
      const { caseId, evidenceId } = evidenceParamsSchema.parse(request.params);
      const { active } = legalHoldSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const updated = await legalHoldStore(tenant.id, caseId, evidenceId, active, principal.userId);
      if (!updated)
        return reply.code(404).send({ code: "evidence_not_found", message: "Evidence not found." });
      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/review-cases",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request) => {
      const query = z
        .object({ status: reviewCaseStatusSchema.optional() })
        .strict()
        .parse(request.query);
      const { tenant } = requireRequestContext(request);
      const queue = await workflowStore.list(tenant.id, query.status);
      return queue.map(toQueueResponse);
    },
  );

  app.get(
    "/v1/review-cases/:caseId/managed-attestation",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      if (!managedAttestationDependencies) {
        return { configured: false, deployment: null, submission: null };
      }
      const progress = await reconcileManagedAttestation(tenant.id, caseId, principal.userId);
      return { configured: true, ...progress };
    },
  );

  app.post(
    "/v1/review-cases/:caseId/attestations/:attestationId/refresh",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:attest") },
    async (request, reply) => {
      if (!dependencies.attestationProvider || !attestationStore)
        return reply.code(503).send({
          code: "attestation_unconfigured",
          message: "GenLayer attestation is not activated.",
        });
      const { attestationId, caseId } = attestationParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      const existing = (await attestationStore.list(tenant.id, caseId)).find(
        (attestation) => attestation.id === attestationId,
      );
      if (!existing) {
        return reply
          .code(404)
          .send({ code: "attestation_not_found", message: "Attestation not found." });
      }
      const receipt = await dependencies.attestationProvider.get(existing.providerSubmissionId);
      const updated = await attestationStore.update(tenant.id, caseId, attestationId, receipt);
      if (!updated) {
        return reply
          .code(404)
          .send({ code: "attestation_not_found", message: "Attestation not found." });
      }
      return updated;
    },
  );

  app.post(
    "/v1/review-cases/:caseId/evidence/uploads",
    {
      preHandler: [
        rateLimit("evidenceUpload"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:create"),
      ],
    },
    async (request, reply) => {
      if (!evidenceStorage)
        return reply
          .code(503)
          .send({ code: "storage_unconfigured", message: "Evidence storage is not configured." });
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = evidenceUploadSchema.parse(request.body);
      const { tenant } = requireRequestContext(request);
      const { createEvidenceUpload } = await import("./evidence.js");
      return reply
        .code(201)
        .send(
          await createEvidenceUpload(
            tenant.id,
            caseId,
            input,
            evidenceStorage,
            evidenceMetadataStore,
          ),
        );
    },
  );

  app.get(
    "/v1/review-cases/:caseId/evidence/:evidenceId/download",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request, reply) => {
      if (!evidenceStorage)
        return reply
          .code(503)
          .send({ code: "storage_unconfigured", message: "Evidence storage is not configured." });
      const { caseId, evidenceId } = evidenceParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      const { createEvidenceDownload } = await import("./evidence.js");
      const url = await createEvidenceDownload(
        tenant.id,
        caseId,
        evidenceId,
        evidenceStorage,
        evidenceMetadataStore,
      );
      if (!url)
        return reply.code(404).send({ code: "evidence_not_found", message: "Evidence not found." });
      return { downloadUrl: url };
    },
  );

  app.delete(
    "/v1/review-cases/:caseId/evidence/:evidenceId",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:create") },
    async (request, reply) => {
      const { caseId, evidenceId } = evidenceParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      const { removeEvidenceAttachment } = await import("./evidence.js");
      const removed = await removeEvidenceAttachment(
        tenant.id,
        caseId,
        evidenceId,
        principal.userId,
        evidenceMetadataStore,
      );
      if (!removed) return reply.code(404).send({ code: "evidence_not_found", message: "Evidence not found." });
      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/review-cases/:caseId",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      const reviewCase = await workflowStore.get(tenant.id, caseId);
      if (!reviewCase) {
        throw new ReviewCaseNotFoundError();
      }

      const assignedReviewer = reviewCase.assignedToUserId
        ? await workspaceControlsStore.getMemberIdentity(
            tenant.id,
            principal.userId,
            reviewCase.assignedToUserId,
          )
        : null;

      return toDetailResponse(reviewCase, assignedReviewer);
    },
  );

  app.get(
    "/v1/review-cases/:caseId/export",
    {
      preHandler: [
        rateLimit("export"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read"),
      ],
    },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      const exported = await workflowStore.exportCase(tenant.id, caseId);
      if (!exported) {
        throw new ReviewCaseNotFoundError();
      }
      if (
        exported.case.status !== "completed" ||
        !exported.case.policyId ||
        !exported.case.decisionOutcome
      ) {
        return toExportResponse(exported);
      }
      const canonicalPolicy = await resolveCanonicalPolicy(tenant.id, exported);
      const evidence = await evidenceMetadataStore.list(tenant.id, caseId);
      const canonical = buildCanonicalReviewMetadata(exported, evidence, canonicalPolicy);

      return toExportResponse({ ...exported, canonical });
    },
  );

  app.get(
    "/v1/review-cases/:caseId/export-identities",
    {
      preHandler: [
        rateLimit("exportIdentity"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read"),
      ],
    },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      const exported = await workflowStore.exportCase(tenant.id, caseId);
      if (!exported) {
        throw new ReviewCaseNotFoundError();
      }

      const actorIds = new Set(
        [
          exported.case.assignedToUserId,
          exported.case.decidedByUserId,
          exported.case.escalatedByUserId,
          ...exported.events.map((event) => event.actorId),
        ].filter((actorId): actorId is string => Boolean(actorId)),
      );
      const systemLabels = new Map([
        ["attestation-provider", "GenLayer attestation service"],
        ["retention-system", "Hollis retention service"],
      ]);
      const identities = await Promise.all(
        [...actorIds].map(async (actorId) => {
          const systemLabel = systemLabels.get(actorId);
          if (systemLabel) return { actorId, displayName: systemLabel };
          const identity = await workspaceControlsStore.getMemberIdentity(
            tenant.id,
            principal.userId,
            actorId,
          );
          const displayName = identity?.displayName?.trim();
          return displayName ? { actorId, displayName } : null;
        }),
      );

      return {
        identities: identities.filter(
          (identity): identity is ReviewExportIdentityLabels["identities"][number] =>
            identity !== null,
        ),
      } satisfies ReviewExportIdentityLabels;
    },
  );

  app.post(
    "/v1/review-cases/:caseId/claim",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:assign") },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      const result = await workflowStore.claim(tenant.id, principal.userId, caseId);
      return toWorkflowResponse(result);
    },
  );

  app.post(
    "/v1/review-cases/:caseId/escalate",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:escalate"),
    },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = escalateReviewCaseSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const result = await workflowStore.escalate(tenant.id, principal.userId, caseId, input);
      return toWorkflowResponse(result);
    },
  );

  app.post(
    "/v1/review-cases/:caseId/decision",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:decide") },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = decideReviewCaseSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const result = await workflowStore.decide(tenant.id, principal.userId, caseId, input);
      let managedAttestation: ManagedAttestationProgress | null = null;
      if (managedAttestationDependencies) {
        try {
          managedAttestation = await startManagedAttestationForCase({
            actorId: principal.userId,
            caseId,
            dependencies: managedAttestationDependencies,
            tenantId: tenant.id,
          });
          await recordManagedReceipt(tenant.id, caseId, managedAttestation);
        } catch (error) {
          app.log.error(
            {
              caseId,
              errorName: error instanceof Error ? error.name : "unknown",
              tenantId: tenant.id,
            },
            "managed GenLayer attestation initiation failed after the human decision",
          );
        }
      }
      return { ...toWorkflowResponse(result), managedAttestation };
    },
  );

  return app;
}

function publicAttestationCaseFileUrl(origin: string, publicId: string): string {
  return new URL(`/v1/public/attestation-case-files/${publicId}`, origin).toString();
}
