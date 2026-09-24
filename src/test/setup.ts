import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom lacks matchMedia (used by shadcn/radix + sonner in some trees)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// PocketBase client requires an env URL at import time; unit tests never hit
// the network (pb.collection is mocked per-test), so default it here.
if (!import.meta.env.VITE_POCKETBASE_URL) {
  vi.stubEnv("VITE_POCKETBASE_URL", "http://127.0.0.1:8090");
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
