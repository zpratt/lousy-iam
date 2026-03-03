import type { ValidationOutput } from "../entities/validation-result.js";

export function countValidationErrors(validation: ValidationOutput): number {
    return validation.role_results.reduce(
        (sum, r) =>
            sum +
            r.policy_results.reduce((pSum, p) => pSum + p.stats.errors, 0),
        0,
    );
}

export function countValidationWarnings(validation: ValidationOutput): number {
    return validation.role_results.reduce(
        (sum, r) =>
            sum +
            r.policy_results.reduce((pSum, p) => pSum + p.stats.warnings, 0),
        0,
    );
}

export function hasValidationWarnings(validation: ValidationOutput): boolean {
    return validation.role_results.some((r) =>
        r.policy_results.some((p) => p.stats.warnings > 0),
    );
}
