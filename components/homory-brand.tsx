import Image from "next/image";

export function HomoryLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      alt="Homory"
      className={className}
      height={35}
      priority={priority}
      src="/homory-logo.svg"
      unoptimized
      width={124}
    />
  );
}

export function HomorySymbol({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={["homory-symbol", className].filter(Boolean).join(" ")}
    />
  );
}
