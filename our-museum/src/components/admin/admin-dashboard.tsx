"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2Icon, Loader2Icon, RefreshCwIcon, WrenchIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";
import { api, errorKey } from "@/lib/api/client";
import type { Diagnostics } from "@/services/admin-service";

type CheckKey = keyof Diagnostics["checks"];

export function AdminDashboard({ initial }: { initial: Diagnostics }) {
  const { t, formatDate, formatNumber } = useI18n();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState<"refresh" | "maintenance" | null>(null);

  const refresh = async () => {
    setBusy("refresh");
    try {
      setD(await api<Diagnostics>("/api/admin/diagnostics"));
    } catch (e) {
      toast.error(t(errorKey(e)));
    } finally {
      setBusy(null);
    }
  };
  const maintenance = async () => {
    setBusy("maintenance");
    try {
      const r = await api<{ abandoned: number; deleted: number; failed: number }>("/api/admin/maintenance", { method: "POST" });
      toast.success(t("admin.maintenanceDone", { abandoned: r.abandoned, deleted: r.deleted, failed: r.failed }));
      await refresh();
    } catch (e) {
      toast.error(t(errorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-5 py-10 sm:px-8" data-testid="admin-dashboard">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl font-medium">{t("admin.title")}</h1>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {t("admin.generated", { time: formatDate(d.generatedAt, { dateStyle: "medium", timeStyle: "medium" }) })}
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={busy !== null}>
          {busy === "refresh" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <RefreshCwIcon aria-hidden="true" />}
          {t("admin.refresh")}
        </Button>
        <Button variant="gold" onClick={() => void maintenance()} disabled={busy !== null}>
          {busy === "maintenance" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <WrenchIcon aria-hidden="true" />}
          {t("admin.runMaintenance")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(d.checks) as CheckKey[]).map((k) => {
          const c = d.checks[k];
          return (
            <Card key={k} data-testid={`admin-check-${k}`} data-ok={c.ok}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {c.ok ? <CheckCircle2Icon className="size-5 text-sage" aria-hidden="true" /> : <XCircleIcon className="size-5 text-destructive" aria-hidden="true" />}
                  {t(`admin.checks.${k}`)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>{c.ok ? t("admin.ok", { ms: c.ms }) : t("admin.failed")}</p>
                {c.detail && <p className="mt-1 break-words">{c.detail}</p>}
                {k === "realtime" && c.ok && "connections" in c && (
                  <p className="mt-1">{t("admin.realtimeLoad", { rooms: c.rooms ?? 0, connections: c.connections ?? 0 })}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.countsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
            {Object.entries(d.counts).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{t(`admin.counts.${k as keyof Diagnostics["counts"]}`)}</dt>
                <dd className="font-display text-2xl tabular-nums">{formatNumber(v)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.configTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              {Object.entries(d.config).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate font-mono text-xs" dir="ltr">
                    {String(v)}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">node / uptime / rss</dt>
                <dd className="font-mono text-xs" dir="ltr">
                  {d.process.node} · {Math.round(d.process.uptimeSeconds / 60)} min · {d.process.rssMb} MB
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("admin.rateLimited")}</dt>
                <dd className="font-mono text-xs" dir="ltr">
                  {JSON.stringify(d.rateLimits.blocked)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.eventsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 text-sm">
              {d.recentEvents.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="font-mono text-xs" dir="ltr">
                    {e.type}
                  </span>
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatDate(e.at, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
