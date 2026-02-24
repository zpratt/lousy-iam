export interface PolicyStatement {
    readonly Sid: string;
    readonly Effect: "Allow";
    readonly Action: readonly string[];
    readonly Resource: string | readonly string[];
    readonly Condition?: Readonly<
        Record<string, Readonly<Record<string, string | readonly string[]>>>
    >;
}

export interface PolicyDocument {
    readonly Version: "2012-10-17";
    readonly Statement: readonly PolicyStatement[];
}

export interface TrustPolicyStatement {
    readonly Sid: string;
    readonly Effect: "Allow";
    readonly Principal: {
        readonly Federated: string;
    };
    readonly Action: "sts:AssumeRoleWithWebIdentity";
    readonly Condition: Readonly<
        Record<string, Readonly<Record<string, string>>>
    >;
}

export interface TrustPolicyDocument {
    readonly Version: "2012-10-17";
    readonly Statement: readonly TrustPolicyStatement[];
}

export interface PermissionPolicy {
    readonly policy_name: string;
    readonly policy_document: PolicyDocument;
    readonly estimated_size_bytes: number;
}

export interface RoleDefinition {
    readonly role_name: string;
    readonly role_path: string;
    readonly description: string;
    readonly max_session_duration: number;
    readonly permission_boundary_arn: string | null;
    readonly trust_policy: TrustPolicyDocument;
    readonly permission_policies: readonly PermissionPolicy[];
}

export interface FormulationOutput {
    readonly roles: readonly RoleDefinition[];
    readonly template_variables: Readonly<Record<string, string>>;
}
