import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale, negotiateLocale, type Locale } from "./config";
import { getMessages } from "./messages";
import { createTranslator, type Translator } from "./translate";

/** Locale for the current request: explicit cookie first, then Accept-Language. */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const h = await headers();
  return negotiateLocale(h.get("accept-language"));
}

export async function getT(): Promise<{ t: Translator; locale: Locale }> {
  const locale = await getLocale();
  return { t: createTranslator(locale, getMessages(locale), getMessages("en")), locale };
}

/** Translator for a known locale (e.g. a recipient's preference in an email). */
export function translatorFor(locale: Locale): Translator {
  return createTranslator(locale, getMessages(locale), getMessages("en"));
}
