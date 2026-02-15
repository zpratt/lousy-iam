import type { PlanAction } from "./terraform-plan.js";

export type ActionCategory = "read" | "create" | "update" | "delete" | "tag";

export interface ResourceActionEntry {
    readonly terraformType: string;
    readonly service: string;
    readonly actions: {
        readonly read: readonly string[];
        readonly create: readonly string[];
        readonly update: readonly string[];
        readonly delete: readonly string[];
        readonly tag: readonly string[];
    };
}

export function categorizeActions(
    planActions: readonly PlanAction[],
): ActionCategory[] {
    const hasCreate = planActions.includes("create");
    const hasDelete = planActions.includes("delete");
    const hasUpdate = planActions.includes("update");

    if (hasCreate && hasDelete) {
        return ["create", "delete", "read", "tag"];
    }

    if (hasCreate) {
        return ["create", "read", "tag"];
    }

    if (hasUpdate) {
        return ["update", "read", "tag"];
    }

    if (hasDelete) {
        return ["delete", "read"];
    }

    return ["read"];
}
