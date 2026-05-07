type LogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_MAP: Record<NonNullable<LogoProps["size"]>, string> = {
  sm: "text-[18px]",
  md: "text-[22px]",
  lg: "text-[28px]",
};

/**
 * Cridl wordmark — bulk uses var(--foreground) so it adapts to light/dark mode,
 * with a fixed blue accent on the final "l" (brand mark, identical in both themes).
 */
export default function Logo({ size = "sm", className = "" }: LogoProps) {
  return (
    <span
      className={`inline-flex items-baseline font-extrabold tracking-[-0.04em] leading-none select-none ${SIZE_MAP[size]} ${className}`}
      aria-label="Cridl"
    >
      <span className="text-[var(--foreground)]">crid</span>
      <span className="text-[#2563eb]">l</span>
    </span>
  );
}
