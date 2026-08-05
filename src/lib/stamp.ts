import { formatDate } from "./format";
import { formatCoords, type GeoInfo } from "./geo";
import { FONT_STACKS, type Settings } from "./settings";

// The single source of truth for what the stamp looks like. The live preview,
// the captured photo and every recorded video frame all go through here, so what
// you see is exactly what gets burnt in.

export interface StampLine {
  text: string;
  /** font size relative to the configured base size */
  scale: number;
}

export function buildStampLines(settings: Settings, date: Date, geo: GeoInfo | null): StampLine[] {
  const lines: StampLine[] = [];

  const pattern =
    (settings.showWeekday ? "dddd[, ]" : "") + settings.pattern + (settings.showTimezone ? " Z" : "");
  lines.push({ text: formatDate(date, pattern), scale: 1 });

  if (settings.geoEnabled && geo) {
    const parts = [formatCoords(geo.lat, geo.lon, settings.coordFormat)];
    if (settings.showAltitude && geo.altitude !== null) {
      parts.push(`${Math.round(geo.altitude)} m`);
    }
    if (settings.showAccuracy) {
      parts.push(`±${Math.round(geo.accuracy)} m`);
    }
    lines.push({ text: parts.join("  ·  "), scale: 0.62 });

    if (settings.addressEnabled && geo.address) {
      lines.push({ text: geo.address, scale: 0.62 });
    }
  }

  for (const extra of [settings.line1, settings.line2]) {
    if (extra.trim()) lines.push({ text: extra.trim(), scale: 0.72 });
  }

  return lines;
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawStamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lines: StampLine[],
  settings: Settings
): void {
  if (lines.length === 0) return;

  const base = Math.min(width, height);
  const baseFont = settings.fontScale * base;
  const margin = settings.margin * base;
  const family = FONT_STACKS[settings.font];
  const maxWidth = Math.max(width - 2 * margin, 1);

  ctx.save();

  // Measure first; long lines (a full address) are shrunk instead of clipped.
  const metrics = lines.map((line) => {
    let size = baseFont * line.scale;
    ctx.font = `600 ${size}px ${family}`;
    let textWidth = ctx.measureText(line.text).width;
    if (textWidth > maxWidth) {
      size *= maxWidth / textWidth;
      ctx.font = `600 ${size}px ${family}`;
      textWidth = ctx.measureText(line.text).width;
    }
    return { text: line.text, size, textWidth, lineHeight: size * 1.3 };
  });

  const blockWidth = Math.max(...metrics.map((m) => m.textWidth));
  const blockHeight = metrics.reduce((sum, m) => sum + m.lineHeight, 0);

  const [vertical, horizontal] = settings.position.split("-");

  let anchorX: number;
  let align: CanvasTextAlign;
  if (horizontal === "left") {
    align = "left";
    anchorX = margin;
  } else if (horizontal === "right") {
    align = "right";
    anchorX = width - margin;
  } else {
    align = "center";
    anchorX = width / 2;
  }

  let top: number;
  if (vertical === "top") top = margin;
  else if (vertical === "bottom") top = height - margin - blockHeight;
  else top = (height - blockHeight) / 2;

  if (settings.box) {
    const padX = baseFont * 0.4;
    const padY = baseFont * 0.28;
    const boxLeft =
      align === "left" ? anchorX : align === "right" ? anchorX - blockWidth : anchorX - blockWidth / 2;
    ctx.fillStyle = withAlpha(settings.boxColor, settings.boxOpacity);
    roundRectPath(
      ctx,
      boxLeft - padX,
      top - padY,
      blockWidth + padX * 2,
      blockHeight + padY * 2,
      baseFont * 0.2
    );
    ctx.fill();
  }

  const setShadow = (on: boolean, size: number) => {
    ctx.shadowColor = on ? "rgba(0, 0, 0, 0.75)" : "transparent";
    ctx.shadowBlur = on ? size * 0.28 : 0;
    ctx.shadowOffsetY = on ? size * 0.06 : 0;
  };

  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  let y = top;
  for (const m of metrics) {
    ctx.font = `600 ${m.size}px ${family}`;
    const baselineY = y + (m.lineHeight - m.size) / 2;

    // The shadow goes on whichever pass is drawn first, otherwise the glyphs get
    // a doubled, muddy halo.
    if (settings.outline) {
      setShadow(settings.shadow, m.size);
      ctx.lineWidth = m.size * 0.14;
      ctx.strokeStyle = "#000000";
      ctx.strokeText(m.text, anchorX, baselineY);
      setShadow(false, m.size);
      ctx.fillStyle = settings.color;
      ctx.fillText(m.text, anchorX, baselineY);
    } else {
      setShadow(settings.shadow, m.size);
      ctx.fillStyle = settings.color;
      ctx.fillText(m.text, anchorX, baselineY);
      setShadow(false, m.size);
    }

    y += m.lineHeight;
  }

  ctx.restore();
}
