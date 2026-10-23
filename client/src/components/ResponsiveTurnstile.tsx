import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance, type TurnstileProps } from "@marsidev/react-turnstile";

/** Choose supported widget sizes, never visually scale or bypass the challenge. */
export function getTurnstileSize(width: number): "compact" | "flexible" {
  return width < 300 ? "compact" : "flexible";
}

const ResponsiveTurnstile = forwardRef<TurnstileInstance | undefined, TurnstileProps>(
  function ResponsiveTurnstile(props, ref) {
    const container = useRef<HTMLDivElement>(null);
    const expire = useRef(props.onExpire);
    expire.current = props.onExpire;
    const [size, setSize] = useState<"compact" | "flexible" | null>(null);
    useLayoutEffect(() => {
      const element = container.current;
      if (!element) return;
      let current: "compact" | "flexible" | null = null;
      const measure = () => {
        const next = getTurnstileSize(element.clientWidth);
        if (next !== current) {
          // A new size recreates the challenge; discard any previous client token.
          if (current !== null) expire.current?.("");
          current = next;
          setSize(next);
        }
      };
      measure();
      const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
      observer?.observe(element);
      window.addEventListener("resize", measure);
      return () => {
        observer?.disconnect();
        window.removeEventListener("resize", measure);
      };
    }, []);
    return (
      <div ref={container} className="w-full min-w-0">
        {size && <Turnstile {...props} ref={ref} options={{ ...props.options, size }} />}
      </div>
    );
  }
);

export default ResponsiveTurnstile;
