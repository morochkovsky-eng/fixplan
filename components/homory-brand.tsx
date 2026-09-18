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
    <Image
      alt=""
      aria-hidden="true"
      className={className}
      height={16}
      src="/homory-symbol.svg"
      unoptimized
      width={16}
    />
  );
}
