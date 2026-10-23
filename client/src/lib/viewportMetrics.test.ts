import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const effect = vi.hoisted(() => ({ run: null as null | (() => void | (() => void)) }));
vi.mock("react", () => ({ useEffect: (callback: () => void | (() => void)) => { effect.run = callback; } }));
import ViewportMetrics from "../components/ViewportMetrics";

function setup(withViewport = true) {
  const style = { setProperty: vi.fn(), removeProperty: vi.fn() };
  const viewport = { height: 700, offsetTop: 0, scale: 1, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const windowMock = { visualViewport: withViewport ? viewport : undefined, innerHeight: 600, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  let scheduled: (() => void) | undefined;
  vi.stubGlobal("document", { documentElement: { style } });
  vi.stubGlobal("window", windowMock);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: () => void) => { scheduled = callback; return 1; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  ViewportMetrics();
  const cleanup = effect.run?.();
  return { style, viewport, windowMock, flush: () => scheduled?.(), cleanup };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("visible viewport sizing", () => {
  it("tracks the remaining height and offset above an open phone keyboard", () => {
    const t = setup();
    t.flush();
    expect(t.style.setProperty).toHaveBeenCalledWith("--app-viewport-height", "700px");
    t.viewport.height = 260;
    t.viewport.offsetTop = 60;
    t.viewport.addEventListener.mock.calls.find(([name]) => name === "resize")?.[1]();
    t.flush();
    expect(t.style.setProperty).toHaveBeenCalledWith("--app-viewport-height", "260px");
    expect(t.style.setProperty).toHaveBeenCalledWith("--app-viewport-top", "60px");
  });
  it("does not resize dialogs repeatedly while the user pinch-zooms", () => {
    const t = setup();
    t.flush();
    t.style.setProperty.mockClear();
    t.viewport.scale = 2;
    t.viewport.addEventListener.mock.calls.find(([name]) => name === "scroll")?.[1]();
    t.flush();
    expect(t.style.setProperty).not.toHaveBeenCalled();
  });
  it("falls back safely when VisualViewport is not available", () => {
    const t = setup(false);
    t.flush();
    expect(t.style.setProperty).toHaveBeenCalledWith("--app-viewport-height", "600px");
    expect(t.style.setProperty).toHaveBeenCalledWith("--app-viewport-top", "0px");
  });
  it("cleans up listeners and metrics without locking the body or moving scanner focus", () => {
    const t = setup();
    t.cleanup?.();
    expect(t.viewport.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(t.viewport.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(t.windowMock.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(t.style.removeProperty).toHaveBeenCalledWith("--app-viewport-height");
    expect(t.style.removeProperty).toHaveBeenCalledWith("--app-viewport-top");
  });
});
