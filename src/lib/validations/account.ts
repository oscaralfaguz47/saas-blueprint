import { z } from "zod";

/** L1 My Account: profile patch (name, phone, timezone). */
export const profilePatchSchema = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  phone: z.string().max(30).trim().optional().nullable(),
  timezone: z.string().max(64).trim().optional().nullable(),
});

/** L1: appearance mode. */
export const appearanceModeSchema = z.enum(["LIGHT", "DARK", "SYSTEM"]);
export const appearancePatchSchema = z.object({
  mode: appearanceModeSchema,
});

/** L1: profile photo upload URL request. Client sends compressed image size/type (max 10MB). */
export const photoUploadUrlSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  contentLength: z
    .number()
    .int()
    .min(1, "File is empty or invalid.")
    .max(10 * 1024 * 1024), // 10MB max for profile photo
  extension: z.enum(["png", "jpeg", "jpg", "webp"]),
});

/** L1: confirm profile photo upload. */
export const photoConfirmSchema = z.object({
  objectKey: z.string().min(1).max(512),
});

/** L1: 6-digit TOTP or backup code. */
export const twoFaCodeSchema = z.object({
  code: z.string().length(6).regex(/^[0-9]+$/, "Must be 6 digits"),
});

/** L1: optional backup code (8 chars) for 2FA. */
export const twoFaVerifySchema = z.object({
  code: z.string().min(6).max(10).trim(),
});

/** Security 2FA/sessions: login MFA verify with optional remember device. */
export const auth2FaVerifySchema = twoFaVerifySchema.extend({
  rememberDevice: z.boolean().optional(),
  rememberDays: z.enum(["30", "60", "90"]).optional(),
});

/** L1: auto-logout toggle and duration (minutes). When enabled, minutes is required. */
export const AUTO_LOGOUT_MINUTES_OPTIONS = [15, 30, 60, 300, 480] as const; // 15m, 30m, 1h, 5h, 8h
export const autoLogoutPatchSchema = z
  .object({
    enabled: z.boolean(),
    minutes: z
      .number()
      .int()
      .refine((n) => [15, 30, 60, 300, 480].includes(n), "Select 15 minutes, 30 minutes, 1 hour, 5 hours, or 8 hours.")
      .optional(),
  })
  .refine((data) => !data.enabled || (data.minutes !== undefined && data.minutes !== null), {
    message: "Select an inactivity time when enabling auto-logout.",
    path: ["minutes"],
  });
