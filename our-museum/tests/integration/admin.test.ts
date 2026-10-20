import { beforeEach, describe, expect, it } from "vitest";
import { createMuseum } from "@/services/museum-service";
import { getDiagnostics, runMaintenance } from "@/services/admin-service";
import { createUser, resetDatabase } from "../helpers/factories";

describe("admin diagnostics", () => {
  beforeEach(resetDatabase);

  it("reports health, totals and configuration without secrets", async () => {
    const owner = await createUser("Owner");
    await createUser("Guest", { isAnonymous: true });
    await createMuseum(owner, { name: "Ours", description: "", templateId: "warm-romantic" }, "en");
    const d = await getDiagnostics();
    expect(d.checks.database.ok).toBe(true);
    expect(d.checks.storage.ok).toBe(true);
    // The test environment points the realtime service at a closed port.
    expect(d.checks.realtime.ok).toBe(false);
    expect(d.counts).toMatchObject({ users: 1, guests: 1, museums: 1, photos: 0 });
    expect(d.recentEvents[0]?.type).toBe("museum.created");
    const text = JSON.stringify(d);
    for (const secret of [process.env.BETTER_AUTH_SECRET, process.env.STORAGE_SIGNING_SECRET, process.env.REALTIME_TICKET_SECRET, process.env.CRON_SECRET]) {
      expect(text).not.toContain(secret!);
    }
    expect(text).not.toContain(owner.email);
  });

  it("runs maintenance on demand", async () => {
    expect(await runMaintenance()).toMatchObject({ abandoned: 0, deleted: 0, failed: 0 });
  });
});
