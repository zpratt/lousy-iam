export interface CreateRolePayload {
    readonly RoleName: string;
    readonly AssumeRolePolicyDocument: string;
    readonly Path: string;
    readonly Description: string;
    readonly MaxSessionDuration: number;
    readonly PermissionsBoundary?: string;
}

export interface CreatePolicyPayload {
    readonly PolicyName: string;
    readonly PolicyDocument: string;
    readonly Path: string;
    readonly Description: string;
}

export interface AttachRolePolicyPayload {
    readonly RoleName: string;
    readonly PolicyArn: string;
}

export interface RoleSynthesis {
    readonly create_role: CreateRolePayload;
    readonly create_policies: readonly CreatePolicyPayload[];
    readonly attach_role_policies: readonly AttachRolePolicyPayload[];
}

export interface SynthesisOutput {
    readonly roles: readonly RoleSynthesis[];
}

export function normalizePath(path: string): string {
    let normalized = path;
    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }
    if (!normalized.endsWith("/")) {
        normalized = `${normalized}/`;
    }
    return normalized;
}
