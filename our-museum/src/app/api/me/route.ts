import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { locales } from "@/i18n/config";

const preferencesSchema = z
  .object({
    onboardingDismissed: z.boolean().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(40).optional(),
    locale: z.enum(locales).optional(),
    preferences: preferencesSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const GET = apiHandler(async (req) => {
  const user = await requireApiUser(req.headers);
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
  return json({ user: { ...user, preferences: row?.preferences ?? {} } });
});

export const PATCH = apiHandler(async (req) => {
  const user = await requireApiUser(req.headers);
  const patch = await parseJson(req, patchSchema);
  const current = await prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
  const preferences = patch.preferences
    ? ({ ...((current?.preferences as Record<string, unknown>) ?? {}), ...patch.preferences } as Prisma.InputJsonValue)
    : undefined;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(patch.displayName ? { displayName: patch.displayName } : {}),
      ...(patch.locale ? { locale: patch.locale } : {}),
      ...(preferences ? { preferences } : {}),
    },
  });
  return json({ ok: true });
});
