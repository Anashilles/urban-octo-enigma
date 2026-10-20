// `server-only` throws outside React Server Components; tests import server modules directly.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
