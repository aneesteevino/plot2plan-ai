import type { Ref } from "react";
import type { Drawing, Prim } from "@/lib/plan-draw";

const FONT = "Geist, 'Helvetica Neue', Arial, sans-serif";

function renderPrim(p: Prim, i: number, onRoom?: (id: string) => void) {
  switch (p.t) {
    case "rect":
      return (
        <rect
          key={i}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          fill={p.fill ?? "none"}
          stroke={p.stroke ?? "none"}
          strokeWidth={p.sw}
          strokeDasharray={p.dash?.join(" ")}
          data-room={p.roomId}
          onClick={p.roomId && onRoom ? () => onRoom(p.roomId!) : undefined}
          style={p.roomId && onRoom ? { cursor: "pointer" } : undefined}
        />
      );
    case "line":
      return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke} strokeWidth={p.sw} strokeDasharray={p.dash?.join(" ")} strokeLinecap="butt" />;
    case "poly": {
      const d = p.pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(3)} ${y.toFixed(3)}`).join(" ") + (p.closed ? " Z" : "");
      return <path key={i} d={d} fill={p.fill ?? "none"} stroke={p.stroke ?? "none"} strokeWidth={p.sw} />;
    }
    case "text":
      return (
        <text
          key={i}
          x={p.x}
          y={p.y}
          fontSize={p.size}
          fontWeight={p.bold ? 600 : 400}
          textAnchor={p.anchor ?? "start"}
          fill={p.fill ?? "#0f1f3d"}
          fontFamily={FONT}
          transform={p.rotate ? `rotate(${p.rotate} ${p.x} ${p.y})` : undefined}
          style={{ pointerEvents: "none", letterSpacing: "0.02em" }}
        >
          {p.text}
        </text>
      );
  }
}

export function PlanSvg({
  drawing,
  title,
  onRoomClick,
  svgRef,
  viewBox,
  className,
}: {
  drawing: Drawing;
  title: string;
  onRoomClick?: (id: string) => void;
  svgRef?: Ref<SVGSVGElement>;
  viewBox?: string;
  className?: string;
}) {
  const v = drawing.view;
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox ?? `${v.x} ${v.y} ${v.w} ${v.h}`}
      role="img"
      aria-label={title}
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      <rect x={v.x - 1000} y={v.y - 1000} width={v.w + 2000} height={v.h + 2000} fill="#ffffff" />
      {drawing.prims.map((p, i) => renderPrim(p, i, onRoomClick))}
    </svg>
  );
}
