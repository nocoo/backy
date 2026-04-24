/**
 * Generate page numbers with ellipsis for pagination display.
 * e.g., [1, 2, 3, "...", 10] or [1, "...", 4, 5, 6, "...", 10]
 */
export function generatePageNumbers(
  current: number,
  total: number,
): Array<number | "..."> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: Array<number | "..."> = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push("...");

  pages.push(total);

  return pages;
}

/** Compact single-line date: "Feb 24, 14:03:21" */
export function formatLogDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${month} ${day}, ${h}:${m}:${s}`;
}
