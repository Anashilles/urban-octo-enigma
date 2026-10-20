import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // react-server resolves "server-only" to its no-op build outside Next.js.
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` (part of the build) needs no database; migrate/seed do.
    url: process.env.DATABASE_URL ?? "postgresql://unset:5432/set-DATABASE_URL",
  },
});
