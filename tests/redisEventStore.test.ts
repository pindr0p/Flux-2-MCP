import { describe, expect, it, vi } from "vitest";

import {
  buildRedisStreamKey,
  formatRedisEventId,
  parseRedisEventId,
  RedisEventStore
} from "../src/http/redisEventStore.js";

describe("RedisEventStore", () => {
  it("encodes and decodes Redis-backed event IDs", () => {
    const eventId = formatRedisEventId(
      "session:alpha/stream",
      "1716495952740-0"
    );

    expect(parseRedisEventId(eventId)).toEqual({
      streamId: "session:alpha/stream",
      redisEntryId: "1716495952740-0"
    });
    expect(parseRedisEventId("invalid-event-id")).toBeUndefined();
  });

  it("stores events with bounded retention and TTL", async () => {
    const xAdd = vi.fn().mockResolvedValue("1716495952740-0");
    const expire = vi.fn().mockResolvedValue(1);
    const eventStore = new RedisEventStore(
      {
        xAdd,
        expire
      } as never,
      {
        redisUrl: "redis://redis:6379/0",
        retryIntervalMs: 1000,
        eventTtlSeconds: 3600,
        maxEventsPerStream: 1000,
        keyPrefix: "flux:mcp:sse"
      }
    );

    const eventId = await eventStore.storeEvent("stream-1", {
      jsonrpc: "2.0",
      method: "notifications/message",
      params: {
        level: "info",
        data: "hello"
      }
    });

    expect(eventId).toBe(formatRedisEventId("stream-1", "1716495952740-0"));
    expect(xAdd).toHaveBeenCalledWith(
      buildRedisStreamKey("flux:mcp:sse", "stream-1"),
      "*",
      {
        message: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/message",
          params: {
            level: "info",
            data: "hello"
          }
        })
      },
      {
        TRIM: {
          strategy: "MAXLEN",
          strategyModifier: "~",
          threshold: 1000
        }
      }
    );
    expect(expire).toHaveBeenCalledWith(
      buildRedisStreamKey("flux:mcp:sse", "stream-1"),
      3600
    );
  });

  it("replays retained events after the last seen event", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const xRange = vi.fn().mockResolvedValue([
      {
        id: "1716495952741-0",
        message: {
          message: JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/message",
            params: {
              level: "info",
              data: "resumed"
            }
          })
        }
      }
    ]);
    const eventStore = new RedisEventStore(
      {
        xRange
      } as never,
      {
        redisUrl: "redis://redis:6379/0",
        retryIntervalMs: 1000,
        eventTtlSeconds: 3600,
        maxEventsPerStream: 1000,
        keyPrefix: "flux:mcp:sse"
      }
    );

    const streamId = await eventStore.replayEventsAfter(
      formatRedisEventId("stream-1", "1716495952740-0"),
      { send }
    );

    expect(streamId).toBe("stream-1");
    expect(xRange).toHaveBeenCalledWith(
      buildRedisStreamKey("flux:mcp:sse", "stream-1"),
      "(1716495952740-0",
      "+",
      {
        COUNT: 1000
      }
    );
    expect(send).toHaveBeenCalledWith(
      formatRedisEventId("stream-1", "1716495952741-0"),
      {
        jsonrpc: "2.0",
        method: "notifications/message",
        params: {
          level: "info",
          data: "resumed"
        }
      }
    );
  });
});