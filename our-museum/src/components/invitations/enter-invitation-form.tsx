"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";

/** Accepts a full invitation URL or a bare token and opens /invite/[token]. */
export function extractInvitationToken(value: string): string | null {
  const v = value.trim();
  const match = v.match(/(?:\/invite\/)?([A-Za-z0-9_-]{43})(?:[/?#].*)?$/);
  return match?.[1] ?? null;
}

export function EnterInvitationForm() {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const token = extractInvitationToken(value);
        if (!token) {
          setError(t("invite.enterInvalid"));
          return;
        }
        router.push(`/invite/${token}`);
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="invitation">{t("invite.enterLabel")}</Label>
        <Input
          id="invitation"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "invitation-error" : undefined}
          data-testid="invitation-input"
        />
        {error && (
          <p id="invitation-error" className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" data-testid="invitation-continue">
        {t("invite.enterSubmit")}
      </Button>
    </form>
  );
}
