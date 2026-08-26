/** Course entity colors — a course keeps its hue everywhere (chips, exam cards,
 * task dots). Cool-only palette (2026-08-30 — Lucas: blues/greens/purples,
 * no warm hues), validated with the dataviz six checks on the dark surface:
 * hue families alternate and lightness ladders so neighbors never blur. The
 * teal accent (#22b8cf) stays reserved for the brand, never a course.
 * Assigned by course id order, never reshuffled by rank. */
export const COURSE_SLOTS = [
  "#3f8fe0", // blue
  "#2bab81", // green
  "#8f7ff0", // lavender
  "#2d9fb8", // teal
  "#7d52d8", // violet
  "#4aa94a", // leaf green
  "#2f6fb8", // deep blue
  "#a678e0", // light purple
];

export function courseColorMap(courseIds: number[]): Map<number, string> {
  const map = new Map<number, string>();
  [...courseIds]
    .sort((a, b) => a - b)
    .forEach((id, i) => map.set(id, COURSE_SLOTS[i % COURSE_SLOTS.length]));
  return map;
}
