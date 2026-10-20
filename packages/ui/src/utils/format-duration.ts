export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  const hourLabel = `${hours} hr${hours > 1 ? "s" : ""}`;
  return remaining === 0 ? hourLabel : `${hourLabel} ${remaining} min`;
}