import "server-only";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/browser";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";

// ── Config ────────────────────────────────────────────────────────────────────
function getRpConfig() {
  const origin = env.NEXTAUTH_URL ?? "https://localhost:3000";
  const url = new URL(origin);
  return {
    rpName: env.WEBAUTHN_RP_NAME ?? env.APP_NAME ?? "SaaS Blueprint",
    rpID: url.hostname,
    origin,
  };
}

// ── Challenge store (DB-backed via UserSecurity) ───────────────────────────────
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function storeChallenge(userId: string, challenge: string): Promise<void> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.userSecurity.upsert({
    where: { userId },
    create: {
      userId,
      webAuthnChallenge: challenge,
      webAuthnChallengeExpiresAt: expiresAt,
    },
    update: {
      webAuthnChallenge: challenge,
      webAuthnChallengeExpiresAt: expiresAt,
    },
  });
}

export async function getAndClearChallenge(userId: string): Promise<string | null> {
  const security = await prisma.userSecurity.findUnique({
    where: { userId },
    select: { webAuthnChallenge: true, webAuthnChallengeExpiresAt: true },
  });
  if (!security?.webAuthnChallenge) return null;
  if (security.webAuthnChallengeExpiresAt && security.webAuthnChallengeExpiresAt < new Date()) {
    return null; // expired
  }
  // Clear it immediately (one-time use)
  await prisma.userSecurity.update({
    where: { userId },
    data: { webAuthnChallenge: null, webAuthnChallengeExpiresAt: null },
  });
  return security.webAuthnChallenge;
}

// ── Registration ──────────────────────────────────────────────────────────────
export async function generatePasskeyRegistrationOptions(
  userId: string,
  userEmail: string,
  userName: string | null
) {
  const { rpName, rpID } = getRpConfig();

  const existingCredentials = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    userDisplayName: userName ?? userEmail,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  await storeChallenge(userId, options.challenge);
  return options;
}

export async function verifyPasskeyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  credentialName?: string
) {
  const { rpID, origin } = getRpConfig();

  const expectedChallenge = await getAndClearChallenge(userId);
  if (!expectedChallenge) throw new Error("Challenge expired or not found");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Registration verification failed");
  }

  const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
    verification.registrationInfo;

  // Save credential to DB
  await prisma.webAuthnCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: (credential.transports ?? []) as string[],
      name: credentialName ?? null,
      aaguid: aaguid ?? null,
    },
  });

  return verification;
}

// ── Authentication ────────────────────────────────────────────────────────────

// For authentication we need to store challenge without knowing userId upfront
// (user may not have entered email). We use a session-based approach with a
// temporary challenge stored server-side keyed by a random challengeId.
const authChallengeStore = new Map<
  string,
  { userId: string; challenge: string; expiresAt: number }
>();

// Cleanup old challenges periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of authChallengeStore.entries()) {
    if (value.expiresAt < now) authChallengeStore.delete(key);
  }
}, 60_000);

export async function generatePasskeyAuthenticationOptions(userId?: string) {
  const { rpID } = getRpConfig();

  let allowCredentials: { id: string; transports: AuthenticatorTransport[] }[] = [];

  if (userId) {
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });
    allowCredentials = credentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransport[],
    }));
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
  });

  // Store challenge keyed by challenge string itself (for discoverable credentials)
  const challengeKey = options.challenge;
  authChallengeStore.set(challengeKey, {
    userId: userId ?? "",
    challenge: options.challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });

  return { options, challengeKey };
}

export async function verifyPasskeyAuthentication(
  challengeKey: string,
  response: AuthenticationResponseJSON
) {
  const { rpID, origin } = getRpConfig();

  const stored = authChallengeStore.get(challengeKey);
  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error("Challenge expired or not found");
  }
  authChallengeStore.delete(challengeKey);

  // Find credential in DB by credentialId
  const credentialRecord = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
    include: { user: { select: { id: true, email: true, isPlatformBlocked: true } } },
  });

  if (!credentialRecord) throw new Error("Credential not found");
  if (credentialRecord.user.isPlatformBlocked) throw new Error("Account blocked");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: credentialRecord.credentialId,
      publicKey: new Uint8Array(credentialRecord.publicKey),
      counter: Number(credentialRecord.counter),
      transports: credentialRecord.transports as AuthenticatorTransport[],
    },
  });

  if (!verification.verified) throw new Error("Authentication verification failed");

  // Update counter and lastUsedAt
  await prisma.webAuthnCredential.update({
    where: { credentialId: response.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  });

  return { verification, user: credentialRecord.user };
}
