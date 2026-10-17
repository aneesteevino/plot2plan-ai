"use client";
import type { DesignVersion, Project, ProjectInput, VersionInput } from "../schema";

/**
 * Storage façade. Uses the MongoDB-backed API when the server reports a database
 * connection; otherwise falls back to this browser's localStorage and says so in the UI.
 */
export type StorageMode = "cloud" | "local";

export interface Status {
  db: "connected" | "not-configured" | "error";
  ai: { configured: boolean; visionModel: string; textModel: string };
}

let statusPromise: Promise<Status> | null = null;
export function getStatus(): Promise<Status> {
  statusPromise ??= fetch("/api/status", { cache: "no-store" })
    .then((r) => r.json() as Promise<Status>)
    .catch(() => ({ db: "error", ai: { configured: false, visionModel: "", textModel: "" } }) as Status);
  return statusPromise;
}

export async function storageMode(): Promise<StorageMode> {
  return (await getStatus()).db === "connected" ? "cloud" : "local";
}

export class StoreError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  } catch {
    throw new StoreError("NETWORK", "Could not reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new StoreError(body?.error?.code ?? "HTTP_" + res.status, body?.error?.message ?? "Request failed.");
  return body as T;
}

// ---------- local fallback ----------

const LS_PROJECTS = "p2p.projects.v1";
const LS_VERSIONS = "p2p.versions.v1";

function lsRead<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsWrite(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    throw new StoreError("LOCAL_STORAGE_FULL", "Browser storage is full or blocked. Export your project as JSON to keep it.");
  }
}
const now = () => new Date().toISOString();

const local = {
  list(): Project[] {
    return lsRead<Project[]>(LS_PROJECTS, []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  get(id: string): Project {
    const p = local.list().find((x) => x.id === id);
    if (!p) throw new StoreError("NOT_FOUND", "Project not found in this browser.");
    return p;
  },
  save(p: Project) {
    const all = lsRead<Project[]>(LS_PROJECTS, []).filter((x) => x.id !== p.id);
    lsWrite(LS_PROJECTS, [p, ...all]);
    return p;
  },
  versions(projectId: string): DesignVersion[] {
    return lsRead<DesignVersion[]>(LS_VERSIONS, [])
      .filter((v) => v.projectId === projectId)
      .sort((a, b) => b.version - a.version);
  },
};

// ---------- public API ----------

export const store = {
  async list(): Promise<Project[]> {
    if ((await storageMode()) === "local") return local.list();
    return (await api<{ projects: Project[] }>("/api/projects")).projects;
  },
  async get(id: string): Promise<Project> {
    if ((await storageMode()) === "local") return local.get(id);
    return (await api<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`)).project;
  },
  async create(input: ProjectInput): Promise<Project> {
    if ((await storageMode()) === "local")
      return local.save({ ...input, id: crypto.randomUUID(), status: "draft", latestVersion: 0, createdAt: now(), updatedAt: now() });
    return (await api<{ project: Project }>("/api/projects", { method: "POST", body: JSON.stringify(input) })).project;
  },
  async update(id: string, input: ProjectInput): Promise<Project> {
    if ((await storageMode()) === "local") return local.save({ ...local.get(id), ...input, updatedAt: now() });
    return (await api<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) })).project;
  },
  async remove(id: string): Promise<void> {
    if ((await storageMode()) === "local") {
      lsWrite(LS_PROJECTS, lsRead<Project[]>(LS_PROJECTS, []).filter((x) => x.id !== id));
      lsWrite(LS_VERSIONS, lsRead<DesignVersion[]>(LS_VERSIONS, []).filter((v) => v.projectId !== id));
      return;
    }
    await api(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async duplicate(id: string): Promise<Project> {
    if ((await storageMode()) === "local") {
      const src = local.get(id);
      return local.save({ ...src, id: crypto.randomUUID(), name: `${src.name} (copy)`.slice(0, 120), status: "draft", latestVersion: 0, createdAt: now(), updatedAt: now() });
    }
    return (await api<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}/duplicate`, { method: "POST" })).project;
  },
  async versions(projectId: string): Promise<DesignVersion[]> {
    if ((await storageMode()) === "local") return local.versions(projectId);
    return (await api<{ versions: DesignVersion[] }>(`/api/projects/${encodeURIComponent(projectId)}/versions`)).versions;
  },
  async addVersion(projectId: string, v: VersionInput): Promise<DesignVersion> {
    if ((await storageMode()) === "local") {
      const p = local.get(projectId);
      const version: DesignVersion = { ...v, id: crypto.randomUUID(), projectId, version: p.latestVersion + 1, createdAt: now() };
      lsWrite(LS_VERSIONS, [version, ...lsRead<DesignVersion[]>(LS_VERSIONS, [])].slice(0, 300));
      local.save({ ...p, latestVersion: version.version, status: "generated", updatedAt: now() });
      return version;
    }
    return (await api<{ version: DesignVersion }>(`/api/projects/${encodeURIComponent(projectId)}/versions`, { method: "POST", body: JSON.stringify(v) })).version;
  },
  /** Records export metadata (cloud mode only; the file itself is never uploaded). */
  async logDocument(projectId: string, d: { version: number; kind: "pdf" | "svg" | "png" | "json"; fileName: string; pages?: number }) {
    if ((await storageMode()) === "local") return;
    await api(`/api/projects/${encodeURIComponent(projectId)}/documents`, { method: "POST", body: JSON.stringify(d) }).catch(() => undefined);
  },
};

export async function aiRequest<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    throw new StoreError("NETWORK", "Could not reach the server.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new StoreError(body?.error?.code ?? "HTTP_" + res.status, body?.error?.message ?? "AI request failed.");
  return body as T;
}
