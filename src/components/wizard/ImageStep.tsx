"use client";
import { ImagePlus, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { aiRequest, type Status } from "@/lib/client/store";
import { downscale, MAX_UPLOAD, sniffImage } from "@/lib/client/images";
import type { ProjectInput } from "@/lib/schema";
import { Badge, Button, Card, ErrorBox, Select, SectionTitle } from "../ui";

type Kind = NonNullable<ProjectInput["image"]>["kind"];
interface Measurement {
  label: string;
  side: "front" | "rear" | "left" | "right" | "area" | "road" | "other";
  value: number;
  unit: string;
  confidence: "low" | "medium" | "high";
}
interface Analysis {
  imageType: string;
  shapeGuess: string;
  hasScale: boolean;
  measurements: Measurement[];
  visibleText: string[];
  notes: string;
  source?: string;
}

const KINDS: { value: Kind; label: string }[] = [
  { value: "photo", label: "Plot photograph" },
  { value: "plot-map", label: "Scanned plot map" },
  { value: "survey", label: "Land survey image" },
  { value: "sketch", label: "Boundary sketch" },
  { value: "site-plan", label: "Site plan / existing floor plan" },
];

export function ImageStep({
  value,
  file,
  onFile,
  onChange,
  input,
  onApplyMeasurement,
  status,
}: {
  value: ProjectInput["image"];
  file: Blob | null;
  onFile: (f: Blob | null) => void;
  onChange: (img: ProjectInput["image"]) => void;
  input: ProjectInput;
  onApplyMeasurement: (m: Measurement) => void;
  status: Status | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());

  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  async function accept(f: File | undefined) {
    setError(null);
    setAnalysis(null);
    if (!f) return;
    if (f.size > MAX_UPLOAD) return setError("This image is larger than 10 MB. Please choose a smaller file.");
    const mime = await sniffImage(f);
    if (!mime) return setError("Unsupported file. Please upload a PNG, JPG or WebP image.");
    onFile(f);
    onChange({ name: f.name.slice(0, 200), type: mime, size: f.size, kind: value?.kind ?? "photo", storedIn: "browser" });
  }

  async function analyze() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setApplied(new Set());
    try {
      const small = await downscale(file);
      const fd = new FormData();
      fd.append("file", small, "plot.jpg");
      fd.append("kind", value?.kind ?? "photo");
      const res = await aiRequest<{ analysis: Analysis }>("/api/ai/analyze-image", { method: "POST", body: fd });
      setAnalysis(res.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  const aiReady = status?.ai.configured;
  const lengthUnit = input.units.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div>
        <SectionTitle hint="Optional. PNG, JPG or WebP up to 10 MB. Images stay in this browser and are never stored on our servers.">Plot image</SectionTitle>
        <Select label="What does the image show?" value={value?.kind ?? "photo"} options={KINDS} onChange={(k) => value && onChange({ ...value, kind: k })} className="mb-3" />
        {!file ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              accept(e.dataTransfer.files?.[0]);
            }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center ${drag ? "border-accent bg-accent-soft" : "border-line-strong bg-white"}`}
          >
            <ImagePlus className="h-8 w-8 text-muted" aria-hidden />
            <p className="mt-3 text-sm font-medium">Drag an image here, or</p>
            <Button variant="secondary" className="mt-2" onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
          </div>
        ) : (
          <Card className="overflow-hidden">
            {url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="Uploaded plot reference" className="max-h-[360px] w-full bg-[#f5f7fa] object-contain" />
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
              <p className="truncate text-xs text-muted">
                {value?.name} · {((value?.size ?? 0) / 1024 / 1024).toFixed(2)} MB
              </p>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Replace
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    onFile(null);
                    onChange(undefined);
                    setAnalysis(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </Button>
              </div>
            </div>
          </Card>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Upload plot image"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error && (
          <div className="mt-3">
            <ErrorBox message={error} />
          </div>
        )}
      </div>

      <div>
        <SectionTitle hint="The AI reads only measurements that are visibly written on the image. It never estimates sizes from a photo.">AI-assisted reading</SectionTitle>
        <Card className="p-4">
          {!aiReady ? (
            <p className="text-sm text-ink-2">
              AI image reading is not configured on this deployment. Enter the measurements manually in the next step. Everything else works without AI.
            </p>
          ) : !file ? (
            <p className="text-sm text-ink-2">Upload a plot map, survey or sketch with written dimensions to try AI-assisted reading.</p>
          ) : (
            <>
              <Button onClick={analyze} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                {busy ? "Reading image…" : "Read visible measurements"}
              </Button>
              <p className="mt-2 text-xs text-muted">
                A compressed copy of the image is sent to the AI provider ({status?.ai.providers?.join(", ")}) for this one request and is not stored by Plot2Plan. Free models can be busy; if so, try again in a minute.
              </p>
            </>
          )}
          {analysis && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge>Type: {analysis.imageType || "unknown"}</Badge>
                <Badge>Shape guess: {analysis.shapeGuess}</Badge>
                <Badge tone={analysis.hasScale ? "ok" : "warn"}>{analysis.hasScale ? "Scale or dimensions visible" : "No scale visible"}</Badge>
              </div>
              {analysis.measurements.length === 0 ? (
                <p className="text-sm text-ink-2">No written measurements were found. Please enter the dimensions manually or upload a clearer image.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 font-medium">Read from image</th>
                      <th className="py-1 font-medium">Confidence</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.measurements.map((m, i) => {
                      const usable = ["front", "rear", "left", "right"].includes(m.side) && m.unit === lengthUnit;
                      return (
                        <tr key={i} className="border-t border-line">
                          <td className="py-1.5">
                            <span className="font-medium">{m.label}</span>: {m.value} {m.unit}
                            <span className="block text-xs text-muted">side: {m.side}</span>
                          </td>
                          <td>
                            <Badge tone={m.confidence === "high" ? "ok" : m.confidence === "medium" ? "accent" : "warn"}>{m.confidence}</Badge>
                          </td>
                          <td className="text-right">
                            {usable ? (
                              <Button
                                variant="secondary"
                                disabled={applied.has(i)}
                                onClick={() => {
                                  onApplyMeasurement(m);
                                  setApplied(new Set(applied).add(i));
                                }}
                              >
                                {applied.has(i) ? "Applied" : "Use value"}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted">{m.unit !== lengthUnit && m.unit !== "unknown" ? `unit ${m.unit} ≠ ${lengthUnit}` : "review manually"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {analysis.notes && <p className="text-xs text-ink-2">Model notes: {analysis.notes}</p>}
              {analysis.source && <p className="text-[11px] text-muted">Read by {analysis.source}</p>}
              <p className="rounded-md bg-warn-soft px-2.5 py-2 text-xs text-warn">
                AI readings are suggestions. Check each value against your documents. Applied values still need your confirmation in the Dimensions step.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export type { Measurement };
