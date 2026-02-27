import type { FormulationConfig } from "../entities/formulation-config.js";
import type { TrustPolicyDocument } from "../entities/policy-document.js";

export interface TrustPolicyBuilder {
    buildPlanTrust(config: FormulationConfig): TrustPolicyDocument;
    buildApplyTrust(config: FormulationConfig): TrustPolicyDocument;
}

const OIDC_ACCOUNT_ID_PLACEHOLDER =
    // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for user substitution
    "${account_id}";
const OIDC_AUD_KEY = "token.actions.githubusercontent.com:aud";
const OIDC_SUB_KEY = "token.actions.githubusercontent.com:sub";
const AUDIENCE_VALUE = "sts.amazonaws.com";

function resolvePartition(region: string | null): string {
    if (!region || region === "*") {
        return "aws";
    }
    if (region.startsWith("us-gov-")) {
        return "aws-us-gov";
    }
    if (region.startsWith("cn-")) {
        return "aws-cn";
    }
    return "aws";
}

function resolveOidcProviderArn(config: FormulationConfig): string {
    const partition = resolvePartition(config.region);
    const accountId = config.accountId ?? OIDC_ACCOUNT_ID_PLACEHOLDER;
    return `arn:${partition}:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`;
}

export function createTrustPolicyBuilder(): TrustPolicyBuilder {
    return {
        buildPlanTrust(config: FormulationConfig): TrustPolicyDocument {
            const subject = `repo:${config.githubOrg}/${config.githubRepo}:pull_request`;
            const providerArn = resolveOidcProviderArn(config);

            return {
                Version: "2012-10-17",
                Statement: [
                    {
                        Sid: "AllowGitHubOIDCPlanOnPR",
                        Effect: "Allow",
                        Principal: {
                            Federated: providerArn,
                        },
                        Action: "sts:AssumeRoleWithWebIdentity",
                        Condition: {
                            StringEquals: {
                                [OIDC_AUD_KEY]: AUDIENCE_VALUE,
                                [OIDC_SUB_KEY]: subject,
                            },
                        },
                    },
                ],
            };
        },

        buildApplyTrust(config: FormulationConfig): TrustPolicyDocument {
            let subject: string;

            if (config.useGithubEnvironments) {
                const envNames = Object.values(config.githubEnvironmentNames);
                const envName =
                    envNames.length > 0
                        ? envNames[0]
                        : // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM placeholder for user substitution
                          "${github_environment_name}";
                subject = `repo:${config.githubOrg}/${config.githubRepo}:environment:${envName}`;
            } else {
                subject = `repo:${config.githubOrg}/${config.githubRepo}:ref:refs/heads/main`;
            }

            const providerArn = resolveOidcProviderArn(config);

            return {
                Version: "2012-10-17",
                Statement: [
                    {
                        Sid: "AllowGitHubOIDC",
                        Effect: "Allow",
                        Principal: {
                            Federated: providerArn,
                        },
                        Action: "sts:AssumeRoleWithWebIdentity",
                        Condition: {
                            StringEquals: {
                                [OIDC_AUD_KEY]: AUDIENCE_VALUE,
                                [OIDC_SUB_KEY]: subject,
                            },
                        },
                    },
                ],
            };
        },
    };
}
