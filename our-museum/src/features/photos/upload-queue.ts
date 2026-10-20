"use client";

import { create } from "zustand";
import { api, ApiError } from "@/lib/api/client";
import { ACCEPTED_EXTENSIONS, ACCEPTED_MIME_TYPES } from "@/services/image-processing-types";

export type UploadStatus = "queued" | "uploading" | "processing" | "done" | "failed" | "cancelled";

export interface UploadItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: UploadStatus;
  progress: number;
  /** Translation-ready error: either a message key + values, or a server message. */
  error?: { key: "tooLarge" | "unsupported" | "server"; message?: string };
  uploadId?: string;
  photoId?: string;
}

interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

interface QueueState {
  museumId: string | null;
  items: UploadItem[];
  maxBytes: number;
  collectionId: string | null;
  onCreated: ((photoId: string) => void) | null;
}

const CONCURRENCY = 3;
const xhrs = new Map<string, XMLHttpRequest>();

export const useUploadQueue = create<QueueState>()(() => ({
  museumId: null,
  items: [],
  maxBytes: 15 * 1024 * 1024,
  collectionId: null,
  onCreated: null,
}));

function patch(id: string, p: Partial<UploadItem>) {
  useUploadQueue.setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
}

export function isAcceptedFile(file: File) {
  const name = file.name.toLowerCase();
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type) || (ACCEPTED_EXTENSIONS as readonly string[]).some((e) => name.endsWith(e));
}

function put(id: string, target: UploadTarget, file: File) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrs.set(id, xhr);
    xhr.open(target.method, target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) patch(id, { progress: e.loaded / e.total });
    };
    xhr.onload = () => {
      xhrs.delete(id);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let message = xhr.statusText;
        try {
          message = JSON.parse(xhr.responseText).error?.message ?? message;
        } catch {
          /* not JSON (e.g. S3 XML) */
        }
        reject(new ApiError(xhr.status === 413 ? "PAYLOAD_TOO_LARGE" : "UPLOAD_FAILED", message, xhr.status));
      }
    };
    xhr.onerror = () => {
      xhrs.delete(id);
      reject(new ApiError("NETWORK", "Network error", 0));
    };
    xhr.onabort = () => {
      xhrs.delete(id);
      reject(new ApiError("ABORTED", "Cancelled", 0));
    };
    xhr.send(file);
  });
}

async function run(item: UploadItem) {
  const { museumId, collectionId } = useUploadQueue.getState();
  if (!museumId) return;
  patch(item.id, { status: "uploading", progress: 0, error: undefined });
  try {
    const { uploadId, target } = await api<{ uploadId: string; target: UploadTarget }>(`/api/museums/${museumId}/uploads`, {
      method: "POST",
      body: { filename: item.name, mimeType: item.file.type, size: item.size },
    });
    patch(item.id, { uploadId });
    if (useUploadQueue.getState().items.find((i) => i.id === item.id)?.status === "cancelled") return;
    await put(item.id, target, item.file);
    patch(item.id, { status: "processing", progress: 1 });
    const { photoId } = await api<{ photoId: string }>(`/api/uploads/${uploadId}/complete`, {
      method: "POST",
      body: collectionId ? { collectionId } : {},
    });
    patch(item.id, { status: "done", photoId });
    useUploadQueue.getState().onCreated?.(photoId);
  } catch (e) {
    const current = useUploadQueue.getState().items.find((i) => i.id === item.id);
    if (current?.status === "cancelled") return;
    const err = e instanceof ApiError ? e : null;
    patch(item.id, {
      status: "failed",
      error:
        err?.code === "PAYLOAD_TOO_LARGE"
          ? { key: "tooLarge" }
          : err?.code === "UNSUPPORTED_MEDIA_TYPE"
            ? { key: "unsupported" }
            : { key: "server", message: err?.message },
    });
  } finally {
    pump();
  }
}

function pump() {
  const { items } = useUploadQueue.getState();
  const active = items.filter((i) => i.status === "uploading" || i.status === "processing").length;
  const next = items.filter((i) => i.status === "queued").slice(0, Math.max(0, CONCURRENCY - active));
  for (const item of next) void run(item);
}

export function configureUploads(opts: { museumId: string; maxBytes: number; onCreated: (photoId: string) => void }) {
  const s = useUploadQueue.getState();
  useUploadQueue.setState({
    museumId: opts.museumId,
    maxBytes: opts.maxBytes,
    onCreated: opts.onCreated,
    items: s.museumId === opts.museumId ? s.items : [],
  });
}

export function setUploadCollection(collectionId: string | null) {
  useUploadQueue.setState({ collectionId });
}

export function addFiles(files: Iterable<File>) {
  const { maxBytes } = useUploadQueue.getState();
  const added: UploadItem[] = [];
  for (const file of files) {
    const item: UploadItem = {
      id: crypto.randomUUID(),
      file,
      name: file.name || "photo",
      size: file.size,
      status: "queued",
      progress: 0,
    };
    // Fail fast on the client; the server checks again (it is authoritative).
    if (!isAcceptedFile(file)) Object.assign(item, { status: "failed", error: { key: "unsupported" } });
    else if (file.size > maxBytes) Object.assign(item, { status: "failed", error: { key: "tooLarge" } });
    added.push(item);
  }
  useUploadQueue.setState((s) => ({ items: [...s.items, ...added] }));
  pump();
}

export function cancelUploadItem(id: string) {
  const item = useUploadQueue.getState().items.find((i) => i.id === id);
  if (!item) return;
  patch(id, { status: "cancelled" });
  xhrs.get(id)?.abort();
  if (item.uploadId) void api(`/api/uploads/${item.uploadId}`, { method: "DELETE" }).catch(() => undefined);
}

export function retryUploadItem(id: string) {
  // A retry always asks for a fresh upload slot.
  patch(id, { status: "queued", progress: 0, error: undefined, uploadId: undefined });
  pump();
}

export function dismissUploadItem(id: string) {
  useUploadQueue.setState((s) => ({ items: s.items.filter((i) => i.id !== id) }));
}

export function clearFinishedUploads() {
  useUploadQueue.setState((s) => ({ items: s.items.filter((i) => i.status !== "done") }));
}
