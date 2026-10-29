export type Size = {width: number; height: number};
export type Point = {x: number; y: number};
export type Rect = Point & Size;

/** A crop must never be mapped onto the whole physical screen. */
export function screenAspectMatches(frame: Size | null, screen: Size | null): boolean {
  if (!frame || !screen || ![frame.width, frame.height, screen.width, screen.height].every(value => Number.isFinite(value) && value > 0)) return false;
  return Math.abs((frame.width / frame.height) / (screen.width / screen.height) - 1) <= 0.03;
}

/** Bounds of a source rendered with objectFit="contain" in a viewport. */
export function containRect(viewport: Size, source: Size): Rect | null {
  if (![viewport.width, viewport.height, source.width, source.height].every(
    value => Number.isFinite(value) && value > 0,
  )) {
    return null;
  }
  const scale = Math.min(viewport.width / source.width, viewport.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height};
}

/** Letterbox touches are ignored; coordinates are relative to the actual image. */
export function normalizeViewportPoint(point: Point, viewport: Size, source: Size): Point | null {
  const rect = containRect(viewport, source);
  if (!rect || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  if (point.x < rect.x || point.y < rect.y || point.x > rect.x + rect.width || point.y > rect.y + rect.height) {
    return null;
  }
  return {x: (point.x - rect.x) / rect.width, y: (point.y - rect.y) / rect.height};
}

export type ScreenGesture =
  | {kind: 'tap'; point: Point}
  | {kind: 'longPress'; point: Point; durationMs: number}
  | {kind: 'swipe'; from: Point; to: Point; durationMs: number};

/** Only gestures beginning and ending within the displayed image are sent. */
export function resolveScreenGesture(
  start: Point,
  end: Point,
  durationMs: number,
  viewport: Size,
  source: Size,
): ScreenGesture | null {
  const from = normalizeViewportPoint(start, viewport, source);
  const to = normalizeViewportPoint(end, viewport, source);
  if (!from || !to || !Number.isFinite(durationMs) || durationMs < 0) return null;
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance > 12) {
    return {kind: 'swipe', from, to, durationMs: Math.max(100, Math.min(2000, durationMs))};
  }
  if (durationMs >= 500) {
    return {kind: 'longPress', point: from, durationMs: Math.min(2000, durationMs)};
  }
  return {kind: 'tap', point: from};
}
