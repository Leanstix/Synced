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
