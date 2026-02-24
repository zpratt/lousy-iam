export interface FormulationConfig {
    readonly githubOrg: string;
    readonly githubRepo: string;
    readonly resourcePrefix: string;
    readonly planApplySeparation: boolean;
    readonly includeDeleteActions: boolean;
    readonly useGithubEnvironments: boolean;
    readonly githubEnvironmentNames: Readonly<Record<string, string>>;
    readonly permissionBoundaryArn: string | null;
    readonly rolePath: string;
    readonly maxSessionDuration: number;
}
