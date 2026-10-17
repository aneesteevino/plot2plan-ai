"use client";
import type { Drawing } from "../plan-draw";
import type { DesignVersion, Project } from "../schema";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => +v.toFixed(3);

/** Standalone SVG document. Coordinates are in feet (1 user unit = 1 ft). */
export function drawingToSvg(d: Drawing, title: string, pxPerFt = 12): string {
  const v = d.view;
  const body = d.prims
    .map((p) => {
      switch (p.t) {
        case "rect":
          return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="${p.fill ?? "none"}" stroke="${p.stroke ?? "none"}"${p.sw ? ` stroke-width="${p.sw}"` : ""}${p.dash ? ` stroke-dasharray="${p.dash.join(" ")}"` : ""}/>`;
        case "line":
          return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${p.stroke}" stroke-width="${p.sw}"${p.dash ? ` stroke-dasharray="${p.dash.join(" ")}"` : ""}/>`;
        case "poly":
          return `<path d="${p.pts.map(([x, y], i) => `${i ? "L" : "M"}${n(x)} ${n(y)}`).join(" ")}${p.closed ? " Z" : ""}" fill="${p.fill ?? "none"}" stroke="${p.stroke ?? "none"}"${p.sw ? ` stroke-width="${p.sw}"` : ""}/>`;
        case "text":
          return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${n(p.size)}" font-weight="${p.bold ? 600 : 400}" text-anchor="${p.anchor ?? "start"}" fill="${p.fill ?? "#0f1f3d"}"${p.rotate ? ` transform="rotate(${p.rotate} ${n(p.x)} ${n(p.y)})"` : ""}>${esc(p.text)}</text>`;
      }
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(v.w * pxPerFt)}" height="${Math.round(v.h * pxPerFt)}" viewBox="${n(v.x)} ${n(v.y)} ${n(v.w)} ${n(v.h)}" font-family="Helvetica, Arial, sans-serif">
<title>${esc(title)}</title>
<desc>Plot2Plan AI preliminary concept. 1 drawing unit = 1 foot. Not for construction or permit submission without professional review.</desc>
<rect x="${n(v.x)}" y="${n(v.y)}" width="${n(v.w)}" height="${n(v.h)}" fill="#ffffff"/>
${body}
</svg>`;
}

export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "plot2plan";

export function exportSvg(d: Drawing, title: string, fileName: string) {
  download(new Blob([drawingToSvg(d, title)], { type: "image/svg+xml" }), fileName);
}

export async function exportPng(d: Drawing, title: string, fileName: string) {
  const svg = drawingToSvg(d, title, 20);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Could not render the plan image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    const max = 4096;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG encoding failed."))), "image/png"));
    download(blob, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function exportJson(p: Project, v: DesignVersion | null, fileName: string) {
  const data = {
    format: "plot2plan-project",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    notice: "Preliminary concept. Not for construction or permit submission without review by qualified professionals.",
    project: { ...p, image: p.image ? { ...p.image, note: "Image file not included (stored in the browser only)" } : undefined },
    designVersion: v,
  };
  download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), fileName);
}
