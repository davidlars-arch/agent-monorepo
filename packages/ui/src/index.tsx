import { clsx } from "clsx";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export function Panel({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={clsx(
        "rounded-lg border border-zinc-200 bg-white/88 shadow-sm backdrop-blur",
        className
      )}
    >
      {children}
    </section>
  );
}

export function IconButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 bg-white text-ink transition hover:border-signal hover:text-signal",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
