"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, Link2Icon, Loader2Icon, MailIcon, Share2Icon, UserMinusIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/client";
import { api } from "@/lib/api/client";
import { INVITE_EXPIRY_HOURS, INVITE_MAX_USES } from "@/lib/validation/invitations";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";

interface Member {
  userId: string;
  displayName: string;
  isGuest: boolean;
  role: "OWNER" | "EDITOR" | "VISITOR";
  joinedAt: string;
}

interface Invitation {
  id: string;
  role: "EDITOR" | "VISITOR";
  email: string | null;
  expiresAt: string;
  maxUses: number;
  uses: number;
  createdAt: string;
  status: "active" | "expired" | "revoked" | "used";
}

export function PeopleTab() {
  const { t, formatDate, formatRelative } = useI18n();
  const { scene, museumId, errorText } = useEditor();
  const canInvite = scene.viewer.permissions["invitation.manage"];
  const canManage = scene.viewer.permissions["member.remove"];
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);

  // Bumped after every change to refetch the lists.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<{ members: Member[] }>(`/api/museums/${museumId}/members`),
      canInvite ? api<{ invitations: Invitation[] }>(`/api/museums/${museumId}/invitations`) : Promise.resolve({ invitations: [] }),
    ])
      .then(([m, i]) => {
        if (!alive) return;
        setMembers(m.members);
        setInvitations(i.invitations);
      })
      .catch((e) => alive && toast.error(errorText(e)));
    return () => {
      alive = false;
    };
  }, [museumId, canInvite, errorText, version]);

  useEffect(() => {
    if (!canInvite) return;
    let alive = true;
    api<{ user: { emailVerified: boolean; isAnonymous: boolean } }>("/api/me")
      .then((r) => alive && setEmailVerified(r.user.emailVerified && !r.user.isAnonymous))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [canInvite]);

  const changeRole = async (userId: string, role: "EDITOR" | "VISITOR") => {
    try {
      await api(`/api/museums/${museumId}/members/${userId}`, { method: "PATCH", body: { role } });
      toast.success(t("editor.people.roleChanged"));
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const remove = async (userId: string) => {
    try {
      await api(`/api/museums/${museumId}/members/${userId}`, { method: "DELETE" });
      toast.success(t("editor.people.removed"));
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const revoke = async (id: string) => {
    try {
      await api(`/api/museums/${museumId}/invitations/${id}`, { method: "DELETE" });
      toast.success(t("editor.people.revoked"));
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="grid max-w-4xl gap-6" data-testid="people-tab">
      {canInvite ? (
        <InviteCard museumId={museumId} emailVerified={emailVerified} onCreated={reload} />
      ) : (
        <p className="rounded-xl border border-dashed border-input p-5 text-sm text-muted-foreground">{t("editor.people.ownerOnly")}</p>
      )}

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle>{t("editor.people.invitations")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!invitations ? (
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("editor.people.noInvitations")}</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="invitation-list">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="invitation-row" data-status={inv.status}>
                    <span className="grid size-9 place-items-center rounded-full bg-muted">
                      {inv.email ? <MailIcon className="size-4" aria-hidden="true" /> : <Link2Icon className="size-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" dir={inv.email ? "ltr" : undefined}>
                        {inv.email ?? t(`common.roles.${inv.role}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.email && <>{t(`common.roles.${inv.role}`)} · </>}
                        {t("editor.people.usesCount", { uses: inv.uses, max: inv.maxUses })} · {t("editor.people.expiresOn", { time: formatDate(inv.expiresAt) })}
                      </p>
                    </div>
                    <Badge variant={inv.status === "active" ? "default" : "outline"}>{t(`editor.people.statuses.${inv.status}`)}</Badge>
                    {inv.status === "active" && (
                      <ConfirmButton
                        label={t("editor.people.revoke")}
                        title={t("editor.people.revokeTitle")}
                        body={t("editor.people.revokeBody")}
                        onConfirm={() => revoke(inv.id)}
                        testId="invitation-revoke"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("editor.people.members")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!members ? (
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <ul className="divide-y divide-border" data-testid="member-list">
              {members.map((m) => {
                const self = m.userId === scene.viewer.userId;
                const editable = canManage && m.role !== "OWNER" && !self;
                return (
                  <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3" data-testid="member-row">
                    <span className="grid size-9 place-items-center rounded-full bg-charcoal font-display text-ivory">{m.displayName.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m.displayName}
                        {self && <span className="text-muted-foreground"> ({t("editor.people.you")})</span>}
                        {m.isGuest && (
                          <Badge variant="outline" className="ms-2">
                            {t("editor.people.guest")}
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {t("editor.people.joined", { time: formatRelative(m.joinedAt) })}
                      </p>
                    </div>
                    {editable ? (
                      <Select value={m.role} onValueChange={(v) => void changeRole(m.userId, v as "EDITOR" | "VISITOR")}>
                        <SelectTrigger className="w-36" aria-label={t("editor.people.changeRole")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VISITOR">{t("common.roles.VISITOR")}</SelectItem>
                          <SelectItem value="EDITOR" disabled={m.isGuest}>
                            {t("common.roles.EDITOR")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{t(`common.roles.${m.role}`)}</Badge>
                    )}
                    {editable && (
                      <ConfirmButton
                        label={t("editor.people.remove")}
                        title={t("editor.people.removeTitle", { name: m.displayName })}
                        body={t("editor.people.removeBody")}
                        onConfirm={() => remove(m.userId)}
                        icon={<UserMinusIcon aria-hidden="true" />}
                        testId="member-remove"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConfirmButton({ label, title, body, onConfirm, icon, testId }: { label: string; title: string; body: string; onConfirm: () => Promise<void>; icon?: React.ReactNode; testId?: string }) {
  const { t } = useI18n();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" data-testid={testId}>
          {icon}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()} data-testid={testId ? `${testId}-confirm` : undefined}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InviteCard({ museumId, emailVerified, onCreated }: { museumId: string; emailVerified: boolean; onCreated: () => void }) {
  const { t } = useI18n();
  const { errorText } = useEditor();
  const [role, setRole] = useState<"EDITOR" | "VISITOR">("VISITOR");
  const [hours, setHours] = useState<number>(168);
  const [uses, setUses] = useState<number>(1);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    setLink(null);
    try {
      const res = await api<{ url: string; emailed: boolean; emailFailed?: boolean }>(`/api/museums/${museumId}/invitations`, {
        method: "POST",
        body: { role, expiresInHours: hours, maxUses: uses, email: email.trim() || undefined },
      });
      setLink(res.url);
      setCopied(false);
      if (res.emailed) toast.success(t("editor.people.emailed", { email: email.trim() }));
      if (res.emailFailed) toast.warning(t("editor.people.emailFailed"), { duration: 10_000 });
      setEmail("");
      onCreated();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t("editor.people.copied"));
    } catch {
      // Clipboard can be unavailable (permissions, insecure origin): select the text instead.
      (document.getElementById("invitation-link") as HTMLInputElement | null)?.select();
    }
  };

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("editor.people.inviteTitle")}</CardTitle>
        <CardDescription>{t("editor.people.inviteBody")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="invite-role">{t("editor.people.role")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "EDITOR" | "VISITOR")}>
              <SelectTrigger id="invite-role" data-testid="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VISITOR">{t("common.roles.VISITOR")}</SelectItem>
                <SelectItem value="EDITOR">{t("common.roles.EDITOR")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-expiry">{t("editor.people.expiry")}</Label>
            <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
              <SelectTrigger id="invite-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_EXPIRY_HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {t(`editor.people.expiryOptions.${h}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-uses">{t("editor.people.uses")}</Label>
            <Select value={String(uses)} onValueChange={(v) => setUses(Number(v))} disabled={Boolean(email.trim())}>
              <SelectTrigger id="invite-uses">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_MAX_USES.map((u) => (
                  <SelectItem key={u} value={String(u)}>
                    {t(`editor.people.usesOptions.${u}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-email">{t("editor.people.email")}</Label>
          <Input
            id="invite-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!emailVerified}
            autoComplete="off"
            placeholder="name@example.com"
          />
          <p className="text-xs text-muted-foreground">{emailVerified ? t("editor.people.emailHint") : t("editor.people.emailNeedsVerification")}</p>
        </div>
        <Button variant="gold" className="justify-self-start" onClick={() => void create()} disabled={busy} data-testid="invite-create">
          {busy && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          {busy ? t("editor.people.creating") : t("editor.people.create")}
        </Button>
        {link && (
          <div className="grid gap-2 rounded-xl border border-gold/40 bg-gold/10 p-4" role="status">
            <Label htmlFor="invitation-link">{t("editor.people.linkTitle")}</Label>
            <div className="flex flex-wrap gap-2">
              <Input id="invitation-link" readOnly value={link} dir="ltr" className="min-w-0 flex-1 bg-background font-mono text-xs" onFocus={(e) => e.target.select()} data-testid="invitation-link" />
              <Button variant="outline" onClick={() => void copy()}>
                {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                {t("editor.people.copy")}
              </Button>
              {canShare && (
                <Button variant="outline" onClick={() => void navigator.share({ url: link }).catch(() => undefined)}>
                  <Share2Icon aria-hidden="true" />
                  {t("editor.people.share")}
                </Button>
              )}
            </div>
            <p className={cn("text-xs text-muted-foreground")}>{t("editor.people.linkOnce")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
