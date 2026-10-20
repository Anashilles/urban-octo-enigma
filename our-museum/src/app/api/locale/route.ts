import { z } from "zod";
import { apiHandler, json, parseJson } from "@/lib/api/handler";
import { getUserFromHeaders } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { LOCALE_COOKIE, locales } from "@/i18n/config";

const bodySchema = z.object({ locale: z.enum(locales) });

/** Switches the interface language (cookie) and remembers it on the account for emails. */
export const POST = apiHandler(async (req) => {
  const { locale } = await parseJson(req, bodySchema);
  const user = await getUserFromHeaders(req.headers);
  if (user) await prisma.user.update({ where: { id: user.id }, data: { locale } });
  const res = json({ locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
});
