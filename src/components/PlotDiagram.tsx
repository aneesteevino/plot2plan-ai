import type { Plot, Units } from "@/lib/schema";
import { toFeet } from "@/lib/units";

/** Schematic (not to scale) diagram showing which boundary each measurement refers to. */
export function PlotDiagram({ plot, units, highlight }: { plot: Plot; units: Units; highlight?: "front" | "rear" | "left" | "right" }) {
  const v = (n?: number) => (n === undefined ? "?" : `${n} ${units.length}`);
  const hl = (s: string) => (highlight === s ? "#1f4fd1" : "#0f1f3d");
  const poly = plot.shape !== "rectangular" && plot.shape !== "square" && (plot.coordinates?.length ?? 0) >= 3;

  if (poly) {
    const pts = plot.coordinates!.map((p) => ({ x: toFeet(p.x, units.length), y: toFeet(p.y, units.length) }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX || 1;
    const h = Math.max(...ys) - minY || 1;
    const s = 200 / Math.max(w, h);
    const path = pts.map((p, i) => `${i ? "L" : "M"}${30 + (p.x - minX) * s} ${230 - (p.y - minY) * s}`).join(" ") + " Z";
    return (
      <svg viewBox="0 0 260 270" className="h-auto w-full max-w-[280px]" role="img" aria-label="Plot boundary from coordinates (schematic)">
        <path d={path} fill="#e8eefc" stroke="#0f1f3d" strokeWidth="2" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={30 + (p.x - minX) * s} cy={230 - (p.y - minY) * s} r="3" fill="#1f4fd1" />
            <text x={34 + (p.x - minX) * s} y={226 - (p.y - minY) * s} fontSize="10" fill="#3b4a66">
              P{i + 1}
            </text>
          </g>
        ))}
        <text x="130" y="262" textAnchor="middle" fontSize="11" fill="#6b7890">
          Road side assumed along y = 0 · schematic
        </text>
      </svg>
    );
  }

  const trap = plot.shape === "irregular" || plot.shape === "polygonal" || plot.shape === "l-shaped";
  const topInset = trap ? 18 : 0;
  return (
    <svg viewBox="0 0 260 270" className="h-auto w-full max-w-[280px]" role="img" aria-label="Diagram showing front, rear, left and right plot boundaries (not to scale)">
      <path d={`M40 ${40} L${220 - topInset} 40 L220 210 L40 210 Z`} fill="#f5f7fb" stroke="#c3cad6" strokeWidth="1" />
      <line x1="40" y1="210" x2="220" y2="210" stroke={hl("front")} strokeWidth="4" />
      <line x1="40" y1="40" x2={220 - topInset} y2="40" stroke={hl("rear")} strokeWidth="3" />
      <line x1="40" y1="40" x2="40" y2="210" stroke={hl("left")} strokeWidth="3" />
      <line x1={220 - topInset} y1="40" x2="220" y2="210" stroke={hl("right")} strokeWidth="3" />
      <text x="130" y="200" textAnchor="middle" fontSize="12" fontWeight="600" fill={hl("front")}>
        Front: {v(plot.frontWidth)}
      </text>
      <text x="130" y="32" textAnchor="middle" fontSize="12" fill={hl("rear")}>
        Rear: {v(plot.rearWidth)}
      </text>
      <text x="30" y="125" textAnchor="middle" fontSize="12" fill={hl("left")} transform="rotate(-90 30 125)">
        Left: {v(plot.leftDepth)}
      </text>
      <text x="235" y="125" textAnchor="middle" fontSize="12" fill={hl("right")} transform="rotate(90 235 125)">
        Right: {v(plot.rightDepth)}
      </text>
      <rect x="20" y="222" width="220" height="22" rx="2" fill="#eef1f5" />
      <text x="130" y="237" textAnchor="middle" fontSize="11" fontWeight="600" fill="#3b4a66">
        ROAD{plot.roadWidth ? ` · ${plot.roadWidth} ${units.length} wide` : ""}
      </text>
      <text x="130" y="262" textAnchor="middle" fontSize="10" fill="#6b7890">
        Viewed from the road · schematic, not to scale
      </text>
      <text x={plot.entranceSide === "left" ? 52 : 208} y="228" textAnchor="middle" fontSize="14" fill="#1f4fd1">
        ▲
      </text>
    </svg>
  );
}
