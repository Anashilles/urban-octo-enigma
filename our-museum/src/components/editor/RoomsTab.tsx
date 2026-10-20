"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SceneRoom } from "@/features/museums/scene-types";
import { FLOOR_MATERIALS, LIGHTING_PRESETS, ROOM_TYPES } from "@/features/rooms/geometry";
import { useI18n } from "@/i18n/client";
import { roomWallColor } from "@/three/rooms/Architecture";
import { useEditor } from "./editor-context";

export const WALL_SWATCHES = ["#f3f1ec", "#eadfcd", "#e7e6e3", "#d9c4a5", "#c9d3c7", "#bfc9d1", "#2a2826", "#1f2421", "#3b2f35", "#7b927d"];

const SIZES = {
  small: { width: 6, depth: 6, height: 3.8 },
  medium: { width: 8, depth: 7, height: 4.2 },
  large: { width: 12, depth: 9, height: 5 },
} as const;

const DEFAULT = "__default";

function RoomCard({ room, index, count, frames }: { room: SceneRoom; index: number; count: number; frames: number }) {
  const { t, formatNumber } = useI18n();
  const { scene, museumId, mutate, errorText } = useEditor();
  const [name, setName] = useState(room.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const perms = scene.viewer.permissions;
  const patch = (body: Record<string, unknown>) => mutate(`/api/museums/${museumId}/rooms/${room.id}`, { method: "PATCH", body }).catch((e) => toast.error(errorText(e)));
  const move = (delta: number) => {
    const ids = [...scene.rooms].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id);
    ids.splice(index, 1);
    ids.splice(index + delta, 0, room.id);
    void mutate(`/api/museums/${museumId}/rooms/order`, { method: "PUT", body: { roomIds: ids } }).catch((e) => toast.error(errorText(e)));
  };

  return (
    <li className="grid gap-4 rounded-2xl border border-border bg-card p-5" data-testid="room-card">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-1 size-9 shrink-0 rounded-lg border border-border" style={{ background: roomWallColor(room, scene.theme) }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name.trim() !== room.name) void patch({ name: name.trim() });
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== room.name && void patch({ name: name.trim() })}
              aria-label={t("editor.rooms.name")}
              className="h-10 font-display text-xl"
              maxLength={60}
              data-testid="room-name"
            />
          </form>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("editor.rooms.dimensions", { width: formatNumber(room.width), depth: formatNumber(room.depth), height: formatNumber(room.height) })} · {t("editor.rooms.frames", { count: frames })}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" aria-label={t("editor.rooms.moveEarlier")} disabled={index === 0} onClick={() => move(-1)}>
            <ArrowUpIcon />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("editor.rooms.moveLater")} disabled={index === count - 1} onClick={() => move(1)}>
            <ArrowDownIcon />
          </Button>
          {perms["room.delete"] && room.roomType !== "lobby" && (
            <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={t("editor.rooms.delete")} onClick={() => setConfirmDelete(true)} data-testid="delete-room">
              <Trash2Icon />
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label>{t("editor.rooms.type")}</Label>
          <Select value={room.roomType} onValueChange={(v) => void patch({ roomType: v })}>
            <SelectTrigger aria-label={t("editor.rooms.type")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROOM_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`editor.rooms.types.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>{t("editor.rooms.lighting")}</Label>
          <Select value={room.layout.lighting.preset ?? DEFAULT} onValueChange={(v) => void patch({ lightingPreset: v === DEFAULT ? null : v })}>
            <SelectTrigger aria-label={t("editor.rooms.lighting")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT}>{t("editor.rooms.museumDefault")}</SelectItem>
              {LIGHTING_PRESETS.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`editor.lighting.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>{t("editor.rooms.floor")}</Label>
          <Select value={room.layout.floorMaterial ?? DEFAULT} onValueChange={(v) => void patch({ floorMaterial: v === DEFAULT ? null : v })}>
            <SelectTrigger aria-label={t("editor.rooms.floor")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT}>{t("editor.rooms.museumDefault")}</SelectItem>
              {FLOOR_MATERIALS.map((f) => (
                <SelectItem key={f} value={f}>
                  {t(`editor.floors.${f}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch id={`sky-${room.id}`} checked={Boolean(room.layout.skylight)} onCheckedChange={(v) => void patch({ skylight: v })} />
          <Label htmlFor={`sky-${room.id}`} className="font-normal">
            {t("editor.rooms.skylight")}
          </Label>
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t("editor.rooms.wallColor")}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void patch({ wallColor: null })} className="rounded-full border px-3 py-1 text-xs" aria-pressed={!room.layout.wallColor}>
            {t("editor.rooms.museumDefault")}
          </button>
          {WALL_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={room.layout.wallColor === c}
              onClick={() => void patch({ wallColor: c })}
              className="size-7 rounded-full border aria-pressed:ring-2 aria-pressed:ring-gold aria-pressed:ring-offset-2"
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.rooms.deleteTitle", { name: room.name })}</AlertDialogTitle>
            <AlertDialogDescription>{frames ? t("editor.rooms.deleteFrames", { count: frames }) : t("editor.rooms.deleteEmpty")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              data-testid="confirm-delete-room"
              onClick={() => {
                setConfirmDelete(false);
                void mutate(`/api/museums/${museumId}/rooms/${room.id}?confirm=1`, { method: "DELETE" }).catch((e) => toast.error(errorText(e)));
              }}
            >
              {t("editor.rooms.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function AddRoomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const { museumId, mutate, errorText } = useEditor();
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<(typeof ROOM_TYPES)[number]>("gallery");
  const [size, setSize] = useState<keyof typeof SIZES>("medium");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("editor.rooms.addTitle")}</DialogTitle>
          <DialogDescription>{t("editor.rooms.addBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setBusy(true);
            try {
              await mutate(`/api/museums/${museumId}/rooms`, { method: "POST", body: { name: name.trim(), roomType, ...SIZES[size] } });
              toast.success(t("editor.rooms.added"));
              onOpenChange(false);
              setName("");
            } catch (err) {
              toast.error(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field id="new-room-name" label={t("editor.rooms.name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </Field>
          <div className="grid gap-1.5">
            <Label>{t("editor.rooms.type")}</Label>
            <Select value={roomType} onValueChange={(v) => setRoomType(v as typeof roomType)}>
              <SelectTrigger aria-label={t("editor.rooms.type")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.filter((r) => r !== "lobby").map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`editor.rooms.types.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("editor.rooms.size")}</Label>
            <Select value={size} onValueChange={(v) => setSize(v as keyof typeof SIZES)}>
              <SelectTrigger aria-label={t("editor.rooms.size")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SIZES) as Array<keyof typeof SIZES>).map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`editor.rooms.sizes.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()} data-testid="confirm-add-room">
              {busy && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              {t("editor.rooms.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RoomsTab() {
  const { t } = useI18n();
  const { scene } = useEditor();
  const [adding, setAdding] = useState(false);
  const rooms = [...scene.rooms].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-3xl">{t("editor.tabs.rooms")}</h2>
        {scene.viewer.permissions["room.create"] && (
          <Button onClick={() => setAdding(true)} data-testid="add-room">
            <PlusIcon aria-hidden="true" />
            {t("editor.rooms.add")}
          </Button>
        )}
      </div>
      <ul className="grid gap-4">
        {rooms.map((room, i) => (
          <RoomCard key={`${room.id}:${room.name}`} room={room} index={i} count={rooms.length} frames={scene.frames.filter((f) => f.roomId === room.id).length} />
        ))}
      </ul>
      <AddRoomDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
