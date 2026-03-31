/**
 * Converts a Date into a human-readable relative age string.
 * Used by read tools to give the AI a clear signal about information recency.
 *
 * Examples:
 *   "5 minutes ago"
 *   "3 hours ago"
 *   "2 days ago"
 *   "1 week ago"
 *   "3 months ago"
 *   "1 year ago"
 */
export function relativeAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
