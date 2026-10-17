# Plot2Plan AI

AI-assisted **preliminary** architectural planning for residential plots, optimised for Pakistan.
Enter plot measurements and building requirements, then get dimensioned floor-plan concepts for every floor,
validation checks and a professional PDF planning report.

> **PRELIMINARY CONCEPT — NOT FOR CONSTRUCTION OR PERMIT SUBMISSION WITHOUT REVIEW AND APPROVAL BY QUALIFIED PROFESSIONALS.**
> Plot2Plan AI does not replace a licensed architect, structural engineer, land surveyor or local building authority.

## Features

- **Project wizard** with five steps: project details, plot image, dimensions, requirements, and constraints & review. It supports feet, metres and yards, and sq ft, m², sq yd, marla and kanal, with a **configurable marla size** (225 / 250 / 272.25 / custom).
- **Plot image upload** (PNG/JPG/WebP, ≤ 10 MB, type checked by magic bytes) with preview, replace and remove. Images stay in the browser (IndexedDB) and are never stored on the server.
- **Deterministic geometry engine**: unit conversion, rectangle and polygon (shoelace) area, self-intersection checks, and stated-area cross-checks. It refuses to compute an exact area for irregular plots from side lengths alone.
- **Zoned-band layout generator** for rectangular plots. The building is planned front to back as a public zone (porch, foyer, drawing room), a family/service zone (living, dining, kitchen, stair, lift), a corridor, and a private zone (bedrooms with attached baths, common bath, study, utility), with an optional middle bedroom zone for deep plots and a rear open space. Upper floors reuse the ground-floor grid, so **stairs, lift and walls stack**. The generator searches small-plot compromises (entry via the porch, kitchen at the rear, store under the stair, no corridor) and keeps the candidate with the fewest problems.
- **Validation**: containment, overlaps, minimum sizes, aspect ratio, natural light (party walls are not given windows), door reachability (BFS), stair alignment, wet-area stacking, coverage and height against user limits, and setbacks marked as pending when not supplied. **Infeasible briefs are explained, never drawn.**
- **Interactive SVG plan viewer** with zoom, pan, fit and reset, keyboard controls, a floor switcher, clickable rooms, and a room editor that re-validates (overlaps, access, light) and saves edits as a new version.
- **Exports**: a vector PDF report (cover, sections 2–20, A3 plan sheets at a **standard scale stated only because the geometry is drawn at exactly that ratio**, a scale bar, page numbers and a disclaimer on every page), SVG (1 unit = 1 ft), PNG and JSON.
- **Report** that tags every row as *User-provided*, *Calculated*, *Design suggestion*, *Assumption* or *Needs professional confirmation*.
- **Optional AI (Hugging Face Inference Providers)**: reading visible measurements from plot images, and turning free text into form suggestions. All AI output is schema-validated and shown to you for confirmation, and the app works fully without AI.

### Supported configurations (MVP)

- Automatic layouts: **rectangular / square** residential plots, 1–4 floors, up to 12 bedrooms.
- Irregular / L-shaped / polygonal plots: area from boundary coordinates only. No automatic layout.
- Very narrow plots (buildable width under ~16 ft) and dense single-storey briefs on narrow plots (for example 25 ft wide with 2+ attached-bath bedrooms, a drawing room and a porch) are reported as infeasible, with suggestions.

## Architecture

```
src/
  app/                    Next.js App Router pages + API route handlers
    api/projects/...      CRUD, duplicate, versions, export records (ownership enforced)
    api/ai/...            Hugging Face image reading + requirement extraction
    api/status            DB / AI configuration status
  components/             UI kit, plan viewer, plot diagram, project wizard
  lib/
    schema.ts             Zod schemas + types (single source of truth)
    units.ts, geometry.ts Deterministic conversions, areas, polygon checks
    planner/              specs (planning heuristics), generate, openings, validate
    plan-draw.ts          Layout → renderer-agnostic drawing primitives (SVG + PDF)
    report.ts             Report data with source tags
    client/               storage façade (Mongo API or localStorage), images (IndexedDB), exports, PDF
    server/               db (MongoDB driver), repo (owner-scoped queries), http (validation, rate limit), hf
```

**Data model (MongoDB)**: `users` (anonymous device owners), `projects`, `design_versions` (unique `projectId+version`; previous versions are preserved), and `generated_documents` (export metadata only; files are generated in the browser and not stored).

**Access control**: the prototype has no sign-in. Each browser gets a random, httpOnly `p2p_owner` cookie, and every database query is filtered by that owner id, so visitors cannot read or modify each other's projects. Clearing cookies loses access. This is **not** production account security; add real authentication before a public launch.

**Storage modes**: if `MONGODB_URI` is set and reachable, projects are stored in MongoDB ("Cloud storage" badge). Otherwise the app runs in **browser-storage mode** (localStorage), shows that clearly in the header, and never pretends data was saved to a database.

## Local development

Requirements: Node.js ≥ 20.9.

```bash
npm install
cp .env.example .env.local   # optional: add MONGODB_URI and HF_TOKEN
npm run dev                  # http://localhost:3000
```

Quality checks:

```bash
npm test          # Vitest: units, geometry, schema, planner matrix, PDF/SVG export
npm run lint
npm run typecheck
npm run build
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | No | MongoDB Atlas connection string (server-only). Without it, the app uses browser storage. |
| `MONGODB_DB` | No | Database name, default `plot2plan`. |
| `HF_TOKEN` | No | Hugging Face token with Inference Providers permission (server-only). Without it, AI features are disabled. |
| `HF_VISION_MODEL` | No | Default `Qwen/Qwen3.8-27B` (multimodal; listed with live inference providers when this was built). |
| `HF_TEXT_MODEL` | No | Default `Qwen/Qwen3.8-27B`. |

Secrets are read only in server code (`src/lib/server/*`, guarded by `server-only`) and are never sent to the browser or logged.

## Privacy and data handling

- Plot images are stored only in the user's browser (IndexedDB). For AI reading, a downscaled copy is sent to Hugging Face for that single request and is not stored by Plot2Plan.
- Deleting a project removes its versions and export records from MongoDB and its image from the browser. **Settings → Clear browser data** removes all local data.
- No names, emails or accounts are collected.

## Deployment (Vercel)

1. Import the repository in Vercel (framework preset: Next.js).
2. Add `MONGODB_URI` and/or `HF_TOKEN` under Project → Settings → Environment Variables (Production), then redeploy.
3. In MongoDB Atlas, allow connections from Vercel (Network Access; for serverless functions this is usually `0.0.0.0/0` combined with a strong database-user password), and give the database user read/write access to the `plot2plan` database only.

## Limitations

- Plans are preliminary zoning concepts that use typical planning dimensions, not legal minimums. No structural, MEP, fire-safety or geotechnical design is done.
- Regulatory compliance is never claimed. Limits are checked only against values you enter.
- Rate limiting is best-effort and per server instance.
- Orientation, Vastu, sustainability notes and obstructions are recorded in the report but not yet used by the layout engine.

## Roadmap

Real authentication, irregular-plot layouts, L-shaped rooms and stacked-bath variants for 5-marla plots, drag-to-edit rooms, DXF export, cost estimation from user-supplied rates, and 3D massing.
