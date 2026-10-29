import {describe, expect, it} from 'vitest';
import {containRect, normalizeViewportPoint, resolveScreenGesture, screenAspectMatches} from './viewportGeometry';

describe('contained remote-screen coordinates', () => {
  const viewport = {width: 400, height: 400};
  const portrait = {width: 100, height: 200};

  it('centers the image and excludes horizontal letterboxing', () => {
    expect(containRect(viewport, portrait)).toEqual({x: 100, y: 0, width: 200, height: 400});
    expect(normalizeViewportPoint({x: 50, y: 200}, viewport, portrait)).toBeNull();
    expect(normalizeViewportPoint({x: 200, y: 200}, viewport, portrait)).toEqual({x: 0.5, y: 0.5});
    expect(normalizeViewportPoint({x: 300, y: 400}, viewport, portrait)).toEqual({x: 1, y: 1});
  });

  it('handles landscape orientation and vertical letterboxing', () => {
    const landscape = {width: 200, height: 100};
    expect(containRect(viewport, landscape)).toEqual({x: 0, y: 100, width: 400, height: 200});
    expect(normalizeViewportPoint({x: 200, y: 50}, viewport, landscape)).toBeNull();
    expect(normalizeViewportPoint({x: 100, y: 150}, viewport, landscape)).toEqual({x: 0.25, y: 0.25});
  });

  it('waits for valid remote and viewport dimensions', () => {
    expect(containRect(viewport, {width: 0, height: 0})).toBeNull();
    expect(containRect({width: NaN, height: 400}, portrait)).toBeNull();
    expect(normalizeViewportPoint({x: Infinity, y: 200}, viewport, portrait)).toBeNull();
  });

  it('blocks cropped, rotated, and unmeasured video frames from controlling the full screen', () => {
    expect(screenAspectMatches({width: 540, height: 1200}, {width: 1080, height: 2400})).toBe(true);
    expect(screenAspectMatches({width: 540, height: 1190}, {width: 1080, height: 2400})).toBe(true);
    expect(screenAspectMatches({width: 540, height: 1000}, {width: 1080, height: 2400})).toBe(false);
    expect(screenAspectMatches({width: 1200, height: 540}, {width: 1080, height: 2400})).toBe(false);
    expect(screenAspectMatches(null, {width: 1080, height: 2400})).toBe(false);
    expect(screenAspectMatches({width: 540, height: 1200}, {width: 0, height: 0})).toBe(false);
  });

  it('distinguishes deliberate taps, long presses, and bounded swipes', () => {
    expect(resolveScreenGesture({x: 200, y: 200}, {x: 202, y: 202}, 200, viewport, portrait))
      .toEqual({kind: 'tap', point: {x: 0.5, y: 0.5}});
    expect(resolveScreenGesture({x: 200, y: 200}, {x: 200, y: 200}, 700, viewport, portrait))
      .toEqual({kind: 'longPress', point: {x: 0.5, y: 0.5}, durationMs: 700});
    expect(resolveScreenGesture({x: 200, y: 100}, {x: 200, y: 300}, 5000, viewport, portrait))
      .toEqual({kind: 'swipe', from: {x: 0.5, y: 0.25}, to: {x: 0.5, y: 0.75}, durationMs: 2000});
    expect(resolveScreenGesture({x: 200, y: 100}, {x: 200, y: 300}, 30, viewport, portrait))
      .toEqual({kind: 'swipe', from: {x: 0.5, y: 0.25}, to: {x: 0.5, y: 0.75}, durationMs: 100});
    expect(resolveScreenGesture({x: 200, y: 100}, {x: 350, y: 300}, 300, viewport, portrait)).toBeNull();
  });
});
