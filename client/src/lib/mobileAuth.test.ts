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
