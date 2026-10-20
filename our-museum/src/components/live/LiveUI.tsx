"use client";

import { EyeIcon, HandIcon, MapPinIcon, MicIcon, UsersRoundIcon, WifiOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { SceneData } from "@/features/museums/scene-types";
import { REACTION_EMOJIS, type Peer, type ReactionEmoji } from "@/features/realtime/protocol";
import { tagElements } from "@/features/realtime/name-tags";
import { latestPose } from "@/features/realtime/remote-poses";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useMuseumStore } from "@/store/museum-store";
import { useRealtimeStore, type RealtimeStatus } from "@/store/realtime-store";
import type { RealtimeActions } from "./use-realtime";

function usePeers() {
  const peers = useRealtimeStore((s) => s.peers);
  const selfId = useRealtimeStore((s) => s.selfId);
  return Object.values(peers).filter((p) => p.id !== selfId);
}

function photoTitle(scene: SceneData, photoId: string | null | undefined, fallback: string) {
  if (!photoId) return null;
  const p = scene.photos.find((x) => x.id === photoId);
  return p ? p.title || fallback : null;
}

const STATUS_DOT: Record<RealtimeStatus, string> = {
  idle: "bg-ivory/40",
  connecting: "bg-gold animate-pulse",
  online: "bg-[#7bd389]",
  reconnecting: "bg-gold animate-pulse",
  unavailable: "bg-ivory/30",
};

/** Toolbar button: connection state and how many people are here. */
export function PresenceButton() {
  const t = useT();
  const status = useRealtimeStore((s) => s.status);
  const others = usePeers();
  const panel = useMuseumStore((s) => s.panel);
  const setPanel = useMuseumStore((s) => s.setPanel);
  const label =
    status === "online"
      ? t("museum.live.here", { count: others.length })
      : status === "unavailable"
        ? t("museum.live.unavailable")
        : status === "reconnecting"
          ? t("museum.live.reconnecting")
          : t("museum.live.connecting");
  return (
    <Button
      variant="glass"
      className={cn("h-10 gap-1.5 rounded-full px-2.5 sm:gap-2 sm:px-3", panel === "people" && "bg-white/15 ring-1 ring-gold/60")}
      onClick={() => setPanel(panel === "people" ? null : "people")}
      aria-label={label}
      aria-pressed={panel === "people"}
      data-testid="presence-button"
      data-status={status}
      data-count={others.length}
    >
      {status === "unavailable" ? <WifiOffIcon aria-hidden="true" /> : <UsersRoundIcon aria-hidden="true" />}
      <span className="hidden -space-x-1.5 sm:flex rtl:space-x-reverse" aria-hidden="true">
        {others.slice(0, 3).map((p) => (
          <span key={p.id} className="grid size-5 place-items-center rounded-full border border-ink text-[10px] font-semibold text-ink" style={{ background: p.avatar.accent }}>
            {p.name.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </span>
      <span className="text-sm tabular-nums">{status === "online" ? others.length + 1 : ""}</span>
      <span className={cn("size-2 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
    </Button>
  );
}

/** Who is here, what they're doing, and shortcuts to reach them. */
export function PeopleSheet({ scene, actions, voiceSection }: { scene: SceneData; actions: RealtimeActions; voiceSection?: React.ReactNode }) {
  const t = useT();
  const panel = useMuseumStore((s) => s.panel);
  const setPanel = useMuseumStore((s) => s.setPanel);
  const status = useRealtimeStore((s) => s.status);
  const shared = useRealtimeStore((s) => s.shared);
  const following = useRealtimeStore((s) => s.following);
  const others = usePeers();
  const roomName = (peer: Peer) => {
    const id = latestPose(peer.id)?.room;
    return id ? scene.rooms.find((r) => r.id === id)?.name : undefined;
  };
  return (
    <Sheet open={panel === "people"} onOpenChange={(o) => !o && setPanel(null)} modal={false}>
      <SheetContent side="end" tone="dark" modal={false} closeLabel={t("common.close")} className="overflow-y-auto" data-hud-panel data-testid="people-panel">
        <SheetHeader>
          <SheetTitle>{t("museum.live.peopleTitle")}</SheetTitle>
          <SheetDescription className="text-ivory/60">{status === "online" ? t("museum.live.here", { count: others.length }) : t("museum.live.offlineHint")}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-5 pb-8">
          {voiceSection}
          <Button variant="glass" className="justify-self-start" onClick={actions.wave} disabled={status !== "online"} data-testid="wave">
            <HandIcon aria-hidden="true" />
            {t("museum.live.wave")}
          </Button>
          {shared && !following && (
            <div className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/10 p-3 text-sm">
              <span className="flex-1">{t("museum.live.sharedBanner", { name: shared.leaderName, title: photoTitle(scene, shared.photoId, t("museum.prompt.untitled")) ?? "" })}</span>
              <Button size="sm" variant="gold" onClick={actions.joinShared}>
                {t("museum.live.join")}
              </Button>
            </div>
          )}
          {others.length === 0 ? (
            <p className="text-sm text-ivory/60">{t("museum.live.peopleEmpty")}</p>
          ) : (
            <ul className="grid gap-2" data-testid="people-list">
              {others.map((p) => {
                const room = roomName(p);
                const viewing = photoTitle(scene, p.viewing, t("museum.prompt.untitled"));
                return (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3" data-testid="person">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full font-display text-lg text-ink"
                      style={{ background: p.avatar.accent, boxShadow: p.voice.speaking && !p.voice.muted ? `0 0 0 3px ${p.avatar.accent}55` : undefined }}
                      aria-hidden="true"
                    >
                      {p.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {p.name}
                        {p.guest && <span className="text-xs text-ivory/50">· {t("museum.live.guest")}</span>}
                        {p.voice.on && !p.voice.muted && <MicIcon className="size-3.5 text-gold" aria-label={t("museum.live.talking")} />}
                      </p>
                      <p className="truncate text-xs text-ivory/60">
                        {viewing ? t("museum.live.viewing", { title: viewing }) : room ? t("museum.live.inRoom", { room }) : t(`common.roles.${p.role}`)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="glass"
                      onClick={() => {
                        actions.goToPeer(p.id);
                        setPanel(null);
                      }}
                      disabled={!latestPose(p.id)}
                      data-testid="go-to-person"
                    >
                      <MapPinIcon aria-hidden="true" />
                      {t("museum.live.goTo")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Invitation to join someone's Look Together when not following it. */
export function SharedBanner({ scene, actions }: { scene: SceneData; actions: RealtimeActions }) {
  const t = useT();
  const shared = useRealtimeStore((s) => s.shared);
  const following = useRealtimeStore((s) => s.following);
  const dismissed = useRealtimeStore((s) => s.dismissedSharedId);
  const selfId = useRealtimeStore((s) => s.selfId);
  const viewerOpen = useMuseumStore((s) => Boolean(s.viewer));
  if (!shared || following || viewerOpen || shared.leaderId === selfId || dismissed === shared.id) return null;
  const title = photoTitle(scene, shared.photoId, t("museum.prompt.untitled")) ?? "";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-4">
      <div className="glass-dark pointer-events-auto flex max-w-xl items-center gap-3 rounded-full border border-gold/40 py-1.5 ps-4 pe-1.5 text-sm text-ivory shadow-xl" role="status" data-testid="shared-banner">
        <UsersRoundIcon className="size-4 shrink-0 text-gold" aria-hidden="true" />
        <span className="min-w-0 truncate">{t("museum.live.sharedBanner", { name: shared.leaderName, title })}</span>
        <Button size="sm" variant="gold" className="h-8" onClick={actions.joinShared} data-testid="shared-join">
          {t("museum.live.join")}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-ivory/70 hover:bg-white/10 hover:text-ivory" onClick={() => useRealtimeStore.setState({ dismissedSharedId: shared.id })}>
          {t("museum.live.dismiss")}
        </Button>
      </div>
    </div>
  );
}

/** Shown inside the photo viewer during a shared viewing. */
export function ViewerSharedBar({ actions }: { actions: RealtimeActions }) {
  const t = useT();
  const shared = useRealtimeStore((s) => s.shared);
  const following = useRealtimeStore((s) => s.following);
  const selfId = useRealtimeStore((s) => s.selfId);
  if (!shared || !following) return null;
  const leading = shared.leaderId === selfId;
  return (
    <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-full border border-gold/40 bg-gold/15 px-4 py-1.5 text-sm" role="status" data-testid="viewer-shared-bar" data-leading={leading}>
      <UsersRoundIcon className="size-4 shrink-0 text-gold" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        {leading ? t("museum.live.leading", { count: Math.max(0, shared.participants.length - 1) }) : t("museum.live.followingBar", { name: shared.leaderName })}
      </span>
      <Button size="sm" variant="glass" className="h-7" onClick={actions.leaveShared} data-testid="shared-leave">
        {leading ? t("museum.live.end") : t("museum.live.leave")}
      </Button>
    </div>
  );
}

/** Viewer actions: start Look Together and send reactions. */
export function ViewerLiveActions({ photoId, sequence, actions, canShare, canReact }: { photoId: string; sequence: string[]; actions: RealtimeActions; canShare: boolean; canReact: boolean }) {
  const t = useT();
  const status = useRealtimeStore((s) => s.status);
  const shared = useRealtimeStore((s) => s.shared);
  const following = useRealtimeStore((s) => s.following);
  const others = usePeers().length;
  const photo = useMuseumStore((s) => s.scene?.photos.find((p) => p.id === photoId));
  if (status !== "online" && !canReact) return null;
  return (
    <>
      {status === "online" && canShare && !following && others > 0 && (
        <Button size="sm" variant="gold" onClick={() => actions.startShared(photoId, sequence)} title={t("museum.live.lookTogetherHint")} data-testid="look-together" disabled={Boolean(shared)}>
          <UsersRoundIcon aria-hidden="true" />
          {t("museum.live.lookTogether")}
        </Button>
      )}
      {canReact && (
        <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/5 p-0.5" role="group" aria-label={t("museum.live.reactions")}>
          {REACTION_EMOJIS.map((e) => {
            const count = photo?.reactions[e] ?? 0;
            const mine = photo?.myReactions.includes(e) ?? false;
            return (
              <button
                key={e}
                type="button"
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center gap-1 rounded-full px-1.5 text-lg transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none",
                  mine && "bg-gold/25 ring-1 ring-gold/60",
                )}
                onClick={() => actions.react(photoId, e as ReactionEmoji)}
                aria-label={`${t("museum.live.react")} ${e}`}
                aria-pressed={mine}
                data-testid="reaction"
              >
                <span aria-hidden="true">{e}</span>
                {count > 0 && <span className="text-xs text-ivory/80 tabular-nums">{count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Reactions float up over the photograph for everyone looking at it. */
export function FloatingReactions({ photoId }: { photoId: string }) {
  const reactions = useRealtimeStore((s) => s.reactions);
  const mine = reactions.filter((r) => r.photoId === photoId);
  if (!mine.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {mine.map((r) => (
        <span
          key={r.key}
          className="absolute bottom-6 animate-[om-float_2.5s_ease-out_forwards] text-4xl drop-shadow-lg motion-reduce:animate-none"
          style={{ insetInlineStart: `${15 + ((r.key * 37) % 70)}%` }}
        >
          {r.emoji}
        </span>
      ))}
      <style>{`@keyframes om-float { 0% { transform: translateY(0) scale(.6); opacity: 0 } 15% { opacity: 1; transform: translateY(-30px) scale(1.1) } 100% { transform: translateY(-260px) scale(1); opacity: 0 } }`}</style>
    </div>
  );
}

/**
 * Name tags for everyone else, positioned over their avatars every frame by
 * NameTagProjector inside the canvas.
 */
export function NameTags({ scene }: { scene: SceneData }) {
  const t = useT();
  const others = usePeers();
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden="true">
      {others.map((p) => {
        const speaking = p.voice.on && !p.voice.muted && p.voice.speaking;
        const viewing = photoTitle(scene, p.viewing, t("museum.prompt.untitled"));
        return (
          <div
            key={p.id}
            ref={(el) => {
              if (el) tagElements.set(p.id, el);
              else tagElements.delete(p.id);
            }}
            className="absolute top-0 left-0 flex max-w-64 origin-bottom items-center gap-1.5 rounded-full border border-white/15 bg-ink/75 py-1 ps-1.5 pe-3 text-xs whitespace-nowrap text-ivory opacity-0 shadow-lg backdrop-blur transition-opacity duration-200"
            style={{ transform: "translate(-9999px, -9999px)" }}
            data-testid="name-tag"
            data-peer={p.userId}
          >
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full font-semibold text-ink"
              style={{ background: p.avatar.accent, boxShadow: speaking ? `0 0 0 3px ${p.avatar.accent}66` : undefined }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate font-medium">{p.name}</span>
            {speaking && <MicIcon className="size-3.5 text-gold" />}
            {viewing && (
              <span className="flex min-w-0 items-center gap-1 text-ivory/70">
                <EyeIcon className="size-3.5 shrink-0" />
                <span className="truncate">{viewing}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Offer to join a guided tour someone else is leading. */
export function TourBanner({ scene, actions }: { scene: SceneData; actions: RealtimeActions }) {
  const t = useT();
  const tour = useRealtimeStore((s) => s.tour);
  const selfId = useRealtimeStore((s) => s.selfId);
  const dismissed = useRealtimeStore((s) => s.dismissedTourId);
  const local = useMuseumStore((s) => s.tour);
  const viewerOpen = useMuseumStore((s) => Boolean(s.viewer));
  if (!tour || tour.leaderId === selfId || dismissed === tour.id || viewerOpen) return null;
  if (local?.mode === "following" && local.tourId === tour.tourId) return null;
  const name = scene.tours.find((x) => x.id === tour.tourId)?.name ?? "";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-32 z-30 flex justify-center px-4">
      <div className="glass-dark pointer-events-auto flex max-w-xl items-center gap-3 rounded-full border border-gold/40 py-1.5 ps-4 pe-1.5 text-sm text-ivory shadow-xl" role="status" data-testid="tour-banner">
        <UsersRoundIcon className="size-4 shrink-0 text-gold" aria-hidden="true" />
        <span className="min-w-0 truncate">{t("museum.tours.banner", { name: tour.leaderName, tour: name })}</span>
        <Button size="sm" variant="gold" className="h-8" onClick={actions.joinTour} data-testid="tour-join">
          {t("museum.tours.join")}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-ivory/70 hover:bg-white/10 hover:text-ivory" onClick={() => useRealtimeStore.setState({ dismissedTourId: tour.id })}>
          {t("museum.live.dismiss")}
        </Button>
      </div>
    </div>
  );
}
