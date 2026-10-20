"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";
import { ApiError, api, errorKey } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";

interface Props {
  token: string;
  museumId: string;
  museumName: string;
  guestsAllowed: boolean;
  emailLocked: boolean;
  user: { displayName: string; isAnonymous: boolean } | null;
  alreadyMember: boolean;
}

export function InvitationActions({ token, museumId, museumName, guestsAllowed, emailLocked, user, alreadyMember }: Props) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<"join" | "guest" | null>(null);
  const [name, setName] = useState("");
  const next = encodeURIComponent(`/invite/${token}`);

  const message = (e: unknown) => (e instanceof ApiError && (e.code === "FORBIDDEN" || e.code === "GONE" || e.code === "CONFLICT") ? e.message : t(errorKey(e)));

  const accept = async () => {
    await api(`/api/invitations/${token}/accept`, { method: "POST" });
    toast.success(t("invite.joined", { museum: museumName }));
    router.push(`/museum/${museumId}`);
    router.refresh();
  };

  if (alreadyMember) {
    return (
      <Button asChild size="lg" variant="gold" data-testid="invitation-enter">
        <Link href={`/museum/${museumId}`}>{t("invite.enter")}</Link>
      </Button>
    );
  }

  if (user && !(user.isAnonymous && (emailLocked || !guestsAllowed))) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t("invite.signedInAs", { name: user.displayName })}</p>
        {emailLocked && <p className="text-sm text-muted-foreground">{t("invite.emailLocked")}</p>}
        <Button
          size="lg"
          variant="gold"
          disabled={busy !== null}
          data-testid="invitation-accept"
          onClick={async () => {
            setBusy("join");
            try {
              await accept();
            } catch (e) {
              toast.error(message(e));
              setBusy(null);
            }
          }}
        >
          {busy && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          {busy ? t("invite.joining") : t("invite.accept")}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {emailLocked && <p className="rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm">{t("invite.emailLocked")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild size="lg" data-testid="invitation-sign-in">
          <Link href={`/login?next=${next}`}>{t("invite.signInToAccept")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={`/signup?next=${next}`}>{t("invite.createAccount")}</Link>
        </Button>
      </div>
      {guestsAllowed && !emailLocked && (
        <form
          className="grid gap-3 border-t border-border pt-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const displayName = name.trim();
            if (!displayName) return;
            setBusy("guest");
            try {
              if (!user) {
                const res = await authClient.signIn.anonymous();
                if (res.error) throw new ApiError("UNAUTHENTICATED", res.error.message ?? "", res.error.status ?? 401);
              }
              await api("/api/me", { method: "PATCH", body: { displayName } });
              await accept();
            } catch (err) {
              toast.error(message(err));
              setBusy(null);
            }
          }}
        >
          <p className="text-eyebrow text-muted-foreground">{t("invite.orGuest")}</p>
          <div className="grid gap-2">
            <Label htmlFor="guest-name">{t("invite.guestName")}</Label>
            <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoComplete="nickname" data-testid="guest-name" />
            <p className="text-xs text-muted-foreground">{t("invite.guestNameHint")}</p>
          </div>
          <Button type="submit" variant="outline" size="lg" disabled={busy !== null || !name.trim()} data-testid="guest-join">
            {busy === "guest" && <Loader2Icon className="animate-spin" aria-hidden="true" />}
            {t("invite.guestJoin")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("invite.guestNote")}</p>
        </form>
      )}
    </div>
  );
}
