export function getInitials(name: string | null | undefined, fallback = "MM") {
  if (!name) {
    return fallback;
  }

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return fallback;
  }

  const first = parts[0]?.[0] ?? fallback[0];
  const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];

  return `${first ?? fallback[0]}${second ?? ""}`.toUpperCase();
}
