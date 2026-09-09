import * as React from "react";

import { cn } from "@/lib/utils";

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-0 overflow-hidden rounded-[16px] border border-border bg-card text-sm text-card-foreground shadow-none [--card-spacing:--spacing(6)] data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-[16px] *:[img:last-child]:rounded-b-[16px]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-t-[16px] px-(--card-spacing) pt-5 pb-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] group-data-[size=sm]/card:pt-4 group-data-[size=sm]/card:pb-4",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({
  className,
  children,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-6 font-medium group-data-[size=sm]/card:text-base group-data-[size=sm]/card:leading-6 group-data-[size=sm]/card:font-medium",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing) pb-(--card-spacing)", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-4 rounded-b-[16px] border-t bg-transparent p-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
