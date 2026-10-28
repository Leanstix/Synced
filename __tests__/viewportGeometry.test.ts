import { normalizePoint } from "../src/ui/viewportGeometry";

const viewport = { width: 300, height: 400 };
const portrait = { width: 100, height: 200 };
it("maps the center of a portrait frame through horizontal letterboxing", () => {
  expect(normalizePoint(150, 200, viewport, portrait, false)).toEqual({
    x: 0.5,
    y: 0.5,
  });
});
it("ignores a touch in the horizontal black bar", () => {
  expect(normalizePoint(20, 200, viewport, portrait, false)).toBeNull();
});
it("maps actual image edges to remote display edges", () => {
  expect(normalizePoint(50, 0, viewport, portrait, false)).toEqual({
    x: 0,
    y: 0,
  });
  expect(normalizePoint(250, 400, viewport, portrait, false)).toEqual({
    x: 1,
    y: 1,
  });
});
it("ignores top letterboxing around a landscape frame", () => {
  expect(
    normalizePoint(150, 50, viewport, { width: 200, height: 100 }, false)
  ).toBeNull();
});
it("clamps a swipe endpoint that leaves the captured image", () => {
  expect(normalizePoint(-20, 500, viewport, portrait, true)).toEqual({
    x: 0,
    y: 1,
  });
});
it("rejects nonfinite input and zero dimensions during layout", () => {
  expect(normalizePoint(NaN, 1, viewport, portrait, true)).toBeNull();
  expect(
    normalizePoint(1, 1, { width: 0, height: 400 }, portrait, false)
  ).toBeNull();
});
