export type ReportFilterInput = { from?: string; to?: string; className?: string; examId?: string };
export type ReportFilters = { from?: Date; to?: Date; className?: string; examId?: string };
const DATE_PATTERN = /^\\d{4}-\\d{2}-\\d{2}$/;
const OBJECT_ID_PATTERN = /^[a-f\\d]{24}$/i;
export function parseReportFilters(input: ReportFilterInput): { success: true; data: ReportFilters } | { success: false; error: string } {
  const fromRaw = input.from?.trim(), toRaw = input.to?.trim(), className = input.className?.trim(), examId = input.examId?.trim();
  if (fromRaw && !DATE_PATTERN.test(fromRaw)) return { success: false, error: "Start date must use YYYY-MM-DD." };
  if (toRaw && !DATE_PATTERN.test(toRaw)) return { success: false, error: "End date must use YYYY-MM-DD." };
  if (examId && !OBJECT_ID_PATTERN.test(examId)) return { success: false, error: "Invalid exam selection." };
  if (className && className.length > 60) return { success: false, error: "Class filter is too long." };
  const from = fromRaw ? new Date(fromRaw + "T00:00:00.000Z") : undefined;
  const to = toRaw ? new Date(toRaw + "T23:59:59.999Z") : undefined;
  if (from && (Number.isNaN(from.getTime()) || from.toISOString().slice(0,10) !== fromRaw)) return { success: false, error: "Invalid start date." };
  if (to && (Number.isNaN(to.getTime()) || to.toISOString().slice(0,10) !== toRaw)) return { success: false, error: "Invalid end date." };
  if (from && to && from > to) return { success: false, error: "Start date must be on or before the end date." };
  if (from && to && to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) return { success: false, error: "Choose a date range of 366 days or less." };
  return { success: true, data: { from, to, className: className || undefined, examId: examId || undefined } };
}
