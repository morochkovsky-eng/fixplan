import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-[var(--radius-pill)] border border-transparent px-2.5 py-1 text-[length:var(--font-label-size)] leading-5 font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-accent-hover",
        secondary:
          "bg-default text-default-foreground [a]:hover:bg-default-hover",
        destructive:
          "bg-danger-soft text-danger-soft-foreground focus-visible:ring-danger/30 [a]:hover:bg-danger-soft-hover",
        success:
          "bg-success-soft text-success-soft-foreground focus-visible:ring-success/30 [a]:hover:bg-success-soft-hover",
        warning:
          "bg-warning-soft text-warning-soft-foreground focus-visible:ring-warning/30 [a]:hover:bg-warning-soft-hover",
        outline:
          "border-border text-foreground [a]:hover:bg-default-hover",
        ghost:
          "hover:bg-default-soft-hover hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
