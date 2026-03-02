/**
 * ISO week (ISO 8601) utilities for weekly leaderboard.
 * Week 1 is the week containing the first Thursday of the year.
 */

/**
 * Get ISO year and week number for a date.
 * @param {Date} [date=new Date()]
 * @returns {{ year: number, weekNumber: number }}
 */
export function getISOWeekYearAndWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Set to Thursday of the week (ISO: week contains Thursday)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const year = d.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const weekNumber = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year, weekNumber };
}

/**
 * Parse year and week from query params. Returns null if invalid or missing.
 * @param {string|undefined} yearStr
 * @param {string|undefined} weekStr
 * @returns {{ year: number, weekNumber: number } | null}
 */
export function parseYearWeekQuery(yearStr, weekStr) {
  if (yearStr == null || weekStr == null) return null;
  const year = parseInt(yearStr, 10);
  const weekNumber = parseInt(weekStr, 10);
  if (Number.isNaN(year) || Number.isNaN(weekNumber) || weekNumber < 1 || weekNumber > 53) return null;
  return { year, weekNumber };
}
