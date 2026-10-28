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
  const width = image.width * scale;
  const height = image.height * scale;
  const normalizedX = (x - (viewport.width - width) / 2) / width;
  const normalizedY = (y - (viewport.height - height) / 2) / height;
  if (
    !clamp &&
    (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1)
  )
    return null;
  return {
    x: Math.max(0, Math.min(1, normalizedX)),
    y: Math.max(0, Math.min(1, normalizedY)),
  };
}
