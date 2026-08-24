/** Course entity colors — a course keeps its hue everywhere (chips, exam cards,
 * task dots). Slots inherited from Fin's dataviz-validated dark palette; the
 * teal accent (#22b8cf) is reserved for the brand, never a course. Assigned by
 * course id order, never reshuffled by rank. */
export const COURSE_SLOTS = [
  "#3987e5", // blue
  "#c98500", // gold
  "#d55181", // magenta
  "#199e70", // green
  "#9085e9", // violet
  "#d95926", // orange
  "#b91d63", // carmine
  "#008300", // dark green
];

export function courseColorMap(courseIds: number[]): Map<number, string> {
  const map = new Map<number, string>();
  [...courseIds]
    .sort((a, b) => a - b)
    .forEach((id, i) => map.set(id, COURSE_SLOTS[i % COURSE_SLOTS.length]));
  return map;
}
