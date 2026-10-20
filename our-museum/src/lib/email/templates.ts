import "server-only";
import { isLocale, type Locale } from "@/i18n/config";
import { translatorFor } from "@/i18n/server";
import type { EmailMessage } from "./index";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(locale: Locale, paragraphs: string[], link: string, footer: string[]) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const foot = footer.map((p) => `<p style="margin:0 0 8px;color:#77736B;font-size:13px">${escapeHtml(p)}</p>`).join("");
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="margin:0;background:#F5F2EC;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#242321">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #EAE5DC;border-radius:12px;padding:32px">
<p style="margin:0 0 24px;letter-spacing:.2em;text-transform:uppercase;font-size:12px;color:#C6A66A">Our Museum</p>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#242321;color:#F5F2EC;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px">${escapeHtml(link.length > 60 ? link.slice(0, 57) + "…" : link)}</a></p>
${foot}
</div></body></html>`;
}

function localeOf(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

export function verificationEmail(user: { email: string; name: string; locale?: unknown }, url: string): EmailMessage {
  const locale = localeOf(user.locale);
  const t = translatorFor(locale);
  const lines = [t("emails.greeting", { name: user.name }), t("emails.verifyBody")];
  return {
    kind: "verify-email",
    to: user.email,
    subject: t("emails.verifySubject"),
    text: `${lines.join("\n\n")}\n\n${url}\n\n${t("emails.signature")}`,
    html: layout(locale, lines, url, [t("emails.signature")]),
    link: url,
  };
}

export function resetPasswordEmail(user: { email: string; name: string; locale?: unknown }, url: string): EmailMessage {
  const locale = localeOf(user.locale);
  const t = translatorFor(locale);
  const lines = [t("emails.greeting", { name: user.name }), t("emails.resetBody")];
  return {
    kind: "reset-password",
    to: user.email,
    subject: t("emails.resetSubject"),
    text: `${lines.join("\n\n")}\n\n${url}\n\n${t("emails.resetIgnore")}\n${t("emails.signature")}`,
    html: layout(locale, lines, url, [t("emails.resetIgnore"), t("emails.signature")]),
    link: url,
  };
}

export function invitationEmail(input: {
  to: string;
  inviterName: string;
  museumName: string;
  url: string;
  expiresAt: Date;
  locale: Locale;
}): EmailMessage {
  const t = translatorFor(input.locale);
  const date = new Intl.DateTimeFormat(input.locale, { dateStyle: "long", timeStyle: "short" }).format(input.expiresAt);
  const lines = [t("emails.inviteBody", { name: input.inviterName }), t("emails.inviteCta")];
  return {
    kind: "invitation",
    to: input.to,
    subject: t("emails.inviteSubject", { name: input.inviterName, museum: input.museumName }),
    text: `${lines.join("\n\n")}\n\n${input.url}\n\n${t("emails.inviteExpiry", { date })}\n${t("emails.signature")}`,
    html: layout(input.locale, lines, input.url, [t("emails.inviteExpiry", { date }), t("emails.signature")]),
    link: input.url,
  };
}
