import { describe, expect, it, vi } from "vitest";
import { refreshCoordinatorWorkspace } from "./coordinatorSession";

describe("refreshCoordinatorWorkspace", () => {
  it("refreshes access, scopes, and submissions after a successful coordinator account creation", async () => {
    const access = vi.fn().mockResolvedValue({ data: { id: 1 } });
    const scopes = vi.fn().mockResolvedValue({ data: [{ id: 2 }] });
    const submissions = vi.fn().mockResolvedValue({ data: [] });
    await refreshCoordinatorWorkspace([access, scopes, submissions]);
    expect(access).toHaveBeenCalledOnce();
    expect(scopes).toHaveBeenCalledOnce();
    expect(submissions).toHaveBeenCalledOnce();
  });
});
