import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
const auth = vi.mocked(useAuth);

function renderAt(path: string, allowedRoles?: ("admin" | "cashier")[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/dashboard" element={<div>dashboard page</div>} />
        <Route
          path="/secret"
          element={
            <ProtectedRoute allowedRoles={allowedRoles as never}>
              <div>secret content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute (AUTH-04 / RBAC-01)", () => {
  it("shows spinner while loading", () => {
    auth.mockReturnValue({ user: null, profile: null, loading: true, signOut: vi.fn() } as never);
    const { container } = renderAt("/secret");
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("redirects unauthenticated users to /login", () => {
    auth.mockReturnValue({ user: null, profile: null, loading: false, signOut: vi.fn() } as never);
    renderAt("/secret");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("redirects wrong-role users to /dashboard", () => {
    auth.mockReturnValue({
      user: { id: "u1" },
      profile: { id: "u1", full_name: "C", role: "cashier" },
      loading: false,
      signOut: vi.fn(),
    } as never);
    renderAt("/secret", ["admin"]);
    expect(screen.getByText("dashboard page")).toBeInTheDocument();
  });

  it("renders children for allowed role", () => {
    auth.mockReturnValue({
      user: { id: "u1" },
      profile: { id: "u1", full_name: "A", role: "admin" },
      loading: false,
      signOut: vi.fn(),
    } as never);
    renderAt("/secret", ["admin"]);
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  it("denies by default when profile is missing (RBAC-05 hole fix)", () => {
    // Authenticated user with slow/missing profile must NOT slip through a
    // role guard — deny to /dashboard until the profile resolves.
    auth.mockReturnValue({ user: { id: "u1" }, profile: null, loading: false, signOut: vi.fn() } as never);
    renderAt("/secret", ["admin"]);
    expect(screen.getByText("dashboard page")).toBeInTheDocument();
  });
});
