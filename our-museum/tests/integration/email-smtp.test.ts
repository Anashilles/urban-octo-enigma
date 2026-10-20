import { once } from "node:events";
import { simpleParser, type ParsedMail } from "mailparser";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, resetDatabase } from "../helpers/factories";

/**
 * Sends real emails through nodemailer (EMAIL_DRIVER=smtp) to an in-process
 * SMTP server that requires authentication, and checks what arrives.
 */
const smtp = vi.hoisted(() => {
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  process.env.EMAIL_DRIVER = "smtp";
  process.env.SMTP_URL = `smtp://museum:s3cret-pass@127.0.0.1:${port}`;
  process.env.EMAIL_FROM = "Our Museum <no-reply@museum.test>";
  process.env.ENABLE_DEV_OUTBOX = "false";
  return { port };
});

interface Received {
  from: string;
  to: string[];
  mail: ParsedMail;
}
const inbox: Received[] = [];
let server: SMTPServer;

async function nextMail(to: string): Promise<Received> {
  await vi.waitFor(() => expect(inbox.some((m) => m.to.includes(to))).toBe(true), { timeout: 10_000 });
  return inbox.find((m) => m.to.includes(to))!;
}

describe("email over SMTP", () => {
  beforeAll(async () => {
    server = new SMTPServer({
      disabledCommands: ["STARTTLS"],
      allowInsecureAuth: true, // plain TCP on localhost only
      onAuth(auth, _session, cb) {
        if (auth.username === "museum" && auth.password === "s3cret-pass") cb(null, { user: "museum" });
        else cb(new Error("Invalid username or password"));
      },
      onRcptTo(address, _session, cb) {
        if (address.address.startsWith("bounce@")) cb(Object.assign(new Error("Mailbox unavailable"), { responseCode: 550 }));
        else cb();
      },
      onData(stream, session, cb) {
        simpleParser(stream).then(
          (mail) => {
            inbox.push({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "", to: session.envelope.rcptTo.map((r) => r.address), mail });
            cb();
          },
          (error: Error) => cb(error),
        );
      },
    });
    server.listen(smtp.port, "127.0.0.1");
    await once(server.server, "listening");
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    inbox.length = 0;
    await resetDatabase();
  });

  it("delivers localized messages with text and HTML parts", async () => {
    const { sendEmail } = await import("@/lib/email");
    const { invitationEmail, verificationEmail } = await import("@/lib/email/templates");
    await sendEmail(verificationEmail({ email: "ada@example.com", name: "Ada", locale: "en" }, "http://localhost:3000/verify?token=abc"));
    const en = await nextMail("ada@example.com");
    expect(en.from).toBe("no-reply@museum.test");
    expect(en.mail.from?.text).toContain("Our Museum");
    expect(en.mail.text).toContain("http://localhost:3000/verify?token=abc");
    expect(en.mail.html).toContain('href="http://localhost:3000/verify?token=abc"');

    await sendEmail(
      invitationEmail({ to: "salma@example.com", inviterName: "ليلى", museumName: "متحفنا", url: "http://localhost:3000/invite/x", expiresAt: new Date(), locale: "ar" }),
    );
    const ar = await nextMail("salma@example.com");
    expect(ar.mail.subject).toContain("ليلى");
    expect(ar.mail.subject).toContain("متحفنا");
    expect(ar.mail.html).toContain('dir="rtl"');
    expect(ar.mail.text).toContain("http://localhost:3000/invite/x");
  });

  it("runs the whole password reset through email", async () => {
    const { auth } = await import("@/lib/auth/server");
    const user = await createUser("Rania", { email: "rania@example.com" });
    await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: "/reset-password" } });
    const mail = await nextMail("rania@example.com");
    const token = /reset-password\/([A-Za-z0-9_-]+)/.exec(mail.mail.text ?? "")?.[1];
    expect(token).toBeTruthy();
    await auth.api.resetPassword({ body: { token: token!, newPassword: "a brand new passphrase" } });
    const signedIn = await auth.api.signInEmail({ body: { email: user.email, password: "a brand new passphrase" } });
    expect(signedIn.user.email).toBe("rania@example.com");
  });

  it("cannot be used to inject headers or extra recipients", async () => {
    const { sendEmail } = await import("@/lib/email");
    const { invitationEmail } = await import("@/lib/email/templates");
    await sendEmail(
      invitationEmail({
        to: "friend@example.com",
        inviterName: "Eve\r\nBcc: victim@example.com",
        museumName: "M\nX-Injected: yes",
        url: "http://localhost:3000/invite/y",
        expiresAt: new Date(),
        locale: "en",
      }),
    );
    const got = await nextMail("friend@example.com");
    expect(got.to).toEqual(["friend@example.com"]);
    expect(got.mail.headers.has("bcc")).toBe(false);
    expect(got.mail.headers.has("x-injected")).toBe(false);
    expect(got.mail.subject).not.toMatch(/[\r\n]/);
  });

  it("keeps an invitation usable when its email bounces", async () => {
    const { createMuseum } = await import("@/services/museum-service");
    const { createInvitation } = await import("@/services/invitation-service");
    const owner = await createUser("Owner", { emailVerified: true });
    const museum = await createMuseum(owner, { name: "Ours", description: "", templateId: "minimal-white" }, "en");
    const result = await createInvitation(owner, museum.id, { role: "VISITOR", expiresInHours: 24, maxUses: 1, email: "bounce@example.com" }, "en");
    expect(result).toMatchObject({ emailed: false, emailFailed: true });
    expect(result.url).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  });
});
