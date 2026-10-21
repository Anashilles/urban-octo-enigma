import { apiHandler, limit } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/auth/session";
import { getLocale } from "@/i18n/server";
import { exportMuseum } from "@/services/export-service";

type Params = { museumId: string };

/** Owner-only ZIP download: original photos, museum.json and an offline index.html. */
export const GET = apiHandler<Params>(async (req, { museumId }) => {
  const user = await requireApiUser(req.headers);
  limit(user.id, "export");
  const { stream, filename } = await exportMuseum(user.id, museumId, await getLocale());
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  return new Response(stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
