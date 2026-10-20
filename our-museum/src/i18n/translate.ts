import type { Messages } from "./messages/en";
import type { Locale } from "./config";

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;

/** Dot-separated paths to every string leaf in the message tree. */
export type MessageKey<T = Messages> = {
  [K in keyof T & string]: T[K] extends string ? K : Join<K, MessageKey<T[K]>>;
}[keyof T & string];

export type TranslateValues = Record<string, string | number>;
export type Translator = (key: MessageKey, values?: TranslateValues) => string;

function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Creates a translator. Supports `{name}` interpolation and a tiny plural form:
 * `{count, plural, one {# photo} other {# photos}}`.
 */
export function createTranslator(locale: Locale, messages: Messages, fallback?: Messages): Translator {
  const pluralRules = new Intl.PluralRules(locale);
  const numberFormat = new Intl.NumberFormat(locale);
  return (key, values) => {
    const template = lookup(messages, key) ?? (fallback ? lookup(fallback, key) : undefined) ?? key;
    if (!values) return template;
    const withPlurals = template.replace(
      /\{(\w+), plural, ((?:=?\w+ \{[^}]*\}\s*)+)\}/g,
      (_m, name: string, body: string) => {
        const n = Number(values[name] ?? 0);
        const forms: Record<string, string> = {};
        for (const match of body.matchAll(/(=?\w+) \{([^}]*)\}/g)) forms[match[1]!] = match[2]!;
        const exact = forms[`=${n}`];
        const form = exact ?? forms[pluralRules.select(n)] ?? forms.other ?? "";
        return form.replace(/#/g, numberFormat.format(n));
      },
    );
    return withPlurals.replace(/\{(\w+)\}/g, (_m, name: string) => {
      const v = values[name];
      if (v === undefined) return `{${name}}`;
      return typeof v === "number" ? numberFormat.format(v) : v;
    });
  };
}
