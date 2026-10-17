"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Download, Loader2, Printer } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PlanSvg } from "@/components/PlanSvg";
import { Badge, Button, DisclaimerBanner, ErrorBox, IssueList, Spinner } from "@/components/ui";
import { safeName } from "@/lib/client/export";
import { store } from "@/lib/client/store";
import { drawFloor } from "@/lib/plan-draw";
import { buildReport, TAG_LABEL, type Row, type Tag } from "@/lib/report";
import type { DesignVersion, Project } from "@/lib/schema";

const tagTone: Record<Tag, "neutral" | "accent" | "ok" | "warn" | "err"> = { user: "neutral", calculated: "ok", suggestion: "accent", assumption: "warn", verify: "err" };

function Rows({ rows }: { rows: Row[] }) {
  return (
    <table className="avoid-break w-full text-left text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-line align-top">
            <th scope="row" className="w-[38%] py-1.5 pr-3 font-medium text-ink-2">
              {r.label}
            </th>
            <td className="py-1.5 pr-3">{r.value}</td>
            <td className="py-1.5 text-right">
              <Badge tone={tagTone[r.tag]}>{TAG_LABEL[r.tag]}</Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-8 border-b border-line pb-1 text-lg font-semibold">
      <span className="mr-2 font-mono text-sm text-muted">{n}.</span>
      {children}
    </h2>
  );
}

function Report() {
  const { id } = useParams<{ id: string }>();
  const q = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [version, setVersion] = useState<DesignVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([store.get(id), store.versions(id)]).then(
      ([p, vs]) => {
        setProject(p);
        const want = Number(q.get("v"));
        setVersion(vs.find((v) => v.version === want) ?? vs[0] ?? null);
        if (!vs.length) setError("No design version exists yet. Generate a plan first.");
      },
      (e: Error) => setError(e.message),
    );
  }, [id, q]);

  const data = useMemo(() => (project && version ? buildReport(project, version) : null), [project, version]);

  async function pdf() {
    if (!project || !version) return;
    setBusy(true);
    try {
      const { generatePdf } = await import("@/lib/client/pdf");
      const { doc, pages } = await generatePdf(project, version);
      const name = `${safeName(project.name)}-v${version.version}-planning-report.pdf`;
      doc.save(name);
      await store.logDocument(project.id, { version: version.version, kind: "pdf", fileName: name, pages });
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF generation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorBox message={error} /></div>;
  if (!data || !project || !version) return <div className="mx-auto max-w-3xl px-4 py-10"><Spinner label="Preparing report" /></div>;

  const unit = project.units.length;
  let n = 1;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 print:max-w-none print:px-0 print:py-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/projects/${id}`} className="text-sm text-ink-2 hover:underline">
          ← Back to workspace
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Print
          </Button>
          <Button onClick={pdf} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />} Download PDF
          </Button>
        </div>
      </div>

      <article className="rounded-lg border border-line bg-white p-6 sm:p-10 print:border-0 print:p-0">
        <header className="border-b-2 border-ink pb-5">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">Plot2Plan AI · Preliminary architectural planning report</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{data.title}</h1>
          <p className="mt-1 text-sm text-ink-2">
            Design version {data.version} · {new Date(data.createdAt).toLocaleString()}
          </p>
          <DisclaimerBanner className="mt-4" />
        </header>

        <H n={++n}>Project overview</H>
        <Rows rows={data.overview} />
        <H n={++n}>Plot information</H>
        <Rows rows={data.plot} />
        <H n={++n}>Confirmed dimensions and calculated area</H>
        <Rows rows={data.areaSummary.slice(0, 2)} />
        <H n={++n}>Design brief and client requirements</H>
        <Rows rows={data.brief} />
        <H n={++n}>Design assumptions</H>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          {data.assumptions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <H n={++n}>Proposed space allocation</H>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1">Floor</th>
              <th>Covered</th>
              <th>Car porch</th>
              <th>Open / terrace</th>
            </tr>
          </thead>
          <tbody>
            {data.allocation.map((a) => (
              <tr key={a.floor} className="border-t border-line">
                <td className="py-1.5 font-medium">{a.floor}</td>
                <td>{a.covered}</td>
                <td>{a.porch}</td>
                <td>{a.open}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <H n={++n}>Floor-wise room schedule</H>
        {data.schedules.map((s) => (
          <div key={s.floor} className="avoid-break mb-4">
            <h3 className="mb-1 text-sm font-semibold">{s.floor}</h3>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1">Space</th>
                  <th>Dimensions (W × D)</th>
                  <th className="text-right">Approx. area</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1">
                      {r.name}
                      {r.open && <span className="text-xs text-muted"> (open)</span>}
                    </td>
                    <td className="font-mono text-[13px]">{r.dims}</td>
                    <td className="text-right font-mono text-[13px]">{r.area}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <H n={++n}>Floor-plan diagrams</H>
        <p className="mb-3 text-xs text-muted">Shown here to fit the screen, not to scale. Use the scale bar, or the PDF, which is drawn at a stated standard scale on A3.</p>
        {version.layout.floors.map((f, i) => (
          <figure key={i} className="avoid-break print-break mb-6 rounded-md border border-line p-2">
            <PlanSvg drawing={drawFloor(version.layout, i, { unit, facing: project.plot.facing, roadWidthLabel: project.plot.roadWidth ? `${project.plot.roadWidth} ${unit}` : undefined })} title={`${f.name} plan`} className="h-auto max-h-[900px] w-full" />
            <figcaption className="px-1 pt-1 text-xs font-medium text-ink-2">{f.name}</figcaption>
          </figure>
        ))}
        <H n={++n}>Door and window schedule</H>
        {data.openings.map((o) => (
          <details key={o.floor} className="mb-2 rounded-md border border-line px-3 py-2 text-sm print:block" open>
            <summary className="cursor-pointer font-medium">
              {o.floor} · {o.rows.filter((r) => r.type.includes("oor")).length} doors, {o.rows.filter((r) => r.type === "Window" || r.type === "Ventilator").length} windows/ventilators
            </summary>
            <table className="mt-2 w-full text-left text-[13px]">
              <tbody>
                {o.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-1 pr-2 font-mono text-xs">{r.id}</td>
                    <td className="pr-2">{r.type}</td>
                    <td className="pr-2 font-mono text-xs">{r.width}</td>
                    <td>{r.between}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
        <H n={++n}>Circulation and privacy considerations</H>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{data.circulation.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <H n={++n}>Natural lighting and ventilation considerations</H>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{data.lighting.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <H n={++n}>Parking and open-space arrangements</H>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{data.parking.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <H n={++n}>Preliminary area summary</H>
        <Rows rows={data.areaSummary} />
        <H n={++n}>Budget planning notes</H>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{data.budget.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <H n={++n}>Regulatory checks still requiring verification</H>
        <Rows rows={data.regulatory} />
        <h3 className="mb-2 mt-4 text-sm font-semibold">Validation results</h3>
        <IssueList issues={data.issues} />
        <H n={++n}>Unresolved design questions</H>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{data.questions.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <H n={++n}>Professional review checklist</H>
        <ul className="space-y-1 text-sm text-ink-2">
          {data.checklist.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-line-strong" />
              {s}
            </li>
          ))}
        </ul>
        <H n={++n}>Important limitations and disclaimers</H>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{data.limitations.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </article>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-10"><Spinner label="Loading" /></div>}>
      <Report />
    </Suspense>
  );
}
