import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[var(--radius-field)] border border-field-border bg-field-background text-field-foreground px-3 py-2 text-base leading-6 transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-field-placeholder hover:bg-field-hover focus-visible:border-focus focus-visible:bg-field-focus focus-visible:ring-3 focus-visible:ring-focus/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-default-soft disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20 md:text-sm md:leading-5 ",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
