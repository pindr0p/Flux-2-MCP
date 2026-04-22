import type {
  EventId,
  EventStore,
  StreamId
} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "redis";

import type { FluxServerConfig } from "../config.js";
import type { FluxLogger } from "../util/logging.js";

const STREAM_MESSAGE_FIELD = "message";

type ResumableStreamConfig = NonNullable<
  FluxServerConfig["http"]["resumableStreams"]
>;

export interface ResumableStreamSupport {
  eventStore: EventStore;
  retryIntervalMs: number;
  close(): Promise<void>;
}

interface RedisStreamEntry {
  id: string;
  message: Record<string, unknown>;
}

interface RedisEventStoreClient {
  xAdd(
    key: string,
    id: string,
    message: Record<string, string>,
    options: {
      TRIM: {
        strategy: "MAXLEN";
        strategyModifier: "~";
        threshold: number;
      };
    }
  ): Promise<string>;
  expire(key: string, seconds: number): Promise<unknown>;
  xRange(
    key: string,
    start: string,
    end: string,
    options: {
      COUNT: number;
    }
  ): Promise<RedisStreamEntry[]>;
}

export class RedisEventStore implements EventStore {
  constructor(
    private readonly client: RedisEventStoreClient,
    private readonly config: ResumableStreamConfig
  ) {}

  async storeEvent(
    streamId: StreamId,
    message: JSONRPCMessage
  ): Promise<EventId> {
    const streamKey = buildRedisStreamKey(this.config.keyPrefix, streamId);
    const redisEntryId = await this.client.xAdd(
      streamKey,
      "*",
      {
        [STREAM_MESSAGE_FIELD]: JSON.stringify(message)
      },
      {
        TRIM: {
          strategy: "MAXLEN",
          strategyModifier: "~",
          threshold: this.config.maxEventsPerStream
        }
      }
    );

    await this.client.expire(streamKey, this.config.eventTtlSeconds);

    return formatRedisEventId(streamId, redisEntryId);
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return parseRedisEventId(eventId)?.streamId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    const parsedEventId = parseRedisEventId(lastEventId);
    if (!parsedEventId) {
      throw new Error(`Unsupported Redis event ID format: ${lastEventId}`);
    }

    const streamKey = buildRedisStreamKey(
      this.config.keyPrefix,
      parsedEventId.streamId
    );
    const entries = await this.client.xRange(
      streamKey,
      `(${parsedEventId.redisEntryId}`,
      "+",
      {
        COUNT: this.config.maxEventsPerStream
      }
    );

    for (const entry of entries) {
      const message = parseRedisEventMessage(entry.message[STREAM_MESSAGE_FIELD]);
      await send(formatRedisEventId(parsedEventId.streamId, entry.id), message);
    }

    return parsedEventId.streamId;
  }
}

export async function createRedisResumableStreamSupport(
  config: FluxServerConfig["http"]["resumableStreams"],
  logger: FluxLogger
): Promise<ResumableStreamSupport | undefined> {
  if (!config) {
    logger.info("Redis resumable streams are disabled; FLUX_REDIS_URL is not configured.");
    return undefined;
  }

  const client = createClient({
    url: config.redisUrl,
    socket: {
      connectTimeout: 3000
    }
  });

  client.on("error", (error) => {
    logger.warn({ error }, "Redis client error while serving resumable streams.");
  });

  try {
    await client.connect();
  } catch (error) {
    logger.warn(
      {
        error,
        redisUrl: redactRedisUrl(config.redisUrl)
      },
      "Redis is unavailable; FLUX MCP will start without resumable streams."
    );

    if (client.isOpen) {
      await client.close();
    }

    return undefined;
  }

  logger.info(
    {
      redisUrl: redactRedisUrl(config.redisUrl),
      keyPrefix: config.keyPrefix,
      retryIntervalMs: config.retryIntervalMs,
      eventTtlSeconds: config.eventTtlSeconds,
      maxEventsPerStream: config.maxEventsPerStream
    },
    "Enabled Redis-backed resumable Streamable HTTP events."
  );

  return {
    eventStore: new RedisEventStore(client, config),
    retryIntervalMs: config.retryIntervalMs,
    async close() {
      if (client.isOpen) {
        await client.close();
      }
    }
  };
}

export function buildRedisStreamKey(
  keyPrefix: string,
  streamId: StreamId
): string {
  return `${keyPrefix}:stream:${encodeStreamId(streamId)}`;
}

export function formatRedisEventId(
  streamId: StreamId,
  redisEntryId: string
): EventId {
  return `${encodeStreamId(streamId)}:${redisEntryId}`;
}

export function parseRedisEventId(
  eventId: EventId
): { streamId: StreamId; redisEntryId: string } | undefined {
  const delimiterIndex = eventId.indexOf(":");
  if (delimiterIndex <= 0 || delimiterIndex >= eventId.length - 1) {
    return undefined;
  }

  const encodedStreamId = eventId.slice(0, delimiterIndex);
  const redisEntryId = eventId.slice(delimiterIndex + 1);

  try {
    return {
      streamId: decodeStreamId(encodedStreamId),
      redisEntryId
    };
  } catch {
    return undefined;
  }
}

function encodeStreamId(streamId: StreamId): string {
  return Buffer.from(streamId, "utf8").toString("base64url");
}

function decodeStreamId(encodedStreamId: string): string {
  return Buffer.from(encodedStreamId, "base64url").toString("utf8");
}

function parseRedisEventMessage(rawValue: unknown): JSONRPCMessage {
  if (rawValue === undefined) {
    throw new Error("Redis stream entry is missing the stored JSON-RPC payload.");
  }

  const serializedMessage = Buffer.isBuffer(rawValue)
    ? rawValue.toString("utf8")
    : String(rawValue);

  return JSON.parse(serializedMessage) as JSONRPCMessage;
}

function redactRedisUrl(redisUrl: string): string {
  try {
    const parsedUrl = new URL(redisUrl);
    if (parsedUrl.password) {
      parsedUrl.password = "***";
    }

    return parsedUrl.toString();
  } catch {
    return "[invalid redis url]";
  }
}