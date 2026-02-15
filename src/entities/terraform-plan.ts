export type PlanAction = "no-op" | "create" | "read" | "update" | "delete";

export interface ResourceChange {
    readonly address: string;
    readonly type: string;
    readonly provider_name: string;
    readonly change: {
        readonly actions: readonly PlanAction[];
        readonly before: Record<string, unknown> | null;
        readonly after: Record<string, unknown> | null;
    };
}

export interface TerraformPlan {
    readonly format_version: string;
    readonly terraform_version: string;
    readonly resource_changes: readonly ResourceChange[];
}
