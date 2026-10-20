"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/client";
import { localeNames, locales, type Locale } from "@/i18n/config";
import { api, errorKey } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";

export function AccountSettings({
  user,
}: {
  user: { displayName: string; email: string; emailVerified: boolean; isAnonymous: boolean; locale: Locale };
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(user.displayName);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const saveProfile = () =>
    startSaving(async () => {
      setSaved(false);
      try {
        await api("/api/me", { method: "PATCH", body: { displayName: name } });
        setSaved(true);
        router.refresh();
      } catch (e) {
        toast.error(t(errorKey(e)));
      }
    });

  const changeLanguage = (locale: Locale) =>
    startSaving(async () => {
      await api("/api/locale", { method: "POST", body: { locale } }).catch(() => undefined);
      router.refresh();
    });

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    const result = user.isAnonymous ? await authClient.deleteAnonymousUser() : await authClient.deleteUser({ password });
    if (result.error) {
      setDeleting(false);
      setDeleteError(result.error.code === "INVALID_PASSWORD" ? t("auth.errors.invalidCredentials") : t("common.somethingWrong"));
      return;
    }
    toast.success(t("account.deleted"));
    router.push("/");
    router.refresh();
  };

  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("account.profile")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:max-w-md">
          <Field id="displayName" label={t("account.displayName")} hint={t("auth.displayNameHint")}>
            <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          {!user.isAnonymous && (
            <div className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("account.email")}</span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {user.email}
                <Badge variant={user.emailVerified ? "sage" : "outline"}>{user.emailVerified ? t("account.emailVerified") : t("account.emailUnverified")}</Badge>
              </span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={saveProfile} disabled={saving || !name.trim() || name.trim() === user.displayName} data-testid="save-profile">
              {saving && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              {t("account.saveProfile")}
            </Button>
            {saved && (
              <span role="status" className="flex items-center gap-1 text-sm text-sage">
                <CheckIcon className="size-4" aria-hidden="true" /> {t("account.saved")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("account.language")}</CardTitle>
          <CardDescription>{t("account.languageHint")}</CardDescription>
        </CardHeader>
        <CardContent className="sm:max-w-xs">
          <Select defaultValue={user.locale} onValueChange={(v) => changeLanguage(v as Locale)}>
            <SelectTrigger aria-label={t("account.language")} data-testid="settings-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((l) => (
                <SelectItem key={l} value={l}>
                  {localeNames[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("account.privacyTitle")}</CardTitle>
          <CardDescription>{t("account.privacyBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/privacy" className="text-sm font-medium underline underline-offset-4">
            {t("account.readPrivacy")}
          </Link>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlertIcon className="size-5" aria-hidden="true" />
            {user.isAnonymous ? t("account.guestTitle") : t("account.dangerTitle")}
          </CardTitle>
          <CardDescription>{user.isAnonymous ? t("account.guestBody") : t("account.dangerBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" data-testid="delete-account">
                {t("account.deleteButton")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("account.confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("account.confirmBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid gap-4">
                <Field id="confirm-delete" label={t("account.typeDelete")}>
                  <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
                </Field>
                {!user.isAnonymous && (
                  <Field id="confirm-password" label={t("account.confirmPassword")} error={deleteError ?? undefined}>
                    <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </Field>
                )}
                {user.isAnonymous && deleteError && (
                  <p role="alert" className="text-sm text-destructive">
                    {deleteError}
                  </p>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={confirmText !== "DELETE" || (!user.isAnonymous && !password) || deleting}
                  onClick={deleteAccount}
                  data-testid="confirm-delete-account"
                >
                  {deleting && <Loader2Icon className="animate-spin" aria-hidden="true" />}
                  {deleting ? t("account.deleting") : t("account.confirmDelete")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
