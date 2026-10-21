"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PrivacyConfig } from "@/features/museums/theme";
import { useI18n } from "@/i18n/client";
import { api } from "@/lib/api/client";
import { useEditor } from "./editor-context";

const AUTO = "__auto";

export function SettingsTab() {
  const { t } = useI18n();
  const router = useRouter();
  const { scene, museumId, mutate, errorText } = useEditor();
  const [name, setName] = useState(scene.museum.name);
  const [description, setDescription] = useState(scene.museum.description);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const perms = scene.viewer.permissions;
  const isOwner = scene.viewer.role === "OWNER";
  const dirty = name.trim() !== scene.museum.name || description.trim() !== scene.museum.description;
  const privacy = scene.museum.privacy;
  const setPrivacy = (patch: Partial<PrivacyConfig>) =>
    mutate(`/api/museums/${museumId}`, { method: "PATCH", body: { privacy: patch } }).catch((e) => toast.error(errorText(e)));

  return (
    <div className="grid max-w-3xl gap-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("editor.settings.details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field id="museum-name" label={t("editor.settings.name")}>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={!perms["museum.editSettings"]} />
          </Field>
          <Field id="museum-description" label={t("editor.settings.description")}>
            <Textarea value={description} maxLength={500} rows={3} onChange={(e) => setDescription(e.target.value)} disabled={!perms["museum.editSettings"]} />
          </Field>
          <div className="grid gap-1.5">
            <Label>{t("editor.settings.cover")}</Label>
            <Select
              value={scene.museum.coverPhotoId ?? AUTO}
              onValueChange={(v) => void mutate(`/api/museums/${museumId}`, { method: "PATCH", body: { coverPhotoId: v === AUTO ? null : v } }).catch((e) => toast.error(errorText(e)))}
              disabled={!perms["museum.editSettings"]}
            >
              <SelectTrigger aria-label={t("editor.settings.cover")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>{t("editor.settings.noCover")}</SelectItem>
                {scene.photos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title || t("common.untitled")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {perms["museum.editSettings"] && (
            <Button
              className="justify-self-start"
              disabled={!dirty || !name.trim()}
              onClick={() => void mutate(`/api/museums/${museumId}`, { method: "PATCH", body: { name: name.trim(), description: description.trim() } }).catch((e) => toast.error(errorText(e)))}
              data-testid="save-museum-settings"
            >
              {t("common.save")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("editor.settings.privacy")}</CardTitle>
          {!isOwner && <CardDescription>{t("editor.settings.privacyOwnerOnly")}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-4">
          {(
            [
              ["guestsCanStartSharedViewing", "editor.settings.guestsShared"],
              ["allowAnonymousGuests", "editor.settings.anonymousGuests"],
              ["voiceChatEnabled", "editor.settings.voice"],
              ["reactionsEnabled", "editor.settings.reactions"],
              ["commentsEnabled", "editor.settings.comments"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <Label htmlFor={`privacy-${key}`} className="font-normal">
                {t(label)}
              </Label>
              <Switch id={`privacy-${key}`} checked={privacy[key]} disabled={!isOwner} onCheckedChange={(v) => void setPrivacy({ [key]: v })} />
            </div>
          ))}
        </CardContent>
      </Card>

      {isOwner ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">{t("editor.settings.danger")}</CardTitle>
            <CardDescription>{t("editor.settings.dangerBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" data-testid="delete-museum">
                  {t("editor.settings.deleteButton")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("editor.settings.deleteButton")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("editor.settings.deleteConfirm")}</AlertDialogDescription>
                </AlertDialogHeader>
                <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} aria-label={t("editor.settings.deleteConfirm")} placeholder={scene.museum.name} />
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    disabled={confirmName.trim() !== scene.museum.name || deleting}
                    data-testid="confirm-delete-museum"
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await api(`/api/museums/${museumId}`, { method: "DELETE" });
                        toast.success(t("editor.settings.deleted"));
                        router.push("/dashboard");
                        router.refresh();
                      } catch (e) {
                        setDeleting(false);
                        toast.error(errorText(e));
                      }
                    }}
                  >
                    {deleting && <Loader2Icon className="animate-spin" aria-hidden="true" />}
                    {t("editor.settings.deleteButton")}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("editor.settings.leave")}</CardTitle>
            <CardDescription>{t("editor.settings.leaveBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={async () => {
                await api(`/api/museums/${museumId}/leave`, { method: "POST" }).catch(() => undefined);
                router.push("/dashboard");
                router.refresh();
              }}
            >
              {t("editor.settings.leave")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
