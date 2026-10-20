"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { ApiError, api, errorKey } from "@/lib/api/client";

/** Accepts an email invitation addressed to the signed-in (verified) user. */
export function AcceptInvitationButton({ invitationId, museumId }: { invitationId: string; museumId: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="gold"
      size="sm"
      disabled={busy}
      data-testid="accept-pending-invitation"
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/me/invitations/${invitationId}/accept`, { method: "POST" });
          toast.success(t("dashboard.inviteAccepted"));
          router.push(`/museum/${museumId}`);
        } catch (e) {
          toast.error(e instanceof ApiError && e.code === "FORBIDDEN" ? e.message : t(errorKey(e)));
          setBusy(false);
        }
      }}
    >
      {busy && <Loader2Icon className="animate-spin" aria-hidden="true" />}
      {t("dashboard.acceptInvite")}
    </Button>
  );
}
