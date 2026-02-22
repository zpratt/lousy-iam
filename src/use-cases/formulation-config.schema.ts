import { z } from "zod";

export const FormulationConfigSchema = z.object({
    githubOrg: z.string().min(1, "github_org is required"),
    githubRepo: z.string().min(1, "github_repo is required"),
    resourcePrefix: z.string().min(1, "resource_prefix is required"),
    planApplySeparation: z.boolean().default(true),
    includeDeleteActions: z.boolean().default(true),
    useGithubEnvironments: z.boolean().default(false),
    githubEnvironmentNames: z.record(z.string()).default({}),
    permissionBoundaryArn: z.string().nullable().default(null),
    rolePath: z.string().default("/"),
    maxSessionDuration: z.number().int().min(900).max(43200).default(3600),
});
