import { z } from "zod";

const GITHUB_ORG_REGEX = /^(?!-)(?!.*--)(?!.*-$)[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const GITHUB_REPO_REGEX =
    /^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const AWS_RESOURCE_PREFIX_REGEX = /^[A-Za-z0-9_${}][A-Za-z0-9_\-${}]*$/;
const AWS_ACCOUNT_ID_REGEX = /^\d{12}$/;
const AWS_REGION_REGEX = /^[a-z]{2}(-[a-z]+)+-\d+$/;

export const FormulationConfigSchema = z.object({
    githubOrg: z
        .string()
        .min(1, "github_org is required")
        .regex(
            GITHUB_ORG_REGEX,
            "github_org must contain only letters, numbers, and single hyphens",
        ),
    githubRepo: z
        .string()
        .min(1, "github_repo is required")
        .regex(
            GITHUB_REPO_REGEX,
            "github_repo must contain only letters, numbers, hyphens, underscores, and dots",
        ),
    resourcePrefix: z
        .string()
        .min(1, "resource_prefix is required")
        .regex(
            AWS_RESOURCE_PREFIX_REGEX,
            "resource_prefix must contain only letters, numbers, hyphens, underscores, and template variables",
        ),
    accountId: z
        .string()
        .regex(
            AWS_ACCOUNT_ID_REGEX,
            "account_id must be a 12-digit AWS account ID",
        )
        .nullable()
        .default(null),
    region: z
        .string()
        .regex(
            AWS_REGION_REGEX,
            "region must be a valid AWS region identifier (e.g. us-east-1)",
        )
        .nullable()
        .default(null),
    planApplySeparation: z.boolean().default(true),
    includeDeleteActions: z.boolean().default(true),
    useGithubEnvironments: z.boolean().default(false),
    githubEnvironmentNames: z.record(z.string()).default({}),
    permissionBoundaryArn: z.string().nullable().default(null),
    rolePath: z.string().default("/"),
    maxSessionDuration: z.number().int().min(900).max(43200).default(3600),
});
