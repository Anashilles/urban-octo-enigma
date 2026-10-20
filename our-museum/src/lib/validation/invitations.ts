import { z } from "zod";

export const INVITE_EXPIRY_HOURS = [24, 72, 168, 720] as const;
export const INVITE_MAX_USES = [1, 5, 20, 50] as const;

export const createInvitationSchema = z.object({
  /** Never OWNER: ownership cannot be granted by invitation. */
  role: z.enum(["EDITOR", "VISITOR"]),
  expiresInHours: z.number().int().min(1).max(720).default(168),
  maxUses: z.number().int().min(1).max(50).default(1),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.email().optional()),
});
export type CreateInvitationInput = z.input<typeof createInvitationSchema>;

/** Invitation tokens are 32 random bytes, base64url encoded (43 chars). */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
