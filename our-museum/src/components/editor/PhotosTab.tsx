"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  FolderPlusIcon,
  FrameIcon,
  ImagePlusIcon,
  Loader2Icon,
  PencilIcon,
  RotateCwIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon,
  AlertCircleIcon,
} from "lucide-react";
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
import { Checkbox, Progress } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScenePhoto } from "@/features/museums/scene-types";
import {
  addFiles,
  cancelUploadItem,
  clearFinishedUploads,
  configureUploads,
  dismissUploadItem,
  retryUploadItem,
  setUploadCollection,
  useUploadQueue,
} from "@/features/photos/upload-queue";
import { ACCEPTED_EXTENSIONS } from "@/services/image-processing-types";
import { useI18n } from "@/i18n/client";
import { cn, formatBytes } from "@/lib/utils";
import { photoImageUrl } from "@/components/museum/photo-urls";
import { useEditor } from "./editor-context";
import { useEditorSelection } from "./selection";

type Filter = { kind: "all" } | { kind: "unhung" } | { kind: "collection"; id: string };

function Uploader() {
  const { t, locale } = useI18n();
  const { museumId, refresh, maxUploadBytes } = useEditor();
  const items = useUploadQueue((s) => s.items);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    configureUploads({ museumId, maxBytes: maxUploadBytes, onCreated: () => void refresh() });
  }, [museumId, maxUploadBytes, refresh]);

  const statusText = (s: (typeof items)[number]) => {
    switch (s.status) {
      case "queued":
        return t("editor.photos.queued");
      case "uploading":
        return t("editor.photos.uploading", { percent: Math.round(s.progress * 100) });
      case "processing":
        return t("editor.photos.processing");
      case "done":
        return t("editor.photos.done");
      case "cancelled":
        return t("editor.photos.cancelled");
      case "failed":
        if (s.error?.key === "tooLarge") return t("editor.photos.tooLarge", { name: s.name, size: formatBytes(maxUploadBytes, locale) });
        if (s.error?.key === "unsupported") return t("editor.photos.unsupported", { name: s.name });
        return s.error?.message ?? t("editor.photos.failed");
    }
  };

  return (
    <section className="grid gap-4">
      <div
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "grid justify-items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition",
          dragging ? "border-gold bg-gold/10" : "border-input bg-card/60",
        )}
        data-testid="dropzone"
      >
        <span className="grid size-12 place-items-center rounded-full bg-gold/15 text-gold-deep">
          <UploadCloudIcon className="size-6" aria-hidden="true" />
        </span>
        <p className="font-display text-xl">{t("editor.photos.dropHere")}</p>
        <p className="text-sm text-muted-foreground">{t("editor.photos.dropHint", { size: formatBytes(maxUploadBytes, locale) })}</p>
        <Button type="button" onClick={() => inputRef.current?.click()} data-testid="choose-photos">
          <ImagePlusIcon aria-hidden="true" />
          {t("editor.photos.choose")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", ...ACCEPTED_EXTENSIONS].join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {items.length > 0 && (
        <ul className="grid gap-2" aria-live="polite" data-testid="upload-queue">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3" data-status={item.status}>
              <span className="shrink-0">
                {item.status === "done" ? (
                  <CheckCircle2Icon className="size-5 text-sage" aria-hidden="true" />
                ) : item.status === "failed" ? (
                  <AlertCircleIcon className="size-5 text-destructive" aria-hidden="true" />
                ) : item.status === "cancelled" ? (
                  <XIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Loader2Icon className="size-5 animate-spin text-gold-deep" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className={cn("text-xs", item.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                  {formatBytes(item.size, locale)} · {statusText(item)}
                </p>
                {(item.status === "uploading" || item.status === "processing") && <Progress value={item.progress * 100} className="mt-2" />}
              </div>
              {(item.status === "queued" || item.status === "uploading") && (
                <Button size="sm" variant="ghost" onClick={() => cancelUploadItem(item.id)}>
                  {t("editor.photos.cancel")}
                </Button>
              )}
              {(item.status === "failed" || item.status === "cancelled") && item.error?.key !== "tooLarge" && item.error?.key !== "unsupported" && (
                <Button size="sm" variant="outline" onClick={() => retryUploadItem(item.id)} data-testid="retry-upload">
                  <RotateCwIcon aria-hidden="true" />
                  {t("editor.photos.retry")}
                </Button>
              )}
              {(item.status === "failed" || item.status === "cancelled" || item.status === "done") && (
                <Button size="icon-sm" variant="ghost" onClick={() => dismissUploadItem(item.id)} aria-label={t("editor.photos.dismiss")}>
                  <XIcon />
                </Button>
              )}
            </li>
          ))}
          {items.some((i) => i.status === "done") && (
            <li>
              <Button size="sm" variant="link" onClick={clearFinishedUploads}>
                {t("editor.photos.dismiss")}
              </Button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function CollectionsSidebar({ filter, onFilter }: { filter: Filter; onFilter: (f: Filter) => void }) {
  const { t } = useI18n();
  const { scene, museumId, mutate } = useEditor();
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const canManage = scene.viewer.permissions["collection.manage"];
  const hung = new Set(scene.frames.map((f) => f.photoId));
  const cols = [...scene.collections].sort((a, b) => a.sortOrder - b.sortOrder);

  const move = (index: number, delta: number) => {
    const ids = cols.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    void mutate(`/api/museums/${museumId}/collections/order`, { method: "PUT", body: { ids } }).catch(() => undefined);
  };

  const item = (active: boolean, label: string, count: number, onClick: () => void, testId?: string) => (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm", active ? "bg-accent font-medium" : "hover:bg-accent/60")}
      data-testid={testId}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );

  return (
    <aside className="grid content-start gap-1" aria-label={t("editor.photos.manageCollections")}>
      {item(filter.kind === "all", t("editor.photos.all"), scene.photos.length, () => onFilter({ kind: "all" }))}
      {item(filter.kind === "unhung", t("editor.photos.unhung"), scene.photos.filter((p) => !hung.has(p.id)).length, () => onFilter({ kind: "unhung" }))}
      <p className="mt-4 mb-1 px-3 text-eyebrow text-muted-foreground">{t("editor.photos.manageCollections")}</p>
      {cols.map((c, i) => (
        <div key={c.id} className="group flex items-center gap-1">
          {renaming?.id === c.id ? (
            <form
              className="flex flex-1 gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!renaming.name.trim()) return;
                void mutate(`/api/museums/${museumId}/collections/${c.id}`, { method: "PATCH", body: { name: renaming.name.trim() } }).catch(() => undefined);
                setRenaming(null);
              }}
            >
              <Input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: c.id, name: e.target.value })} className="h-8" aria-label={t("editor.photos.collectionName")} />
            </form>
          ) : (
            <div className="min-w-0 flex-1">{item(filter.kind === "collection" && filter.id === c.id, c.name, c.photoIds.length, () => onFilter({ kind: "collection", id: c.id }), `collection-${i}`)}</div>
          )}
          {canManage && (
            <div className="flex opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
              <Button size="icon-sm" variant="ghost" aria-label={t("editor.photos.rename")} onClick={() => setRenaming({ id: c.id, name: c.name })}>
                <PencilIcon />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={t("editor.photos.moveEarlier")} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpIcon />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={t("editor.photos.moveLater")} disabled={i === cols.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownIcon />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={t("editor.photos.deleteCollection")}>
                    <Trash2Icon />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("editor.photos.deleteCollection")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("editor.photos.deleteCollectionConfirm", { name: c.name })}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => {
                        if (filter.kind === "collection" && filter.id === c.id) onFilter({ kind: "all" });
                        void mutate(`/api/museums/${museumId}/collections/${c.id}`, { method: "DELETE" }).catch(() => undefined);
                      }}
                    >
                      {t("common.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      ))}
      {canManage && (
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            void mutate(`/api/museums/${museumId}/collections`, { method: "POST", body: { name: newName.trim() } }).catch(() => undefined);
            setNewName("");
          }}
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("editor.photos.newCollection")} className="h-9" aria-label={t("editor.photos.newCollection")} />
          <Button type="submit" size="icon" variant="outline" aria-label={t("editor.photos.newCollection")}>
            <FolderPlusIcon />
          </Button>
        </form>
      )}
    </aside>
  );
}

function PhotoDetails({ photo, onHang }: { photo: ScenePhoto; onHang: () => void }) {
  const { t } = useI18n();
  const { scene, museumId, mutate } = useEditor();
  const [title, setTitle] = useState(photo.title);
  const [caption, setCaption] = useState(photo.caption);
  const [date, setDate] = useState(photo.takenAt ? photo.takenAt.slice(0, 10) : "");
  const [collections, setCollections] = useState<string[]>(photo.collectionIds);
  const [savingDetails, setSavingDetails] = useState(false);
  const perms = scene.viewer.permissions;
  const canEdit = perms["photo.edit"];
  const canDelete = perms["photo.deleteAny"] || (perms["photo.deleteOwn"] && photo.uploadedById === scene.viewer.userId);
  const frames = scene.frames.filter((f) => f.photoId === photo.id).length;
  const isCover = scene.museum.coverPhotoId === photo.id;
  const dirty = title !== photo.title || caption !== photo.caption || date !== (photo.takenAt?.slice(0, 10) ?? "") || collections.slice().sort().join() !== photo.collectionIds.slice().sort().join();
  const url = photoImageUrl(photo, "medium");

  const save = async () => {
    setSavingDetails(true);
    try {
      await mutate(`/api/museums/${museumId}/photos/${photo.id}`, {
        method: "PATCH",
        body: { title, caption, takenAt: date || null, collectionIds: collections },
      });
    } catch {
      /* surfaced by the save indicator */
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <div className="grid gap-5" data-testid="photo-details">
      <div className="overflow-hidden rounded-xl border border-border" style={{ background: photo.dominantColor }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
        {url && <img src={url} alt={photo.title} className="max-h-72 w-full object-contain" />}
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{t("editor.photos.onWalls", { count: frames })}</Badge>
        {isCover && <Badge variant="gold">{t("editor.photos.isCover")}</Badge>}
      </div>
      <Field id="photo-title" label={t("editor.photos.titleLabel")}>
        <Input value={title} maxLength={120} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field id="photo-caption" label={t("editor.photos.caption")}>
        <Textarea value={caption} maxLength={2000} rows={3} disabled={!canEdit} onChange={(e) => setCaption(e.target.value)} />
      </Field>
      <Field id="photo-date" label={t("editor.photos.date")}>
        <Input type="date" value={date} disabled={!canEdit} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("editor.photos.collections")}</legend>
        {scene.collections.map((c) => (
          <div key={c.id} className="flex items-center gap-2.5">
            <Checkbox
              id={`col-${c.id}`}
              checked={collections.includes(c.id)}
              disabled={!canEdit}
              onCheckedChange={(v) => setCollections((cur) => (v ? [...cur, c.id] : cur.filter((x) => x !== c.id)))}
            />
            <Label htmlFor={`col-${c.id}`} className="font-normal">
              {c.name}
            </Label>
          </div>
        ))}
      </fieldset>
      {canEdit && (
        <Button onClick={save} disabled={!dirty || savingDetails} data-testid="save-photo">
          {savingDetails && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          {t("common.save")}
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        {perms["frame.place"] && (
          <Button variant="outline" onClick={onHang} data-testid="hang-photo">
            <FrameIcon aria-hidden="true" />
            {t("editor.photos.hang")}
          </Button>
        )}
        {perms["museum.editSettings"] && !isCover && (
          <Button variant="outline" onClick={() => void mutate(`/api/museums/${museumId}`, { method: "PATCH", body: { coverPhotoId: photo.id } }).catch(() => undefined)}>
            <StarIcon aria-hidden="true" />
            {t("editor.photos.setCover")}
          </Button>
        )}
        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="text-destructive" data-testid="delete-photo">
                <Trash2Icon aria-hidden="true" />
                {t("editor.photos.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("editor.photos.deleteConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("editor.photos.deleteConfirmBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  data-testid="confirm-delete-photo"
                  onClick={() => {
                    useEditorSelection.getState().set({ photoId: null });
                    void mutate(`/api/museums/${museumId}/photos/${photo.id}`, { method: "DELETE" }).catch(() => undefined);
                  }}
                >
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

export function PhotosTab({ onHang }: { onHang: () => void }) {
  const { t } = useI18n();
  const { scene, museumId, mutate } = useEditor();
  const selectedId = useEditorSelection((s) => s.photoId);
  const select = useEditorSelection((s) => s.set);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const canUpload = scene.viewer.permissions["photo.upload"];
  const hungCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of scene.frames) m.set(f.photoId, (m.get(f.photoId) ?? 0) + 1);
    return m;
  }, [scene.frames]);

  // New uploads go into the collection being viewed.
  useEffect(() => setUploadCollection(filter.kind === "collection" ? filter.id : null), [filter]);

  const collection = filter.kind === "collection" ? scene.collections.find((c) => c.id === filter.id) : null;
  const photos = useMemo(() => {
    let list = [...scene.photos].reverse();
    if (filter.kind === "unhung") list = list.filter((p) => !hungCount.has(p.id));
    if (collection) {
      const order = new Map(collection.photoIds.map((id, i) => [id, i]));
      list = list.filter((p) => order.has(p.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    }
    const q = query.trim().toLocaleLowerCase();
    if (q) list = list.filter((p) => `${p.title} ${p.caption}`.toLocaleLowerCase().includes(q));
    return list;
  }, [scene.photos, filter, collection, query, hungCount]);
  const selected = selectedId ? scene.photos.find((p) => p.id === selectedId) : null;

  const moveInCollection = (photoId: string, delta: number) => {
    if (!collection) return;
    const ids = [...collection.photoIds];
    const i = ids.indexOf(photoId);
    if (i < 0 || i + delta < 0 || i + delta >= ids.length) return;
    ids.splice(i, 1);
    ids.splice(i + delta, 0, photoId);
    void mutate(`/api/museums/${museumId}/collections/${collection.id}/photos`, { method: "PUT", body: { photoIds: ids } }).catch(() => undefined);
  };

  return (
    <div className="grid gap-8">
      <div>
        <h2 className="font-display text-3xl">{t("editor.photos.title")}</h2>
        <p className="mt-1 text-muted-foreground" data-testid="photo-count">
          {t("editor.photos.count", { count: scene.photos.length })}
        </p>
      </div>
      {canUpload && <Uploader />}
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_20rem]">
        <CollectionsSidebar filter={filter} onFilter={setFilter} />
        <section className="grid content-start gap-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("editor.photos.search")} aria-label={t("editor.photos.search")} className="ps-9" />
          </div>
          {photos.length === 0 ? (
            <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-input p-12 text-center" data-testid="photos-empty">
              <p className="font-display text-2xl">{t("editor.photos.emptyTitle")}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{t("editor.photos.emptyBody")}</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" data-testid="photo-grid">
              {photos.map((p) => {
                const url = photoImageUrl(p, "thumb");
                const frames = hungCount.get(p.id) ?? 0;
                return (
                  <li key={p.id} className="relative">
                    <button
                      type="button"
                      onClick={() => select({ photoId: p.id })}
                      className={cn(
                        "group block w-full overflow-hidden rounded-xl border bg-card text-start transition focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        selectedId === p.id ? "border-gold ring-2 ring-gold/40" : "border-border hover:border-gold/40",
                      )}
                      data-testid="photo-tile"
                    >
                      <div className="aspect-square" style={{ background: p.dominantColor }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
                        {url && <img src={url} alt="" loading="lazy" className="size-full object-cover" />}
                      </div>
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="truncate text-sm">{p.title || t("common.untitled")}</span>
                        {frames > 0 && <FrameIcon className="size-3.5 shrink-0 text-gold-deep" aria-label={t("editor.photos.onWalls", { count: frames })} />}
                      </div>
                    </button>
                    {collection && scene.viewer.permissions["collection.manage"] && (
                      <div className="absolute end-1.5 top-1.5 flex gap-1">
                        <Button size="icon-sm" variant="glass" aria-label={t("editor.photos.moveEarlier")} onClick={() => moveInCollection(p.id, -1)}>
                          <ArrowUpIcon />
                        </Button>
                        <Button size="icon-sm" variant="glass" aria-label={t("editor.photos.moveLater")} onClick={() => moveInCollection(p.id, 1)}>
                          <ArrowDownIcon />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {selected ? (
            <PhotoDetails key={`${selected.id}:${selected.title}:${selected.caption}:${selected.takenAt}:${selected.collectionIds.join()}`} photo={selected} onHang={onHang} />
          ) : (
            <p className="rounded-xl border border-dashed border-input p-6 text-sm text-muted-foreground">{t("editor.photos.selectPhoto")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
