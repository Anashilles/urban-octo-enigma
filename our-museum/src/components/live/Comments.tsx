"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpenTextIcon, Loader2Icon, MessageCircleIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/input";
import type { SceneData, ScenePhoto } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { api, errorKey } from "@/lib/api/client";
import { MAX_COMMENT_LENGTH, MAX_GUESTBOOK_LENGTH } from "@/lib/validation/comments";
import { cn } from "@/lib/utils";
import { useMuseumStore } from "@/store/museum-store";

export interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string; guest: boolean; self: boolean };
  canDelete: boolean;
}

/**
 * Loads a list of notes and reloads it whenever `version` changes — the scene
 * carries comment counts, and it refreshes when someone else posts.
 */
function useNotes(url: string, key: "comments" | "entries", version: unknown, active: boolean) {
  const [items, setItems] = useState<Note[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active) return;
    let current = true; // ignore answers for a photo we already moved away from
    api<Record<typeof key, Note[]>>(url).then(
      (res) => {
        if (!current) return;
        setItems(res[key]);
        setFailed(false);
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [active, url, key, version]);
  return { items, setItems, failed };
}

function NoteItem({ note, onDelete, confirmLabel }: { note: Note; onDelete: (id: string) => Promise<void>; confirmLabel: string }) {
  const { t, formatRelative } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <li className="grid gap-1 rounded-xl border border-white/10 bg-white/5 p-3" data-testid="note">
      <div className="flex items-center gap-2 text-xs text-ivory/70">
        <span className="font-medium text-ivory" dir="auto">
          {note.author.self ? t("museum.comments.you") : note.author.name}
        </span>
        {note.author.guest && <span className="rounded-full border border-white/20 px-1.5 py-px text-[10px]">{t("museum.comments.guest")}</span>}
        <time dateTime={note.createdAt} className="ms-auto">
          {formatRelative(note.createdAt)}
        </time>
      </div>
      <p className="text-sm leading-relaxed break-words whitespace-pre-line text-ivory/90" dir="auto" data-testid="note-body">
        {note.body}
      </p>
      {note.canDelete &&
        (confirming ? (
          <div className="flex items-center gap-2 text-xs" role="group" aria-label={confirmLabel}>
            <span className="text-ivory/75">{confirmLabel}</span>
            <Button
              size="sm"
              variant="glass"
              className="ms-auto h-7 text-[#f2a1a1]"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onDelete(note.id).finally(() => setBusy(false));
              }}
              data-testid="note-delete-confirm"
            >
              {t("museum.comments.confirm")}
            </Button>
            <Button size="sm" variant="glass" className="h-7" onClick={() => setConfirming(false)}>
              {t("museum.comments.cancel")}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 justify-self-end px-2 text-xs text-ivory/70 hover:bg-white/10 hover:text-ivory" onClick={() => setConfirming(true)} data-testid="note-delete">
            <Trash2Icon className="size-3.5" aria-hidden="true" />
            {t("museum.comments.delete")}
          </Button>
        ))}
    </li>
  );
}

function Composer({ max, placeholder, submitLabel, onSubmit, testId }: { max: number; placeholder: string; submitLabel: string; onSubmit: (body: string) => Promise<boolean>; testId: string }) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const hintId = useId();
  const left = max - body.length;
  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit(body).finally(() => setBusy(false));
    if (ok) setBody("");
  };
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, max))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={3}
        maxLength={max}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-describedby={hintId}
        dir="auto"
        className="min-h-20 border-white/15 bg-white/5 text-ivory placeholder:text-ivory/60"
        data-testid={`${testId}-input`}
      />
      <div className="flex items-center gap-2">
        <span id={hintId} className={cn("text-xs", left < max * 0.1 ? "text-gold" : "text-ivory/60")}>
          {left < max * 0.2 ? t("museum.comments.remaining", { count: left }) : t("museum.comments.sendHint")}
        </span>
        <Button type="submit" size="sm" variant="gold" className="ms-auto" disabled={busy || !body.trim()} data-testid={`${testId}-submit`}>
          {busy ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/* Photo comments ----------------------------------------------------------------- */

export function CommentsButton({ photo }: { photo: ScenePhoto }) {
  const { t } = useI18n();
  const open = useMuseumStore((s) => s.commentsOpen);
  const setOpen = useMuseumStore((s) => s.setCommentsOpen);
  return (
    <Button
      variant="glass"
      size="sm"
      onClick={() => setOpen(!open)}
      aria-pressed={open}
      data-testid="comments-toggle"
    >
      <MessageCircleIcon aria-hidden="true" />
      {t("museum.comments.button")}
      {photo.commentCount > 0 && <span className="rounded-full bg-white/15 px-1.5 text-xs tabular-nums">{photo.commentCount}</span>}
    </Button>
  );
}

/** Side panel inside the photo viewer. */
export function PhotoComments({ museumId, photo, canWrite }: { museumId: string; photo: ScenePhoto; canWrite: boolean }) {
  const { t } = useI18n();
  const open = useMuseumStore((s) => s.commentsOpen);
  const setOpen = useMuseumStore((s) => s.setCommentsOpen);
  const { items, setItems, failed } = useNotes(`/api/museums/${museumId}/photos/${photo.id}/comments`, "comments", `${photo.id}:${photo.commentCount}`, open);
  const listRef = useRef<HTMLOListElement>(null);
  const headingId = useId();

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [items]);

  if (!open) return null;
  return (
    <aside
      aria-labelledby={headingId}
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[70dvh] flex-col gap-3 rounded-t-2xl border-t border-white/10 bg-ink/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur sm:inset-x-auto sm:end-0 sm:top-0 sm:bottom-0 sm:max-h-none sm:w-96 sm:rounded-none sm:border-s sm:border-t-0 sm:pt-[max(env(safe-area-inset-top),1rem)]"
      data-hud-panel
      data-viewer-aside
      data-testid="comments-panel"
    >
      <div className="flex items-center gap-2">
        <h2 id={headingId} className="font-display text-xl">
          {t("museum.comments.title")}
        </h2>
        <Button variant="glass" size="icon-sm" className="ms-auto" onClick={() => setOpen(false)} aria-label={t("museum.comments.close")} data-testid="comments-close">
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite" aria-busy={items === null}>
        {failed && <p className="text-sm text-[#f2a1a1]">{t("museum.comments.failed")}</p>}
        {items === null && !failed && <Loader2Icon className="mx-auto size-5 animate-spin text-ivory/70" aria-hidden="true" />}
        {items?.length === 0 && <p className="text-sm text-ivory/70">{t("museum.comments.empty")}</p>}
        {items && items.length > 0 && (
          <ol ref={listRef} className="grid gap-2" data-testid="comments-list">
            {items.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                confirmLabel={t("museum.comments.confirmDelete")}
                onDelete={async (id) => {
                  try {
                    await api(`/api/museums/${museumId}/comments/${id}`, { method: "DELETE" });
                    setItems((cur) => cur?.filter((n) => n.id !== id) ?? cur);
                    adjustCount(photo.id, -1);
                    toast(t("museum.comments.deleted"));
                  } catch (e) {
                    toast.error(t(errorKey(e)));
                  }
                }}
              />
            ))}
          </ol>
        )}
      </div>
      {canWrite && (
        <Composer
          max={MAX_COMMENT_LENGTH}
          placeholder={t("museum.comments.placeholder")}
          submitLabel={t("museum.comments.send")}
          testId="comment"
          onSubmit={async (body) => {
            try {
              const note = await api<Note>(`/api/museums/${museumId}/photos/${photo.id}/comments`, { method: "POST", body: { body } });
              setItems((cur) => [...(cur ?? []), note]);
              adjustCount(photo.id, 1);
              return true;
            } catch (e) {
              toast.error(t(errorKey(e)));
              return false;
            }
          }}
        />
      )}
    </aside>
  );
}

/** Keeps the count on the button in step with our own changes (others' arrive with the scene). */
function adjustCount(photoId: string, delta: number) {
  useMuseumStore.getState().patchScene((s) => ({ ...s, photos: s.photos.map((p) => (p.id === photoId ? { ...p, commentCount: Math.max(0, p.commentCount + delta) } : p)) }));
}

/* Guestbook -------------------------------------------------------------------- */

export function GuestbookPanel({ scene, canWrite }: { scene: SceneData; canWrite: boolean }) {
  const { t } = useI18n();
  const panel = useMuseumStore((s) => s.panel);
  const setPanel = useMuseumStore((s) => s.setPanel);
  const museumId = scene.museum.id;
  const open = panel === "guestbook";
  const { items, setItems, failed } = useNotes(`/api/museums/${museumId}/guestbook`, "entries", scene.museum.guestbookCount, open);
  const adjust = (delta: number) => useMuseumStore.getState().patchScene((s) => ({ ...s, museum: { ...s.museum, guestbookCount: Math.max(0, s.museum.guestbookCount + delta) } }));
  return (
    <Sheet open={open} onOpenChange={(o) => !o && setPanel(null)} modal={false}>
      <SheetContent side="end" tone="dark" modal={false} closeLabel={t("common.close")} className="overflow-y-auto" data-hud-panel data-testid="guestbook-panel">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpenTextIcon className="size-5 text-gold" aria-hidden="true" />
            {t("museum.guestbook.title")}
          </SheetTitle>
          <SheetDescription className="text-ivory/70">{t("museum.guestbook.description", { owner: scene.museum.ownerName })}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-5 pb-8">
          {canWrite && (
            <Composer
              max={MAX_GUESTBOOK_LENGTH}
              placeholder={t("museum.guestbook.placeholder")}
              submitLabel={t("museum.guestbook.sign")}
              testId="guestbook"
              onSubmit={async (body) => {
                try {
                  const note = await api<Note>(`/api/museums/${museumId}/guestbook`, { method: "POST", body: { body } });
                  setItems((cur) => [note, ...(cur ?? [])]);
                  adjust(1);
                  toast.success(t("museum.guestbook.signed"));
                  return true;
                } catch (e) {
                  toast.error(t(errorKey(e)));
                  return false;
                }
              }}
            />
          )}
          <div aria-live="polite" aria-busy={items === null}>
            {failed && <p className="text-sm text-[#f2a1a1]">{t("museum.comments.failed")}</p>}
            {items === null && !failed && <Loader2Icon className="mx-auto size-5 animate-spin text-ivory/70" aria-hidden="true" />}
            {items?.length === 0 && <p className="text-sm text-ivory/70">{t("museum.guestbook.empty")}</p>}
            {items && items.length > 0 && (
              <ol className="grid gap-2" data-testid="guestbook-list">
                {items.map((note) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    confirmLabel={t("museum.guestbook.confirmDelete")}
                    onDelete={async (id) => {
                      try {
                        await api(`/api/museums/${museumId}/guestbook/${id}`, { method: "DELETE" });
                        setItems((cur) => cur?.filter((n) => n.id !== id) ?? cur);
                        adjust(-1);
                      } catch (e) {
                        toast.error(t(errorKey(e)));
                      }
                    }}
                  />
                ))}
              </ol>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
