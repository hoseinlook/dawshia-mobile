/** Replaces `{name}` placeholders with the given values. */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** Rewrites ASCII digits 0-9 in `text` using the locale's digit set. */
export function localizeDigits(text: string, digits: string): string {
  return text.replace(/[0-9]/g, (d) => digits[Number(d)]);
}
