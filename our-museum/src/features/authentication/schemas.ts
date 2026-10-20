import { z } from "zod";

/** Client-side form schemas; error messages are translation keys. */
export const signInSchema = z.object({
  email: z.email("auth.errors.emailInvalid"),
  password: z.string().min(1, "auth.errors.passwordShort"),
});

export const signUpSchema = z
  .object({
    displayName: z.string().trim().min(1, "auth.errors.nameRequired").max(40),
    email: z.email("auth.errors.emailInvalid"),
    password: z.string().min(8, "auth.errors.passwordShort").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "auth.errors.passwordMismatch",
  });

export const forgotSchema = z.object({ email: z.email("auth.errors.emailInvalid") });

export const resetSchema = z
  .object({
    password: z.string().min(8, "auth.errors.passwordShort").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "auth.errors.passwordMismatch",
  });

/** Only same-site relative paths are accepted as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
