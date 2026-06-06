import type { Graph, MachineInfo, SnapResponse } from "./types";

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

async function postForm(url: string, body: Record<string, string>): Promise<SnapResponse> {
  const r = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as SnapResponse;
}

export const api = {
  machines: () => getJSON<MachineInfo[]>("/api/machines"),
  graph: (name: string) => getJSON<Graph>(`/m/${encodeURIComponent(name)}/graph`),
  describe: (name: string) => getJSON<unknown>(`/m/${encodeURIComponent(name)}/describe`),

  send: (name: string, event: string) =>
    postForm(`/sim/${encodeURIComponent(name)}/send`, { event }),
  timer: (name: string, id: string) =>
    postForm(`/sim/${encodeURIComponent(name)}/timer`, { id }),
  resolve: (name: string, id: string, output: string) =>
    postForm(`/sim/${encodeURIComponent(name)}/invoke`, { id, action: "resolve", output }),
  reject: (name: string, id: string, error: string) =>
    postForm(`/sim/${encodeURIComponent(name)}/invoke`, { id, action: "reject", error }),
  reset: (name: string) => postForm(`/sim/${encodeURIComponent(name)}/reset`, {}),
  undo: (name: string) => postForm(`/sim/${encodeURIComponent(name)}/undo`, {}),

  async importSnapshot(name: string, body: string): Promise<SnapResponse> {
    const r = await fetch(`/sim/${encodeURIComponent(name)}/import`, {
      method: "POST",
      credentials: "same-origin",
      body,
    });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()) as SnapResponse;
  },

  exportURL: (name: string) => `/sim/${encodeURIComponent(name)}/export`,

  // onGraphChanged opens the server-global /events SSE stream and invokes cb
  // with the affected machine name whenever a watched snapshot is hot-reloaded.
  // Returns an unsubscribe function. Used by the snapshot viewer for live reload.
  onGraphChanged(cb: (name: string) => void): () => void {
    const es = new EventSource("/events", { withCredentials: true });
    es.addEventListener("graph-changed", (e) => cb((e as MessageEvent).data as string));
    return () => es.close();
  },
};
