"use client";
import { Cloud, Cpu, HardDrive, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { getStatus, type Status } from "@/lib/client/store";

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    getStatus().then(setStatus);
  }, []);

  function clearLocal() {
    if (!confirm("Delete all projects and images stored in this browser? Cloud projects are not affected. This cannot be undone.")) return;
    try {
      localStorage.removeItem("p2p.projects.v1");
      localStorage.removeItem("p2p.versions.v1");
      indexedDB.deleteDatabase("p2p-images");
      setCleared(true);
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings & data</h1>
      <p className="mt-1 text-sm text-muted">Service status for this deployment, and how your data is stored.</p>
      {!status ? (
        <div className="mt-6">
          <Spinner />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                {status.db === "connected" ? <Cloud className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />} Project storage
              </h2>
              <Badge tone={status.db === "connected" ? "ok" : status.db === "error" ? "err" : "warn"}>{status.db === "connected" ? "MongoDB connected" : status.db === "error" ? "Database unreachable" : "Database not configured"}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink-2">
              {status.db === "connected"
                ? "Projects, design versions and export records are stored in MongoDB Atlas. Access is limited to this browser through an anonymous, device-scoped cookie. This is not account sign-in: clearing cookies removes access to these projects."
                : "Projects are saved in this browser's local storage only. They are not backed up and are not visible on other devices. Use JSON export to keep a copy."}
            </p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <Cpu className="h-4 w-4" /> AI assistance
              </h2>
              <Badge tone={status.ai.configured ? "ok" : "warn"}>{status.ai.configured ? "Configured" : "Not configured"}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink-2">
              {status.ai.configured
                ? `Providers: ${status.ai.providers?.join(", ") ?? "—"}. Image reading tries ${status.ai.visionModel}; requirement extraction tries ${status.ai.textModel}, falling back to other free models if one is busy. AI output is always validated and shown to you for confirmation before it is used.`
                : "No AI provider key is set on the server. The planning engine, reports and exports work fully without AI. AI only assists with reading images and text."}
            </p>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" /> Privacy
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
              <li>Plot images are stored only in this browser (IndexedDB). They are never saved to the Plot2Plan database.</li>
              <li>When you ask for AI image reading, a compressed copy is sent to the configured AI provider for that single request only.</li>
              <li>PDF, SVG and PNG files are generated in your browser. Only export metadata (file name, type, version) is recorded when cloud storage is enabled.</li>
              <li>Deleting a project removes its versions and export records from the database, and its image from this browser.</li>
              <li>No account, name or email is collected.</li>
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Browser data</h2>
            <p className="mt-1 text-sm text-ink-2">Remove locally stored projects and plot images from this browser.</p>
            <Button variant="danger" className="mt-3" onClick={clearLocal} disabled={cleared}>
              <Trash2 className="h-4 w-4" aria-hidden /> {cleared ? "Browser data cleared" : "Clear browser data"}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
