export interface FormulationConfig {
    readonly githubOrg: string;
    readonly githubRepo: string;
    readonly resourcePrefix: string;
    readonly accountId: string | null;
    readonly region: string | null;
    readonly planApplySeparation: boolean;
    readonly includeDeleteActions: boolean;
    readonly useGithubEnvironments: boolean;
    readonly githubEnvironmentNames: Readonly<Record<string, string>>;
    readonly permissionBoundaryArn: string | null;
    readonly rolePath: string;
    readonly maxSessionDuration: number;
    readonly templateVariables: Readonly<Record<string, string>>;
}
