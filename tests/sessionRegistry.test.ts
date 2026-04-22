import { describe, expect, it } from "vitest";

import { SessionRegistry } from "../src/http/sessionRegistry.js";

describe("SessionRegistry", () => {
  it("touches and reaps idle sessions", () => {
    const registry = new SessionRegistry<string>();

    registry.set("active", "session-a", 1_000);
    registry.set("idle", "session-b", 1_000);
    registry.touch("active", 2_200);

    const expired = registry.reapIdle(500, 2_600);

    expect(expired).toEqual([["idle", "session-b"]]);
    expect(registry.get("active")).toBe("session-a");
    expect(registry.get("idle")).toBeUndefined();
  });
});