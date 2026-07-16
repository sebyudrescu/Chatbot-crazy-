export const SECRET_MASK = "********";
const secretKey = /secret|token|password|api[_-]?key|authorization/i;

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        secretKey.test(key) && typeof item === "string" && item
          ? SECRET_MASK
          : redactSecrets(item),
      ]),
    ) as T;
  }
  return value;
}

export function restoreMaskedSecrets<T>(next: T, current: unknown): T {
  if (next === SECRET_MASK) return current as T;
  if (Array.isArray(next)) {
    const currentArray = Array.isArray(current) ? current : [];
    return next.map((item, index) =>
      restoreMaskedSecrets(item, currentArray[index]),
    ) as T;
  }
  if (next && typeof next === "object") {
    const currentObject =
      current && typeof current === "object"
        ? (current as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      Object.entries(next as Record<string, unknown>).map(([key, item]) => [
        key,
        restoreMaskedSecrets(item, currentObject[key]),
      ]),
    ) as T;
  }
  return next;
}
