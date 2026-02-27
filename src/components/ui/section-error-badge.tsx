// ---------------------------------------------------------------------------
// SectionErrorBadge — red dot with error count for card/section headers
// ---------------------------------------------------------------------------

interface SectionErrorBadgeProps {
  /** Prefix to match error keys against (e.g., "seo", "settings") */
  sectionPrefix: string;
  /** Errors record from useFormValidation */
  errors: Record<string, string>;
}

export function SectionErrorBadge({ sectionPrefix, errors }: SectionErrorBadgeProps) {
  const count = Object.keys(errors).filter((key) => key.startsWith(sectionPrefix)).length;
  if (count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      {count} error{count !== 1 ? 's' : ''}
    </span>
  );
}
