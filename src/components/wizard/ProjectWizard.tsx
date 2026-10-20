"use client";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyzePlot } from "@/lib/geometry";
import { aiRequest, getStatus, store, type Status } from "@/lib/client/store";
import { saveImage, deleteImage, loadImage } from "@/lib/client/images";
import { DIRECTIONS, PLOT_SHAPES, PROJECT_TYPES, ProjectInputSchema, type ProjectInput, type Requirements } from "@/lib/schema";
import { AREA_LABEL, companionArea, fmtArea, MARLA_PRESETS } from "@/lib/units";
import { PlotDiagram } from "../PlotDiagram";
import { Badge, Button, Card, DisclaimerBanner, ErrorBox, IssueList, NumberInput, SectionTitle, Select, Stepper, TextArea, TextInput, Toggle, cx } from "../ui";
import { ImageStep, type Measurement } from "./ImageStep";

const STEPS = ["Project", "Plot image", "Dimensions", "Requirements", "Constraints & review"] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ");

export function ProjectWizard({ initial, projectId }: { initial: ProjectInput; projectId?: string }) {
  const router = useRouter();
  const [p, setP] = useState<ProjectInput>(initial);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<Blob | null>(null);
  const [imageTouched, setImageTouched] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();

  useEffect(() => {
    getStatus().then(setStatus);
    if (projectId) loadImage(projectId).then((b) => b && setFile(b));
  }, [projectId]);

  const setPlot = (patch: Partial<ProjectInput["plot"]>) => setP((s) => ({ ...s, plot: { ...s.plot, ...patch }, confirmedMeasurements: false }));
  const setReq = (patch: Partial<Requirements>) => setP((s) => ({ ...s, requirements: { ...s.requirements, ...patch } }));
  const setCon = (patch: Partial<ProjectInput["constraints"]>) => setP((s) => ({ ...s, constraints: { ...s.constraints, ...patch } }));
  const setSb = (patch: Partial<ProjectInput["constraints"]["setbacks"]>) => setCon({ setbacks: { ...p.constraints.setbacks, ...patch } });

  const analysis = useMemo(() => analyzePlot(p.plot, p.units), [p.plot, p.units]);

  const followUps = useMemo(() => {
    const q: { text: string; step: number; critical: boolean }[] = [];
    const r = p.requirements;
    if (analysis.status !== "ok") q.push({ text: "Plot dimensions are incomplete or inconsistent.", step: 2, critical: true });
    if (!analysis.layoutSupported && analysis.status === "ok") q.push({ text: "Automatic layouts need a rectangular or square plot. You can still save the project and its area calculation.", step: 2, critical: false });
    if (!p.confirmedMeasurements) q.push({ text: "Please confirm the plot measurements are correct (Dimensions step).", step: 2, critical: true });
    if (r.bedrooms === 0) q.push({ text: "No bedrooms requested. Is that intended?", step: 3, critical: false });
    if (!r.kitchen) q.push({ text: "No kitchen requested. Is that intended?", step: 3, critical: false });
    if (r.attachedBathrooms + r.commonBathrooms === 0) q.push({ text: "No bathrooms requested. Is that intended?", step: 3, critical: false });
    if (p.constraints.setbacks.source === "none") q.push({ text: "Setbacks are unknown, so the plan will fill the plot and be flagged as pending verification. Do you have the bylaw values?", step: 4, critical: false });
    if (p.plot.cornerPlot && !p.plot.secondRoadSide) q.push({ text: "Which side is the second road on for this corner plot?", step: 2, critical: false });
    return q;
  }, [analysis, p]);

  function applyMeasurement(m: Measurement) {
    const map = { front: "frontWidth", rear: "rearWidth", left: "leftDepth", right: "rightDepth" } as const;
    const key = map[m.side as keyof typeof map];
    if (key) setPlot({ [key]: m.value });
  }

  async function save() {
    setError(null);
    const parsed = ProjectInputSchema.safeParse(p);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      if (first.path[0] === "name") {
        setNameError(first.message);
        setStep(0);
      }
      setError(`Please check: ${first.path.join(" → ")}: ${first.message}`);
      return;
    }
    setSaving(true);
    try {
      const saved = projectId ? await store.update(projectId, parsed.data) : await store.create(parsed.data);
      if (imageTouched) {
        if (file) await saveImage(saved.id, file);
        else await deleteImage(saved.id);
      } else if (file && !projectId) await saveImage(saved.id, file);
      const canGenerate = analysis.layoutSupported && analysis.status === "ok";
      router.push(`/projects/${saved.id}${canGenerate ? "?generate=1" : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
      setSaving(false);
    }
  }

  const r = p.requirements;
  const u = p.units;
  const areaSqft = analysis.areaSqft;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{projectId ? "Edit project" : "New project"}</h1>
          <p className="text-sm text-muted">Optional fields can be skipped. Your entered measurements always take priority.</p>
        </div>
        {status && <Badge tone={status.db === "connected" ? "ok" : "warn"}>{status.db === "connected" ? "Saving to cloud database" : "Saving in this browser only"}</Badge>}
      </div>

      <nav aria-label="Wizard steps" className="mb-6 overflow-x-auto">
        <ol className="flex min-w-max gap-1">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={cx(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
                  i === step ? "bg-ink text-white" : i < step ? "bg-accent-soft text-accent" : "bg-white text-ink-2 ring-1 ring-line",
                )}
              >
                <span className="font-mono text-xs">{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                {s}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <Card className="p-5 sm:p-6">
        {step === 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <SectionTitle>Project details</SectionTitle>
              <TextInput label="Project name *" value={p.name} error={nameError} maxLength={120} onChange={(v) => (setNameError(undefined), setP({ ...p, name: v }))} placeholder="e.g. Family home, DHA Phase 6" />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Project type" value={p.type} options={PROJECT_TYPES.map((t) => ({ value: t, label: cap(t) }))} onChange={(v) => setP({ ...p, type: v })} />
                <TextInput label="Architectural style" value={p.style ?? ""} maxLength={80} onChange={(v) => setP({ ...p, style: v })} placeholder="Contemporary" />
              </div>
              {p.type !== "residential" && <p className="text-xs text-warn">The layout engine plans residential programmes only. Other project types are saved, but layouts need an architect.</p>}
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Country" value={p.country} maxLength={80} onChange={(v) => setP({ ...p, country: v })} />
                <TextInput label="City" value={p.city ?? ""} maxLength={80} onChange={(v) => setP({ ...p, city: v })} placeholder="Lahore" />
              </div>
              <TextInput label="Plot address or location (optional)" value={p.location ?? ""} maxLength={300} onChange={(v) => setP({ ...p, location: v })} hint="Avoid personal details. This is only used in your report." />
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <NumberInput label="Approximate budget (optional)" value={p.budget?.amount} min={0} onChange={(v) => setP({ ...p, budget: v === undefined ? undefined : { amount: v, currency: p.budget?.currency ?? "PKR" } })} />
                <TextInput label="Currency" value={p.budget?.currency ?? "PKR"} maxLength={8} onChange={(v) => p.budget && setP({ ...p, budget: { ...p.budget, currency: v.toUpperCase() } })} />
              </div>
            </div>
            <div className="space-y-4">
              <SectionTitle hint="Lengths are stored exactly as you enter them.">Measurement system</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Length unit" value={u.length} options={[{ value: "ft", label: "Feet" }, { value: "m", label: "Meters" }, { value: "yd", label: "Yards" }]} onChange={(v) => setP({ ...p, units: { ...u, length: v }, confirmedMeasurements: false })} />
                <Select label="Area unit" value={u.area} options={(["sqft", "sqm", "sqyd", "marla", "kanal"] as const).map((a) => ({ value: a, label: AREA_LABEL[a] }))} onChange={(v) => setP({ ...p, units: { ...u, area: v } })} />
              </div>
              <div>
                <p className="mb-1 text-[13px] font-medium text-ink-2">Marla definition</p>
                <div className="space-y-1.5">
                  {MARLA_PRESETS.map((m) => (
                    <label key={m.sqft} className={cx("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", u.marlaSqft === m.sqft ? "border-accent bg-accent-soft" : "border-line")}>
                      <input type="radio" name="marla" checked={u.marlaSqft === m.sqft} onChange={() => setP({ ...p, units: { ...u, marlaSqft: m.sqft } })} className="accent-[var(--accent)]" />
                      {m.label}
                    </label>
                  ))}
                </div>
                <NumberInput className="mt-2" label="Custom sq ft per marla" value={u.marlaSqft} min={100} max={400} onChange={(v) => v !== undefined && setP({ ...p, units: { ...u, marlaSqft: v } })} hint="The marla size varies by locality and housing society. Check your plot documents." />
              </div>
            </div>
          </div>
        )}

        {step === 1 && <ImageStep value={p.image} file={file} onFile={(f) => (setFile(f), setImageTouched(true))} onChange={(img) => setP((s) => ({ ...s, image: img }))} input={p} onApplyMeasurement={applyMeasurement} status={status} />}

        {step === 2 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="space-y-5">
              <SectionTitle hint={`Enter lengths in ${u.length}. The front is the road-facing boundary.`}>Plot dimensions</SectionTitle>
              <Select label="Plot shape" value={p.plot.shape} options={PLOT_SHAPES.map((s) => ({ value: s, label: cap(s) }))} onChange={(v) => setPlot({ shape: v })} />
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="Front width (road side)" suffix={u.length} min={0} value={p.plot.frontWidth} onChange={(v) => setPlot({ frontWidth: v, ...(p.plot.shape === "square" ? { leftDepth: v, rightDepth: v, rearWidth: v } : {}) })} />
                <NumberInput label="Rear width" suffix={u.length} min={0} value={p.plot.rearWidth} onChange={(v) => setPlot({ rearWidth: v })} />
                <NumberInput label="Left side length" suffix={u.length} min={0} value={p.plot.leftDepth} onChange={(v) => setPlot({ leftDepth: v })} />
                <NumberInput label="Right side length" suffix={u.length} min={0} value={p.plot.rightDepth} onChange={(v) => setPlot({ rightDepth: v })} />
              </div>
              {(p.plot.shape === "irregular" || p.plot.shape === "polygonal" || p.plot.shape === "l-shaped") && <CoordinateEditor p={p} setPlot={setPlot} />}
              <NumberInput label={`Total plot area from documents (optional, ${AREA_LABEL[u.area]})`} min={0} value={p.plot.statedArea} onChange={(v) => setPlot({ statedArea: v })} hint="Used only to cross-check the geometry. It never overrides your measurements." />
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="Road width (optional)" suffix={u.length} min={0} value={p.plot.roadWidth} onChange={(v) => setPlot({ roadWidth: v })} />
                <Select label="Front boundary faces" value={p.plot.facing ?? ""} options={[{ value: "", label: "Not known" }, ...DIRECTIONS.map((d) => ({ value: d, label: d }))] as { value: string; label: string }[]} onChange={(v) => setPlot({ facing: (v || undefined) as ProjectInput["plot"]["facing"] })} />
                <Select label="Entrance / driveway side" value={p.plot.entranceSide} options={[{ value: "left", label: "Left (viewed from road)" }, { value: "right", label: "Right (viewed from road)" }]} onChange={(v) => setPlot({ entranceSide: v })} />
                <div className="space-y-2 pt-5">
                  <Toggle label="Corner plot" checked={p.plot.cornerPlot} onChange={(v) => setPlot({ cornerPlot: v, secondRoadSide: v ? p.plot.secondRoadSide : undefined })} />
                </div>
              </div>
              {p.plot.cornerPlot && <Select label="Second road on which side?" value={p.plot.secondRoadSide ?? ""} options={[{ value: "", label: "Select…" }, { value: "left", label: "Left" }, { value: "right", label: "Right" }] as { value: string; label: string }[]} onChange={(v) => setPlot({ secondRoadSide: (v || undefined) as "left" | "right" | undefined })} />}
              <TextArea label="Existing structures, trees or obstructions (optional)" value={p.plot.obstructions ?? ""} maxLength={1000} onChange={(v) => setPlot({ obstructions: v })} rows={2} hint="These are listed in the report. They are not yet modelled in the layout." />
            </div>
            <aside className="space-y-4">
              <Card className="p-4">
                <PlotDiagram plot={p.plot} units={u} />
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">Calculated area</p>
                {areaSqft !== undefined ? (
                  <div className="mt-1">
                    <p className="text-xl font-semibold">{fmtArea(areaSqft, u.area, u.marlaSqft)}</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
                      {(["sqft", "sqm", "sqyd", "marla", "kanal"] as const).filter((a) => a !== u.area).map((a) => (
                        <li key={a}>{fmtArea(areaSqft, a, u.marlaSqft)}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[11px] text-muted">Marla at {u.marlaSqft} sq ft · method: {analysis.areaMethod}</p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-ink-2">Not determinable yet.</p>
                )}
              </Card>
              <IssueList issues={analysis.issues} empty="Measurements look consistent." />
              <Toggle
                label="I confirm these measurements are correct"
                hint="Use verified documents or site measurements. Photos are not surveys."
                checked={p.confirmedMeasurements}
                onChange={(v) => setP({ ...p, confirmedMeasurements: v })}
              />
            </aside>
          </div>
        )}

        {step === 3 && <RequirementsStep r={r} setReq={setReq} status={status} />}

        {step === 4 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <SectionTitle hint="Enter only values from your bylaws, housing society or approved documents. Nothing is assumed for you.">Building constraints</SectionTitle>
              <div className="space-y-1.5">
                {(
                  [
                    ["none", "Not known yet", "The plan fills the plot boundary and every report flags setbacks as pending."],
                    ["user", "From my bylaws / documents", "Values are applied as entered."],
                    ["placeholder", "Use my own planning placeholders", "Values are applied but labelled as unverified."],
                  ] as const
                ).map(([v, l, h]) => (
                  <label key={v} className={cx("flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm", p.constraints.setbacks.source === v ? "border-accent bg-accent-soft" : "border-line")}>
                    <input type="radio" name="sb" className="mt-1 accent-[var(--accent)]" checked={p.constraints.setbacks.source === v} onChange={() => setSb({ source: v })} />
                    <span>
                      <span className="font-medium">{l}</span>
                      <span className="block text-xs text-muted">{h}</span>
                    </span>
                  </label>
                ))}
              </div>
              {p.constraints.setbacks.source !== "none" && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["front", "rear", "left", "right"] as const).map((k) => (
                    <NumberInput key={k} label={`${cap(k)} setback`} suffix={u.length} min={0} value={p.constraints.setbacks[k]} onChange={(v) => setSb({ [k]: v ?? 0 })} />
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <NumberInput label="Max coverage" suffix="%" min={1} max={100} value={p.constraints.maxCoveragePct} onChange={(v) => setCon({ maxCoveragePct: v })} />
                <NumberInput label="Max height" suffix={u.length} min={1} value={p.constraints.maxHeight} onChange={(v) => setCon({ maxHeight: v })} />
                <NumberInput label="Floor-to-floor" suffix="ft" min={7} max={20} value={p.constraints.floorHeight} onChange={(v) => setCon({ floorHeight: v ?? 10.5 })} hint="Planning value" />
              </div>
              <TextArea label="Known bylaws or regulations (optional)" value={p.constraints.bylawsNotes ?? ""} maxLength={4000} onChange={(v) => setCon({ bylawsNotes: v })} hint="Paste any rules you know. They are quoted in the report as user-supplied." />
              <TextInput label="Preferred building materials (optional)" value={p.constraints.materials ?? ""} maxLength={500} onChange={(v) => setCon({ materials: v })} placeholder="RCC frame, brick masonry" />
            </div>
            <div className="space-y-4">
              <SectionTitle>Review</SectionTitle>
              <Card className="divide-y divide-line text-sm">
                {[
                  ["Project", `${p.name || "—"} · ${cap(p.type)} · ${[p.city, p.country].filter(Boolean).join(", ")}`],
                  ["Plot", `${cap(p.plot.shape)} · ${p.plot.frontWidth ?? "?"} × ${p.plot.leftDepth ?? "?"} ${u.length}${areaSqft ? ` · ${fmtArea(areaSqft, u.area, u.marlaSqft)} (${fmtArea(areaSqft, companionArea(u.length), u.marlaSqft)})` : ""}`],
                  ["Building", `${r.floors} floor(s) · ${r.bedrooms} bedrooms · ${r.attachedBathrooms} attached + ${r.commonBathrooms} common baths · ${r.parkingCars} car(s)`],
                  ["Setbacks", p.constraints.setbacks.source === "none" ? "Pending (not provided)" : `${p.constraints.setbacks.front}/${p.constraints.setbacks.rear}/${p.constraints.setbacks.left}/${p.constraints.setbacks.right} ${u.length} (${p.constraints.setbacks.source})`],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-3 py-2">
                    <span className="w-20 shrink-0 text-muted">{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </Card>
              {followUps.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">Before generating</p>
                  <ul className="space-y-1.5">
                    {followUps.map((f, i) => (
                      <li key={i} className={cx("flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm", f.critical ? "border-[#f1c4be] bg-err-soft text-err" : "border-[#f0d9b5] bg-warn-soft text-warn")}>
                        <span>{f.text}</span>
                        <button type="button" className="shrink-0 text-xs font-medium underline" onClick={() => setStep(f.step)}>
                          Go to step
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <DisclaimerBanner compact />
            </div>
          </div>
        )}
      </Card>

      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            Next <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button onClick={save} disabled={saving || followUps.some((f) => f.critical && f.step === 2 && analysis.status !== "ok")}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {analysis.layoutSupported && analysis.status === "ok" ? "Save & generate plan" : "Save project"}
          </Button>
        )}
      </div>
    </div>
  );
}

function CoordinateEditor({ p, setPlot }: { p: ProjectInput; setPlot: (patch: Partial<ProjectInput["plot"]>) => void }) {
  const pts = p.plot.coordinates ?? [];
  const set = (i: number, k: "x" | "y", v: number | undefined) => setPlot({ coordinates: pts.map((pt, j) => (j === i ? { ...pt, [k]: v ?? 0 } : pt)) });
  return (
    <div className="rounded-md border border-line p-3">
      <p className="text-sm font-medium">Boundary coordinates ({p.units.length})</p>
      <p className="mb-2 text-xs text-muted">List the corners in order around the boundary, from a survey or site plan. The front (road) edge runs along y = 0. Area is calculated only from these points.</p>
      <div className="space-y-2">
        {pts.map((pt, i) => (
          <div key={i} className="grid grid-cols-[40px_1fr_1fr_36px] items-end gap-2">
            <span className="pb-2 font-mono text-xs text-muted">P{i + 1}</span>
            <NumberInput label="x" value={pt.x} onChange={(v) => set(i, "x", v)} />
            <NumberInput label="y" value={pt.y} onChange={(v) => set(i, "y", v)} />
            <button type="button" aria-label={`Remove point ${i + 1}`} className="mb-1 rounded p-2 text-muted hover:bg-err-soft hover:text-err" onClick={() => setPlot({ coordinates: pts.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <Button variant="secondary" className="mt-2" onClick={() => setPlot({ coordinates: [...pts, { x: 0, y: 0 }] })} disabled={pts.length >= 64}>
        <Plus className="h-4 w-4" aria-hidden /> Add point
      </Button>
    </div>
  );
}

function RequirementsStep({ r, setReq, status }: { r: Requirements; setReq: (p: Partial<Requirements>) => void; status: Status | null }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sugg, setSugg] = useState<{ suggestions: Partial<Requirements>; summary: string; source?: string } | null>(null);

  async function extract() {
    setBusy(true);
    setErr(null);
    try {
      setSugg(await aiRequest("/api/ai/extract-requirements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  const floorsOpts = [
    { value: "1", label: "Single storey" },
    { value: "2", label: "Double storey" },
    { value: "3", label: "Three floors" },
    { value: "4", label: "Four floors" },
  ];
  return (
    <div className="space-y-6">
      {status?.ai.configured && (
        <Card className="bg-[#fafbfd] p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden /> Describe your home in your own words (optional)
          </p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={3000} className="mt-2 w-full rounded-md border border-line-strong px-3 py-2 text-sm" placeholder="e.g. Double storey for a family of six, four bedrooms with attached baths, drawing room near the entrance, parking for one car, open kitchen." aria-label="Describe your requirements" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={extract} disabled={busy || text.trim().length < 10}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Suggest form values
            </Button>
            <span className="text-xs text-muted">Sent to the AI provider ({status.ai.providers?.join(", ")}). You review the suggestions before anything changes.</span>
          </div>
          {err && <p className="mt-2 text-sm text-err">{err}</p>}
          {sugg && (
            <div className="mt-3 rounded-md border border-line bg-white p-3 text-sm">
              {sugg.summary && <p className="mb-2 text-ink-2">“{sugg.summary}”</p>}
              {sugg.source && <p className="mb-2 text-[11px] text-muted">Suggested by {sugg.source}</p>}
              {Object.keys(sugg.suggestions).length === 0 ? (
                <p className="text-muted">No clear requirements were found in the text.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(sugg.suggestions).map(([k, v]) => (
                      <Badge key={k} tone="accent">
                        {k}: {String(v)}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button onClick={() => (setReq(sugg.suggestions), setSugg(null))}>Apply suggestions</Button>
                    <Button variant="ghost" onClick={() => setSugg(null)}>
                      Dismiss
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      <section>
        <SectionTitle>Building configuration</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Floors" value={String(r.floors)} options={floorsOpts} onChange={(v) => setReq({ floors: Number(v) })} />
          <Toggle label="Future upper-floor provision" hint="Adds a stair to the roof" checked={r.futureExpansion} onChange={(v) => setReq({ futureExpansion: v })} />
          <Toggle label="Basement" hint="Recorded; not planned by this tool" checked={r.basement} onChange={(v) => setReq({ basement: v })} />
          <Toggle label="Roof terrace plan" checked={r.terrace} onChange={(v) => setReq({ terrace: v })} />
        </div>
      </section>

      <section>
        <SectionTitle>Rooms and spaces</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stepper label="Bedrooms" value={r.bedrooms} max={12} onChange={(v) => setReq({ bedrooms: v, masterBedrooms: Math.min(r.masterBedrooms, v), attachedBathrooms: Math.min(r.attachedBathrooms, v) })} />
          <Stepper label="…of which master" value={r.masterBedrooms} max={Math.min(6, r.bedrooms)} onChange={(v) => setReq({ masterBedrooms: v })} />
          <Stepper label="Attached bathrooms" value={r.attachedBathrooms} max={r.bedrooms} onChange={(v) => setReq({ attachedBathrooms: v })} hint="One per bedroom at most" />
          <Stepper label="Common bathrooms" value={r.commonBathrooms} max={6} onChange={(v) => setReq({ commonBathrooms: v })} />
          <Stepper label="Car parking spaces" value={r.parkingCars} max={3} onChange={(v) => setReq({ parkingCars: v })} />
          <NumberInput label="Number of occupants" value={r.occupants} min={1} max={40} onChange={(v) => setReq({ occupants: v === undefined ? undefined : Math.round(v) })} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["kitchen", "Kitchen"],
              ["dining", "Dining area"],
              ["drawingRoom", "Drawing room"],
              ["guestRoom", "Guest room"],
              ["study", "Study room"],
              ["homeOffice", "Home office"],
              ["prayerRoom", "Prayer room"],
              ["laundry", "Laundry area"],
              ["storage", "Storage"],
              ["balcony", "Balcony (upper floors)"],
              ["courtyard", "Courtyard"],
              ["lift", "Lift"],
              ["accessibility", "Accessibility features"],
            ] as const
          ).map(([k, l]) => (
            <Toggle key={k} label={l} checked={r[k]} onChange={(v) => setReq({ [k]: v } as Partial<Requirements>)} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Lifestyle and preferences</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select label="Privacy" value={r.privacy} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} onChange={(v) => setReq({ privacy: v })} />
          <Select label="Kitchen" value={r.kitchenType} options={[{ value: "closed", label: "Closed kitchen" }, { value: "open", label: "Open kitchen" }]} onChange={(v) => setReq({ kitchenType: v })} />
          <Select label="Living areas" value={r.livingPlan} options={[{ value: "separated", label: "Separated living / dining" }, { value: "open", label: "Open-plan living / dining" }]} onChange={(v) => setReq({ livingPlan: v })} />
          <Select label="Natural lighting" value={r.lightingPriority} options={[{ value: "normal", label: "Normal priority" }, { value: "high", label: "High priority" }]} onChange={(v) => setReq({ lightingPriority: v })} />
          <Select label="Cross-ventilation" value={r.ventilationPriority} options={[{ value: "normal", label: "Normal priority" }, { value: "high", label: "High priority" }]} onChange={(v) => setReq({ ventilationPriority: v })} />
          <Toggle label="Indoor–outdoor connection" checked={r.indoorOutdoor} onChange={(v) => setReq({ indoorOutdoor: v })} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <TextArea label="Orientation / Vastu preferences" value={r.orientationNotes ?? ""} maxLength={1000} onChange={(v) => setReq({ orientationNotes: v })} rows={2} />
          <TextArea label="Sustainability priorities" value={r.sustainabilityNotes ?? ""} maxLength={1000} onChange={(v) => setReq({ sustainabilityNotes: v })} rows={2} />
          <TextArea label="Other notes" value={r.notes ?? ""} maxLength={4000} onChange={(v) => setReq({ notes: v })} rows={2} />
        </div>
        <p className="mt-2 text-xs text-muted">Orientation, sustainability and free-text notes are recorded in the report. They are not yet used by the layout engine.</p>
      </section>
    </div>
  );
}

