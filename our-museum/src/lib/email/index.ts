import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Machine-readable kind, used by the dev outbox for tests. */
  kind: "verify-email" | "reset-password" | "invitation" | "delete-account";
  /** The action link contained in the email. */
  link?: string;
}

export interface OutboxEntry extends EmailMessage {
  id: number;
  sentAt: string;
}

const g = globalThis as unknown as { __ourMuseumOutbox?: OutboxEntry[]; __ourMuseumOutboxSeq?: number };

function outbox(): OutboxEntry[] {
  g.__ourMuseumOutbox ??= [];
  return g.__ourMuseumOutbox;
}

/** Development-only inbox (ENABLE_DEV_OUTBOX=true). Never enabled in production. */
export function readDevOutbox(to?: string): OutboxEntry[] {
  if (!env().ENABLE_DEV_OUTBOX) return [];
  const all = outbox();
  return to ? all.filter((m) => m.to.toLowerCase() === to.toLowerCase()) : all;
}

let transporter: { sendMail: (opts: Record<string, unknown>) => Promise<unknown> } | null = null;

async function smtpTransport() {
  if (transporter) return transporter;
  const url = env().SMTP_URL;
  if (!url) throw new Error("SMTP_URL is required when EMAIL_DRIVER=smtp");
  const nodemailer = await import("nodemailer");
  transporter = nodemailer.createTransport(url);
  return transporter;
}

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${(user ?? "").slice(0, 2)}***@${domain ?? ""}`;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const e = env();
  if (e.ENABLE_DEV_OUTBOX) {
    g.__ourMuseumOutboxSeq = (g.__ourMuseumOutboxSeq ?? 0) + 1;
    const list = outbox();
    list.push({ ...message, id: g.__ourMuseumOutboxSeq, sentAt: new Date().toISOString() });
    if (list.length > 200) list.splice(0, list.length - 200);
  }
  if (e.EMAIL_DRIVER === "console") {
    // Development: print the link so it can be followed manually.
    logger.info("email_console_delivery", { kind: message.kind, to: maskEmail(message.to), subject: message.subject });
    if (e.NODE_ENV !== "production" && message.link) console.log(`\n✉️  ${message.subject}\n   ${message.link}\n`);
    return;
  }
  const transport = await smtpTransport();
  await transport.sendMail({
    from: e.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  logger.info("email_sent", { kind: message.kind, to: maskEmail(message.to) });
}
