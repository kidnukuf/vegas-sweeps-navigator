import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("advertisingProspects Owner access", () => {
  it("rejects an authenticated non-Owner before reading prospect research", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: 987,
        openId: "ordinary-user",
        name: "Ordinary User",
        email: "ordinary@example.com",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} },
      res: {},
    } as TrpcContext);

    await expect(caller.advertisingProspects.list({ eventId: 1980003 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
