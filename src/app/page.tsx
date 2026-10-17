import Link from "next/link";
import { ArrowRight, FileText, Layers, Ruler, ScanLine, ShieldAlert, SquareStack } from "lucide-react";
import { PlanSvg } from "@/components/PlanSvg";
import { generatePlan } from "@/lib/planner/generate";
import { drawFloor } from "@/lib/plan-draw";
import { DISCLAIMER } from "@/lib/report";
import { defaultProjectInput } from "@/lib/schema";

function sampleDrawing() {
  const p = defaultProjectInput();
  p.name = "Sample";
  p.plot = { ...p.plot, frontWidth: 35, rearWidth: 35, leftDepth: 70, rightDepth: 70, facing: "N" };
  p.requirements = { ...p.requirements, floors: 2, bedrooms: 4, attachedBathrooms: 4 };
  const res = generatePlan(p);
  return res.layout ? drawFloor(res.layout, 0, { unit: "ft", facing: "N" }) : null;
}

const steps = [
  { icon: Ruler, title: "Describe the plot", body: "Enter boundary measurements in feet, metres or yards, and set the marla size your locality uses. Upload a photo or survey sketch for reference." },
  { icon: SquareStack, title: "Set your brief", body: "Choose the floors, bedrooms, bathrooms, parking and lifestyle priorities. Skip anything you are unsure of; missing critical items are flagged." },
  { icon: FileText, title: "Review the concept", body: "Get dimensioned floor plans for each floor, a room schedule, validation checks and a PDF planning report to take to your architect." },
];

const features = [
  { icon: Layers, title: "Geometry-driven layouts", body: "Plans come from a deterministic zoning engine, not an image generator. Every room has a real position and size, and is checked for overlaps, access and light." },
  { icon: ScanLine, title: "AI-assisted, never AI-trusted", body: "Optional Hugging Face vision and text models read visible dimensions and describe requirements. You confirm every value before it is used." },
  { icon: ShieldAlert, title: "Honest about limits", body: "Missing setbacks, coverage or height limits are marked as pending, never invented. If the rooms do not fit, you are told why and given options." },
  { icon: FileText, title: "Professional exports", body: "Vector PDF report with a scale bar, plus SVG and PNG plans and a JSON export so you can reproduce the project." },
];

export default function Home() {
  const drawing = sampleDrawing();
  return (
    <div>
      <section className="blueprint-grid border-b border-line">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div className="fade-up">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink-2">
              Preliminary planning for residential plots · optimised for Pakistan
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">Turn Your Plot Into a Smarter Building Plan.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
              Enter your plot measurements and what you need from your home. Plot2Plan AI produces dimensioned floor-plan concepts for every floor and a structured planning report you can take to your architect and engineer.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/projects/new" className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-[#1b2f57]">
                Create Your Plan <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href="#how-it-works" className="inline-flex items-center rounded-md border border-line-strong bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-[#f0f2f6]">
                Explore How It Works
              </a>
            </div>
            <p className="mt-6 max-w-xl text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
          </div>
          <figure className="fade-up rounded-xl border border-line bg-white p-3 shadow-[0_1px_2px_rgba(15,31,61,0.06),0_12px_32px_-12px_rgba(15,31,61,0.18)]">
            {drawing ? <PlanSvg drawing={drawing} title="Example ground floor plan generated for a 35 × 70 ft plot" className="h-auto max-h-[560px] w-full" /> : null}
            <figcaption className="border-t border-line px-1 pt-2 text-xs text-muted">
              Real engine output: ground floor for a 35 × 70 ft plot with 4 bedrooms over two storeys and no setbacks entered. Preliminary concept.
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <p className="mt-2 max-w-2xl text-ink-2">Plot image + measurements + requirements → site information → preliminary floor plan → planning report → PDF.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-line bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft font-mono text-sm font-semibold text-accent">{i + 1}</span>
                <s.icon className="h-5 w-5 text-ink-2" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title}>
              <f.icon className="h-5 w-5 text-accent" aria-hidden />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Example workflow: a 10-marla family home</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          {[
            ["Plot", "35 ft × 70 ft rectangular plot (2,450 sq ft; 10.9 marla at 225 sq ft/marla). Road on the north side, entrance on the left."],
            ["Brief", "Two storeys, 4 bedrooms with attached baths, drawing room, one car porch, laundry and store, a balcony upstairs."],
            ["Concept", "Front zone for the porch and drawing room, family zone with the lounge, kitchen and stair, and bedrooms at the rear. The stair is aligned on both floors."],
            ["Report", "Room schedule, area summary, door and window schedule, pending bylaw checks and a professional review checklist, exported as a PDF."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-lg border border-line bg-white p-5">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">{t}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="rounded-lg border border-[#f0d9b5] bg-warn-soft p-6">
          <h2 className="flex items-center gap-2 font-semibold text-warn">
            <ShieldAlert className="h-5 w-5" aria-hidden /> Limitations and professional review
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#6b4204]">
            <li>Plot2Plan AI produces preliminary concepts. It does not replace a licensed architect, structural engineer, land surveyor or your local building authority.</li>
            <li>Automatic layout currently supports rectangular and square plots. Irregular plots can have their area calculated from boundary coordinates.</li>
            <li>Building regulations vary by city, housing society and zoning. Setbacks, coverage and height are checked only against values you enter.</li>
            <li>No structural design is produced: no column sizes, beams, reinforcement or foundations.</li>
            <li>Photographs are never treated as calibrated surveys. Measurements you enter always take priority.</li>
          </ul>
          <Link href="/projects/new" className="mt-5 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1b2f57]">
            Create Your Plan <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
