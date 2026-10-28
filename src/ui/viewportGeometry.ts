export type Size = { width: number; height: number };

/** Match Image.resizeMode=contain exactly; touch outside the actual image is not remote input. */
export function normalizePoint(
  x: number,
  y: number,
  viewport: Size,
  image: Size,
  clamp: boolean
) {
  if (
    ![x, y, viewport.width, viewport.height, image.width, image.height].every(
      Number.isFinite
    ) ||
    Math.min(viewport.width, viewport.height, image.width, image.height) <= 0
  ) {
    return null;
  }
  const scale = Math.min(
    viewport.width / image.width,
    viewport.height / image.height
  );
