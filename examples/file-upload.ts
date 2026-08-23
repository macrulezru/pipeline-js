/**
 * `RestRequestConfig` extends axios's own `AxiosRequestConfig`, so `data` can
 * be a `FormData`/`Blob`/`ArrayBuffer` and `onUploadProgress`/
 * `onDownloadProgress` are already typed and wired through on the default
 * (axios) transport — no extra config needed.
 */
import { createRestClient } from "rest-pipeline-js";

export const client = createRestClient({ baseURL: "https://api.example.com" });

export async function uploadWithProgress(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return client.post("/upload", formData, {
    onUploadProgress: (event) => {
      const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
      console.log(`Uploaded ${percent}% (${event.loaded}/${event.total ?? "?"} bytes)`);
    },
  });
}

export async function downloadWithProgress(url: string) {
  return client.get(url, {
    responseType: "blob",
    onDownloadProgress: (event) => {
      console.log(`Received ${event.loaded} bytes${event.total ? ` of ${event.total}` : ""}`);
    },
  });
}

/**
 * A custom `HttpAdapter` (see `edge-fetch-adapter.ts`) receives
 * `onUploadProgress`/`onDownloadProgress` in its `config` unchanged, but must
 * call them itself — `fetch` has no native upload-progress event, so
 * implementing it requires a `ReadableStream` wrapping the request body (only
 * supported by some runtimes for request bodies) or falling back to
 * `XMLHttpRequest` where available. Sketch for a runtime that supports
 * streaming request bodies:
 */
import type { HttpAdapter, RestRequestConfig, ApiResponse } from "rest-pipeline-js";

const fetchAdapterWithUploadProgress: HttpAdapter = {
  async request<T>(config: RestRequestConfig & { baseURL?: string }): Promise<ApiResponse<T>> {
    const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
    let body: BodyInit | undefined = config.data as BodyInit | undefined;

    if (body instanceof Blob && config.onUploadProgress) {
      const total = body.size;
      let loaded = 0;
      const reader = body.stream().getReader();
      const onUploadProgress = config.onUploadProgress;

      body = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          loaded += value.byteLength;
          const progressEvent: Parameters<NonNullable<RestRequestConfig["onUploadProgress"]>>[0] = {
            loaded,
            total,
            bytes: value.byteLength,
            lengthComputable: true,
          };
          onUploadProgress(progressEvent);
          controller.enqueue(value);
        },
      });
    }

    const res = await fetch(url, {
      method: config.method ?? "GET",
      headers: config.headers as Record<string, string> | undefined,
      body,
      // @ts-expect-error — required by some runtimes when streaming a request body
      duplex: body instanceof ReadableStream ? "half" : undefined,
      signal: config.signal as AbortSignal | undefined,
    });

    const data = (await res.json().catch(() => undefined)) as T;
    return { data, status: res.status, statusText: res.statusText, headers: {} };
  },
};

export const edgeUploadClient = createRestClient({
  baseURL: "https://api.example.com",
  adapter: fetchAdapterWithUploadProgress,
});
