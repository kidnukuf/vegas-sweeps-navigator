/**
 * Mobile authentication helpers.
 *
 * Mobile browsers resize and reposition the visual viewport asynchronously when
 * a password keyboard opens. Repeating an instant scroll after the resize keeps
 * the next field and submit controls reachable on iOS and Android devices.
 */
export function scrollMobileAuthFieldIntoView(element: HTMLElement) {
  const scroll = () => {
    // Keyboard animations must not pull the page back to an old/detached field.
    if (element.isConnected === false) return;
    if (element.ownerDocument && element.ownerDocument.activeElement !== element) return;
    element.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
  };

  // First pass handles ordinary focus. Later passes handle the keyboard resize
  // and browser chrome animation, which occur at different times by device.
  requestAnimationFrame(scroll);
  globalThis.setTimeout(scroll, 180);
  globalThis.setTimeout(scroll, 500);
}

export function focusNextMobileAuthField(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const form = element.form;
  if (!form) return;

  const controls = Array.from(
    form.querySelectorAll<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])"
    )
  ).filter((control) => control.tabIndex !== -1 && control.getAttribute("type") !== "hidden");
  const index = controls.indexOf(element);
  const next = index >= 0 ? controls[index + 1] : undefined;
  next?.focus();
}
