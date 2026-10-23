import { afterEach, describe, expect, it, vi } from "vitest";
import { focusNextMobileAuthField, scrollMobileAuthFieldIntoView } from "./mobileAuth";

describe("mobile authentication helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("scrolls again after the mobile keyboard resize window", () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    const previousRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;

    scrollMobileAuthFieldIntoView({ scrollIntoView } as unknown as HTMLElement);
    vi.runAllTimers();

    expect(scrollIntoView).toHaveBeenCalledTimes(3);
    globalThis.requestAnimationFrame = previousRaf;
  });

  it("does not scroll a detached or no-longer-focused password field", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    const scrollIntoView = vi.fn();
    const ownerDocument = { activeElement: null as unknown };
    const element = { scrollIntoView, ownerDocument, isConnected: true };
    ownerDocument.activeElement = element;
    scrollMobileAuthFieldIntoView(element as unknown as HTMLElement);
    ownerDocument.activeElement = {};
    vi.runAllTimers();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    element.isConnected = false;
    scrollMobileAuthFieldIntoView(element as unknown as HTMLElement);
    vi.runAllTimers();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("moves from the password field to the next enabled form control", () => {
    const focus = vi.fn();
    const password = { tabIndex: 0, getAttribute: () => "password", focus } as unknown as HTMLInputElement;
    const confirm = { tabIndex: 0, getAttribute: () => "password", focus: vi.fn() } as unknown as HTMLElement;
    const form = {
      querySelectorAll: () => [password, confirm],
    } as unknown as HTMLFormElement;
    Object.defineProperty(password, "form", { value: form });

    focusNextMobileAuthField(password);

    expect((confirm as HTMLElement).focus).toHaveBeenCalledTimes(1);
  });
});
