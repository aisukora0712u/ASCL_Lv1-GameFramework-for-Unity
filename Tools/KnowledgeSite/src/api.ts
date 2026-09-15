import type { RequestContext, Snapshot } from "../shared/model.ts";
export type Session = {
  token: string;
  epoch: string;
  instanceId: string;
  root: string;
  installationId: string;
};
export let session: Session;
export async function connect() {
  session = await get<Session>("/session");
  return session;
}
export async function get<T>(url: string): Promise<T> {
  const res = await fetch("/api" + url);
  const value = await res.json();
  if (!res.ok) throw Object.assign(new Error(value.message), value);
  return value;
}
export function context(baseline: string | null = null): RequestContext {
  return { operationId: crypto.randomUUID(), epoch: session.epoch, baseline };
}
export async function send(url: string, payload: any = {}, ctx = context()) {
  const res = await fetch("/api" + url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ASCL-Token": session.token,
    },
    body: JSON.stringify({ ...payload, context: ctx }),
  });
  const value = await res.json();
  if (!res.ok) throw Object.assign(new Error(value.message), value);
  return value;
}
export async function backup() {
  const res = await fetch("/api/backup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ASCL-Token": session.token,
    },
    body: JSON.stringify({ context: context() }),
  });
  if (!res.ok) throw new Error((await res.json()).message);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `ASCL-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function restore(file: File) {
  const res = await fetch("/api/restore", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-ASCL-Token": session.token,
      "X-ASCL-Context": JSON.stringify(context()),
    },
    body: file,
  });
  const value = await res.json();
  if (!res.ok) throw new Error(value.message);
  return value;
}
export async function upload(
  file: File,
  description: string,
  previous?: string,
) {
  if (file.size > 50 * 1024 * 1024) throw new Error("附件不能超过 50 MiB");
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  return send("/attachments", {
    base64: data,
    name: file.name,
    description,
    previous,
  });
}
export const snapshot = () => get<Snapshot>("/snapshot");
