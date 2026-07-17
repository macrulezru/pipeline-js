/**
 * `StreamStageConfig` consumes an `AsyncIterable<T>` (e.g. Server-Sent Events,
 * a chat completion stream) chunk by chunk, calling `onChunk` in real time and
 * collecting everything into the stage's `data` array once the stream ends.
 * It honors `abort()` and standard step events (`step:<key>:start/progress/success/error`)
 * just like a regular stage.
 */
import { pipe } from "rest-pipeline-js";

/** Turns a `fetch` SSE response into an AsyncIterable of decoded event payloads. */
async function* sseEvents(url: string, signal: AbortSignal): AsyncIterable<string> {
  const res = await fetch(url, { headers: { Accept: "text/event-stream" }, signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data:"));
        if (dataLine) yield dataLine.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const orchestrator = pipe()
  .stream<string>({
    key: "chatTokens",
    stream: ({ signal }) => sseEvents("https://api.example.com/chat/stream", signal),
    onChunk: (token, sharedData) => {
      // Fires per-token, before the stream finishes — e.g. append to a UI buffer.
      sharedData.partialReply = (sharedData.partialReply ?? "") + token;
    },
  })
  .build({ httpConfig: { baseURL: "https://api.example.com" } });

async function main() {
  const unsubscribe = orchestrator.on("step:chatTokens:progress", (payload) => {
    if (payload && typeof payload === "object" && "chunk" in payload) {
      // Written this way (rather than importing `process`) so the example
      // type-checks in both Node and browser/edge environments.
      (globalThis as { process?: { stdout?: { write?: (s: string) => void } } }).process
        ?.stdout?.write?.(String(payload.chunk));
    }
  });

  const result = await orchestrator.run();
  unsubscribe();

  if (result.success) {
    const allTokens = result.stageResults.chatTokens.data as string[];
    console.log("\nFull reply:", allTokens.join(""));
  }
}

void main;
