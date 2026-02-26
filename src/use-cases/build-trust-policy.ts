import type { FormulationConfig } from "../entities/formulation-config.js";
import type { TrustPolicyDocument } from "../entities/policy-document.js";

export interface TrustPolicyBuilder {
    buildPlanTrust(config: FormulationConfig): TrustPolicyDocument;
    buildApplyTrust(config: FormulationConfig): TrustPolicyDocument;
}

const OIDC_PROVIDER_ARN_TEMPLATE =
    // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for user substitution
    "arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com";
const OIDC_AUD_KEY = "token.actions.githubusercontent.com:aud";
const OIDC_SUB_KEY = "token.actions.githubusercontent.com:sub";
const AUDIENCE_VALUE = "sts.amazonaws.com";

function resolveOidcProviderArn(config: FormulationConfig): string {
    if (config.accountId) {
        return `arn:aws:iam::${config.accountId}:oidc-provider/token.actions.githubusercontent.com`;
    }
    return OIDC_PROVIDER_ARN_TEMPLATE;
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
