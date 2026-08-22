/**
 * `WebSocketStageConfig` runs a stage over a persistent WebSocket connection
 * instead of a single HTTP request/response — good for chat/presence feeds,
 * live order books, collaborative editing events, etc. Messages returned by
 * `onMessage` are collected into the stage's `data` array (same pattern as
 * `StreamStageConfig`'s chunks), and `onChunk` fires per message in real time.
 *
 * `createWebSocket` defaults to `globalThis.WebSocket` (browsers, Deno,
 * Node ≥22) — pass it explicitly for Node <22 via the `ws` package, or any
 * other transport.
 */
import { pipe } from "rest-pipeline-js";

interface ChatMessage {
  from: string;
  text: string;
}

const orchestrator = pipe()
  .step({ key: "auth", request: async (): Promise<string> => "auth-token-abc" })
  .websocket<ChatMessage>({
    key: "chatFeed",
    url: ({ prev }) => `wss://chat.example.com/rooms/general?token=${prev}`,

    // Node <22 (no global WebSocket) — swap in the `ws` package instead:
    // createWebSocket: (url, protocols) => new (await import("ws")).WebSocket(url, protocols),

    onOpen: () => {
      console.log("Connected to chat feed");
    },

    onMessage: (data) => {
      const parsed = JSON.parse(data as string) as ChatMessage;
      return parsed;
    },

    onChunk: (message, sharedData) => {
      // Fires per message, in real time — e.g. append to a UI list.
      const history = (sharedData.chatHistory as ChatMessage[] | undefined) ?? [];
      sharedData.chatHistory = [...history, message];
    },

    // Stop once we see a "goodbye" message from the server — closes the
    // socket and resolves the stage successfully with everything collected
    // so far, instead of waiting for the server to close the connection.
    closeOn: (message) => message.text === "__end__",

    onClose: ({ code, reason, wasClean }) => {
      console.log(`Chat feed closed (clean=${wasClean}, code=${code}, reason=${reason})`);
    },

    onError: (error) => {
      // Fires on the 'error' event; doesn't by itself fail the stage — the
      // final close event (wasClean) decides success/error. Log/report here.
      console.error("Chat feed error:", error);
    },

    // Overall connection timeout — closes the socket and fails the stage if
    // it fires before a clean close happens on its own.
    timeoutMs: 5 * 60_000,
  })
  .step({
    key: "summarize",
    request: async ({ allResults }) => {
      const messages = allResults.chatFeed.data as ChatMessage[];
      return `Received ${messages.length} messages`;
    },
  })
  .build();

async function main() {
  const result = await orchestrator.run();
  if (result.success) {
    console.log(result.stageResults.summarize.data);
  } else {
    console.error("Pipeline failed:", result.stageResults.chatFeed.error);
  }
}

void main;
