"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  CloudAlertIcon,
  DoorOpenIcon,
  ImagesIcon,
  LayoutPanelLeftIcon,
  Loader2Icon,
  PaletteIcon,
  SettingsIcon,
  PartyPopperIcon,
  UsersRoundIcon,
  RouteIcon,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import type { SceneData } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useMuseumStore } from "@/store/museum-store";
import { useUploadQueue } from "@/features/photos/upload-queue";
import { EditorProvider, useEditor } from "./editor-context";
import { AppearanceTab } from "./AppearanceTab";
import { PeopleTab } from "./PeopleTab";
import { PhotosTab } from "./PhotosTab";
import { RoomsTab } from "./RoomsTab";
import { ToursTab } from "./ToursTab";
import { SettingsTab } from "./SettingsTab";
import { WallsTab } from "./WallsTab";
import { useSaveStatus, useUnsavedGuard } from "./save-status";

export const EDITOR_TABS = ["photos", "walls", "rooms", "appearance", "tours", "people", "settings"] as const;
export type EditorTab = (typeof EDITOR_TABS)[number];

const ICONS: Record<EditorTab, ComponentType<{ className?: string }>> = {
  photos: ImagesIcon,
  walls: LayoutPanelLeftIcon,
  rooms: DoorOpenIcon,
  appearance: PaletteIcon,
  tours: RouteIcon,
  people: UsersRoundIcon,
  settings: SettingsIcon,
};

function SaveIndicator() {
  const { t } = useI18n();
  const { pending, failed, lastSavedAt } = useSaveStatus();
  if (pending > 0)
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status" data-testid="save-status" data-state="saving">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        {t("editor.save.saving")}
      </span>
    );
  if (failed)
    return (
      <span className="flex items-center gap-2 text-sm text-destructive" role="alert" data-testid="save-status" data-state="failed">
        <CloudAlertIcon className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t("editor.save.failed")}:</span> <span className="max-w-60 truncate">{failed.message}</span>
        {failed.retry && (
          <Button size="sm" variant="outline" className="h-7" onClick={() => void failed.retry?.().catch(() => undefined)}>
            {t("editor.save.retry")}
          </Button>
        )}
      </span>
    );
  if (lastSavedAt)
    return (
      <span className="flex items-center gap-1.5 text-sm text-sage" role="status" data-testid="save-status" data-state="saved">
        <CheckIcon className="size-4" aria-hidden="true" />
        {t("editor.save.saved")}
      </span>
    );
  return null;
}

function EditorBody({ tab, onTab, created }: { tab: EditorTab; onTab: (t: EditorTab) => void; created: boolean }) {
  const { t, dir } = useI18n();
  const { scene, museumId } = useEditor();
  const uploading = useUploadQueue((s) => s.items.some((i) => i.status === "uploading" || i.status === "processing" || i.status === "queued"));
  useUnsavedGuard(uploading, t("editor.unsaved"));
  const perms = scene.viewer.permissions;
  const visible = EDITOR_TABS.filter((k) => {
    if (k === "rooms") return perms["room.edit"];
    if (k === "tours") return perms["tour.manage"];
    return true;
  });

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:px-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">
            <ArrowLeftIcon className={cn(dir === "rtl" && "rotate-180")} aria-hidden="true" />
            <span className="hidden sm:inline">{t("editor.back")}</span>
          </Link>
        </Button>
        <div className="min-w-0">
          <p className="text-eyebrow text-gold-deep">{t("editor.title")}</p>
          <h1 className="truncate font-display text-2xl leading-tight" data-testid="editor-museum-name">
            {scene.museum.name}
          </h1>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <SaveIndicator />
          <LanguageSwitcher />
          <Button asChild data-testid="editor-enter">
            <Link href={`/museum/${museumId}`}>{t("editor.enter")}</Link>
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col lg:flex-row">
        <nav aria-label={t("editor.title")} className="border-b border-border px-3 py-2 lg:w-56 lg:shrink-0 lg:border-e lg:border-b-0 lg:px-3 lg:py-5">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col" role="tablist">
            {visible.map((k) => {
              const Icon = ICONS[k];
              const active = k === tab;
              return (
                <li key={k}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTab(k)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm whitespace-nowrap transition",
                      active ? "bg-charcoal text-ivory" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    data-testid={`editor-tab-${k}`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t(`editor.tabs.${k}`)}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8" role="tabpanel">
          {created && tab === "photos" && (
            <div role="status" className="mb-6 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm">
              <PartyPopperIcon className="size-4 text-gold-deep" aria-hidden="true" />
              {t("editor.created")}
            </div>
          )}
          {tab === "photos" && <PhotosTab onHang={() => onTab("walls")} />}
          {tab === "walls" && <WallsTab />}
          {tab === "rooms" && <RoomsTab />}
          {tab === "appearance" && <AppearanceTab />}
          {tab === "tours" && <ToursTab />}
          {tab === "people" && <PeopleTab />}
          {tab === "settings" && <SettingsTab />}
        </main>
      </div>
    </div>
  );
}

export default function EditorShell({ initialScene, maxUploadBytes }: { initialScene: SceneData; maxUploadBytes: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const [tab, setTab] = useState<EditorTab>((EDITOR_TABS as readonly string[]).includes(raw ?? "") ? (raw as EditorTab) : "photos");
  const created = params.get("created") === "1";
  const ready = useMuseumStore((s) => s.scene?.museum.id === initialScene.museum.id);

  useEffect(() => {
    useMuseumStore.getState().setScene(initialScene);
  }, [initialScene]);

  const onTab = (next: EditorTab) => {
    setTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };

  if (!ready) return null;
  return (
    <EditorProvider museumId={initialScene.museum.id} maxUploadBytes={maxUploadBytes}>
      <EditorBody tab={tab} onTab={onTab} created={created} />
    </EditorProvider>
  );
}
