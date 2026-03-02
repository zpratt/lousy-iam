export const DANGEROUS_KEYS = new Set([
    "__proto__",
    "constructor",
    "prototype",
]);
const MAX_DEPTH = 64;

function sanitize(value: unknown, depth: number): unknown {
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (depth > MAX_DEPTH) {
        throw new Error("JSON nesting too deep");
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitize(item, depth + 1));
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (DANGEROUS_KEYS.has(key)) {
            continue;
        }
        result[key] = sanitize(val, depth + 1);
    }
    return result;
}

export function stripDangerousKeys(value: unknown): unknown {
    return sanitize(value, 0);
}
