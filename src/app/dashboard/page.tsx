"use client";
import Link from "next/link";
import { Copy, FileText, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, ErrorBox, Spinner } from "@/components/ui";
import { deleteImage } from "@/lib/client/images";
import { getStatus, store, type Status } from "@/lib/client/store";
import { analyzePlot } from "@/lib/geometry";
import type { Project } from "@/lib/schema";
import { fmtArea } from "@/lib/units";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => store.list().then((ps) => (setError(null), setProjects(ps)), (e: Error) => setError(e.message)), []);
  useEffect(() => {
    getStatus().then(setStatus);
    load();
  }, [load]);

  async function remove(p: Project) {
    if (!confirm(`Delete “${p.name}” and all its design versions? This cannot be undone.`)) return;
    setBusy(p.id);
    try {
      await store.remove(p.id);
      await deleteImage(p.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  async function duplicate(p: Project) {
    setBusy(p.id);
    try {
      await store.duplicate(p.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplicate failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted">
            {status?.db === "connected"
              ? "Saved to the cloud database and visible only from this browser session (anonymous, device-scoped access)."
              : "The cloud database is not configured, so projects are stored in this browser only. Export JSON to keep a copy."}
          </p>
        </div>
        <ButtonLink href="/projects/new">
          <Plus className="h-4 w-4" aria-hidden /> Create new project
        </ButtonLink>
      </div>

      {error && (
        <div className="mt-5">
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}

      {!projects && !error && (
        <div className="mt-10">
          <Spinner label="Loading projects" />
        </div>
      )}

      {projects && projects.length === 0 && (
        <Card className="blueprint-grid mt-6 flex flex-col items-center px-6 py-16 text-center">
          <FolderOpen className="h-8 w-8 text-muted" aria-hidden />
          <h2 className="mt-3 font-semibold">No projects yet</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-2">Start with your plot measurements and requirements. A first plan takes about two minutes.</p>
          <ButtonLink href="/projects/new" className="mt-4">
            Create your first plan
          </ButtonLink>
        </Card>
      )}

      {projects && projects.length > 0 && (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const a = analyzePlot(p.plot, p.units);
            return (
              <li key={p.id}>
                <Card className="flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/projects/${p.id}`} className="font-semibold hover:text-accent">
                      {p.name}
                    </Link>
                    <Badge tone={p.status === "generated" ? "ok" : "neutral"}>{p.status === "generated" ? `v${p.latestVersion} generated` : "Draft"}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-muted">Plot area</dt>
                    <dd>{a.areaSqft ? fmtArea(a.areaSqft, p.units.area, p.units.marlaSqft) : "Pending"}</dd>
                    <dt className="text-muted">Floors</dt>
                    <dd>{p.requirements.floors}</dd>
                    <dt className="text-muted">Location</dt>
                    <dd className="truncate">{[p.city, p.country].filter(Boolean).join(", ") || "—"}</dd>
                    <dt className="text-muted">Last modified</dt>
                    <dd>{new Date(p.updatedAt).toLocaleString()}</dd>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-1 border-t border-line pt-3">
                    <ButtonLink variant="secondary" href={`/projects/${p.id}`}>
                      <FolderOpen className="h-4 w-4" aria-hidden /> Open
                    </ButtonLink>
                    <ButtonLink variant="ghost" href={`/projects/${p.id}/edit`}>
                      <Pencil className="h-4 w-4" aria-hidden /> Edit
                    </ButtonLink>
                    {p.latestVersion > 0 && (
                      <ButtonLink variant="ghost" href={`/projects/${p.id}/report`}>
                        <FileText className="h-4 w-4" aria-hidden /> Report
                      </ButtonLink>
                    )}
                    <Button variant="ghost" onClick={() => duplicate(p)} disabled={busy === p.id}>
                      <Copy className="h-4 w-4" aria-hidden /> Duplicate
                    </Button>
                    <Button variant="ghost" className="text-err hover:bg-err-soft" onClick={() => remove(p)} disabled={busy === p.id}>
                      <Trash2 className="h-4 w-4" aria-hidden /> Delete
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
