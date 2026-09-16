import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-[length:var(--font-label-size)] max-[760px]:text-[length:var(--font-label-mobile-size)] leading-5 font-medium whitespace-nowrap outline-none select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-accent-hover",
        outline:
          "border-border bg-surface text-surface-foreground hover:bg-default-hover aria-expanded:bg-default-hover",
        secondary:
          "bg-default text-default-foreground hover:bg-default-hover aria-expanded:bg-default-hover",
        ghost:
          "hover:bg-default-soft-hover hover:text-foreground aria-expanded:bg-default-soft-hover",
        destructive:
          "bg-danger text-danger-foreground hover:bg-danger-hover focus-visible:border-danger focus-visible:ring-danger/30",
        "destructive-soft":
          "bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft-hover focus-visible:border-danger focus-visible:ring-danger/30",
        success:
          "bg-success text-success-foreground hover:bg-success-hover focus-visible:border-success focus-visible:ring-success/30",
        "success-outline":
          "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)] hover:bg-[color-mix(in_oklch,var(--status-success-bg),var(--status-success-fg)_6%)]",
        warning:
          "bg-warning text-warning-foreground hover:bg-warning-hover focus-visible:border-warning focus-visible:ring-warning/30",
        "warning-outline":
          "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] hover:bg-[color-mix(in_oklch,var(--status-warning-bg),var(--status-warning-fg)_6%)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-2 px-3 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-8 gap-1.5 px-2.5 text-[length:var(--font-label-size)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 px-3 text-[length:var(--font-label-size)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 gap-2 px-4 text-base leading-6",
        icon: "size-9",
        "icon-xs":
          "size-8 in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9 in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
