import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-[var(--radius-textarea)] border border-field-border bg-field-background text-field-foreground px-3.5 py-3 text-base leading-6 transition-colors outline-none placeholder:text-field-placeholder hover:bg-field-hover focus-visible:border-focus focus-visible:bg-field-focus focus-visible:ring-3 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:bg-default-soft disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20 md:text-sm md:leading-5 ",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
