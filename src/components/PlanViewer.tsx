"use client";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import type { Drawing } from "@/lib/plan-draw";
import { PlanSvg } from "./PlanSvg";

/** Interactive plan canvas: wheel / buttons to zoom, drag to pan, keyboard arrows to pan. */
export function PlanViewer({ drawing, title, onRoomClick, svgRef }: { drawing: Drawing; title: string; onRoomClick?: (id: string) => void; svgRef?: Ref<SVGSVGElement> }) {
  const base = drawing.view;
  const [view, setView] = useState(base);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const key = `${base.x},${base.y},${base.w},${base.h}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setView(base);
  }

  const zoom = useCallback(
    (factor: number, cx = 0.5, cy = 0.5) =>
      setView((v) => {
        const w = Math.min(base.w * 4, Math.max(base.w / 8, v.w * factor));
        const h = (w / v.w) * v.h;
        return { x: v.x + (v.w - w) * cx, y: v.y + (v.h - h) * cy, w, h };
      }),
    [base.w],
  );

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom]);

  const pan = (dx: number, dy: number) => setView((v) => ({ ...v, x: v.x + dx * v.w, y: v.y + dy * v.h }));

  return (
    <div className="relative h-full min-h-[360px] w-full overflow-hidden rounded-lg border border-line bg-white">
      <div
        ref={box}
        tabIndex={0}
        role="application"
        aria-label={`${title}. Use + and - to zoom, arrow keys to pan, 0 to reset.`}
        className="blueprint-grid h-full w-full touch-none select-none outline-none"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !box.current) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 4) return;
          if (!d.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          d.moved = true;
          const r = box.current.getBoundingClientRect();
          const s = Math.max(view.w / r.width, view.h / r.height);
          setView((v) => ({ ...v, x: d.vx - dx * s, y: d.vy - dy * s }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved) e.stopPropagation();
        }}
        onKeyDown={(e) => {
          const k = e.key;
          if (k === "+" || k === "=") zoom(1 / 1.2);
          else if (k === "-") zoom(1.2);
          else if (k === "0") setView(base);
          else if (k === "ArrowLeft") pan(-0.08, 0);
          else if (k === "ArrowRight") pan(0.08, 0);
          else if (k === "ArrowUp") pan(0, -0.08);
          else if (k === "ArrowDown") pan(0, 0.08);
          else return;
          e.preventDefault();
        }}
      >
        <PlanSvg drawing={drawing} title={title} onRoomClick={onRoomClick} svgRef={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="h-full w-full" />
      </div>
      <div className="no-print absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border border-line bg-white/95 shadow-sm">
        {[
          { label: "Zoom in", icon: Plus, fn: () => zoom(1 / 1.25) },
          { label: "Zoom out", icon: Minus, fn: () => zoom(1.25) },
          { label: "Fit to screen", icon: Maximize2, fn: () => setView(base) },
          { label: "Reset view", icon: RotateCcw, fn: () => setView(base) },
        ].map(({ label, icon: Icon, fn }) => (
          <button key={label} type="button" title={label} aria-label={label} onClick={fn} className="flex h-8 w-8 items-center justify-center border-b border-line text-ink-2 last:border-b-0 hover:bg-[#f0f2f6]">
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
