"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { authClient } from "@/lib/auth/client";
import { forgotSchema, resetSchema, safeNext, signInSchema, signUpSchema } from "./schemas";

type FormError = string | null;

function authErrorMessage(t: (k: MessageKey) => string, error: { code?: string; status?: number; message?: string }) {
  if (error.status === 429) return t("auth.errors.tooMany");
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return t("auth.errors.invalidCredentials");
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return t("auth.errors.emailTaken");
    case "EMAIL_NOT_VERIFIED":
      return t("auth.errors.emailNotVerified");
    case "PASSWORD_TOO_SHORT":
      return t("auth.errors.passwordShort");
    default:
      return t("common.somethingWrong");
  }
}

function FormAlert({ message }: { message: FormError }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel?: string }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
      {pending ? (pendingLabel ?? label) : label}
    </Button>
  );
}

/* Sign in ------------------------------------------------------------------ */
export function SignInForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [formError, setFormError] = useState<FormError>(null);
  const form = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  const errs = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signIn.email({ email: values.email, password: values.password });
    if (error) {
      setFormError(authErrorMessage(t, error));
      return;
    }
    router.push(next);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" data-testid="signin-form">
      <FormAlert message={formError} />
      <Field id="email" label={t("auth.email")} error={errs.email && t(errs.email.message as MessageKey)}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </Field>
      <Field id="password" label={t("auth.password")} error={errs.password && t(errs.password.message as MessageKey)}>
        <Input type="password" autoComplete="current-password" {...form.register("password")} />
      </Field>
      <div className="-mt-2 text-end">
        <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {t("auth.forgotPassword")}
        </Link>
      </div>
      <SubmitButton pending={form.formState.isSubmitting} label={t("common.signIn")} pendingLabel={t("auth.signingIn")} />
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.noAccount")}{" "}
        <Link href={`/signup${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-foreground underline underline-offset-4">
          {t("common.signUp")}
        </Link>
      </p>
    </form>
  );
}

/* Sign up ------------------------------------------------------------------ */
export function SignUpForm({ requireVerification }: { requireVerification: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [formError, setFormError] = useState<FormError>(null);
  const form = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: "", email: "", password: "", confirmPassword: "" },
  });
  const errs = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signUp.email({
      email: values.email,
      password: values.password,
      name: values.displayName,
      locale,
      callbackURL: "/dashboard?verified=1",
    });
    if (error) {
      setFormError(authErrorMessage(t, error));
      return;
    }
    if (requireVerification) {
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
      return;
    }
    router.push(next);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" data-testid="signup-form">
      <FormAlert message={formError} />
      <Field
        id="displayName"
        label={t("auth.displayName")}
        hint={t("auth.displayNameHint")}
        error={errs.displayName && t(errs.displayName.message as MessageKey)}
      >
        <Input autoComplete="nickname" maxLength={40} {...form.register("displayName")} />
      </Field>
      <Field id="email" label={t("auth.email")} error={errs.email && t(errs.email.message as MessageKey)}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </Field>
      <Field
        id="password"
        label={t("auth.password")}
        hint={t("auth.passwordHint")}
        error={errs.password && t(errs.password.message as MessageKey)}
      >
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field
        id="confirmPassword"
        label={t("auth.confirmPassword")}
        error={errs.confirmPassword && t(errs.confirmPassword.message as MessageKey)}
      >
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </Field>
      <SubmitButton
        pending={form.formState.isSubmitting}
        label={t("common.signUp")}
        pendingLabel={t("auth.creatingAccount")}
      />
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.haveAccount")}{" "}
        <Link href={`/login${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-foreground underline underline-offset-4">
          {t("common.signIn")}
        </Link>
      </p>
    </form>
  );
}

/* Forgot password ---------------------------------------------------------- */
export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<FormError>(null);
  const form = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  const errs = form.formState.errors;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setFormError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    // Always show the same confirmation so the form can't be used to probe for accounts.
    if (error && error.status === 429) {
      setFormError(t("auth.errors.tooMany"));
      return;
    }
    setSent(true);
  });

  if (sent) {
    return (
      <div role="status" className="flex gap-3 rounded-xl border border-sage/40 bg-sage/10 p-4 text-sm">
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
        {t("auth.resetSent")}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormAlert message={formError} />
      <Field id="email" label={t("auth.email")} error={errs.email && t(errs.email.message as MessageKey)}>
        <Input type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <SubmitButton pending={form.formState.isSubmitting} label={t("auth.sendResetLink")} />
    </form>
  );
}

/* Reset password ----------------------------------------------------------- */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<FormError>(token ? null : t("auth.invalidResetLink"));
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirmPassword: "" } });
  const errs = form.formState.errors;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!token) return;
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setFormError(error.status === 429 ? t("auth.errors.tooMany") : t("auth.invalidResetLink"));
      return;
    }
    setDone(true);
  });

  if (done) {
    return (
      <div className="grid gap-5">
        <div role="status" className="flex gap-3 rounded-xl border border-sage/40 bg-sage/10 p-4 text-sm">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
          {t("auth.passwordUpdated")}
        </div>
        <Button asChild size="lg">
          <Link href="/login">{t("common.signIn")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormAlert message={formError} />
      <Field id="password" label={t("auth.newPassword")} hint={t("auth.passwordHint")} error={errs.password && t(errs.password.message as MessageKey)}>
        <Input type="password" autoComplete="new-password" disabled={!token} {...form.register("password")} />
      </Field>
      <Field
        id="confirmPassword"
        label={t("auth.confirmPassword")}
        error={errs.confirmPassword && t(errs.confirmPassword.message as MessageKey)}
      >
        <Input type="password" autoComplete="new-password" disabled={!token} {...form.register("confirmPassword")} />
      </Field>
      <SubmitButton pending={form.formState.isSubmitting} label={t("auth.updatePassword")} />
    </form>
  );
}

/* Resend verification ------------------------------------------------------ */
export function ResendVerificationButton({ email }: { email: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        disabled={state === "pending" || state === "sent" || !email}
        onClick={async () => {
          setState("pending");
          const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/dashboard?verified=1" });
          setState(error ? "error" : "sent");
        }}
      >
        {state === "pending" && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        {t("auth.resendVerification")}
      </Button>
      <p role="status" className="text-sm text-muted-foreground">
        {state === "sent" ? t("auth.verificationSent") : state === "error" ? t("common.somethingWrong") : ""}
      </p>
    </div>
  );
}
