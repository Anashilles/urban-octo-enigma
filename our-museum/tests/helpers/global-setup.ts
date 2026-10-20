import { execSync } from "node:child_process";
import "./test-env";

/** Applies all migrations to the test database once before the run. */
export default function setup() {
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env });
}
