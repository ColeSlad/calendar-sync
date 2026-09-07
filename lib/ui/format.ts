export function relativeTime(value: string | undefined): string {
  if (!value) return 'Never';
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.round(Math.abs(elapsed) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function nextSync(minutes: number): string {
  if (minutes % 60 === 0) return `Every ${minutes / 60} hours`;
  return `Every ${minutes} minutes`;
}

