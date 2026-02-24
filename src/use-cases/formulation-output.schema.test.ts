import Chance from "chance";
import { describe, expect, it } from "vitest";
import { FormulationOutputSchema } from "./formulation-output.schema.js";

const chance = new Chance();

function buildValidFormulationOutput() {
    const prefix = chance.word();
    return {
        roles: [
            {
                role_name: `${prefix}-github-apply`,
                role_path: "/",
                description: chance.sentence(),
                max_session_duration: 3600,
                permission_boundary_arn: null,
                trust_policy: {
                    Version: "2012-10-17" as const,
                    Statement: [
                        {
                            Sid: "AllowGitHubOIDC",
                            Effect: "Allow" as const,
                            Principal: {
                                Federated:
                                    // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder
                                    "arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com",
                            },
                            Action: "sts:AssumeRoleWithWebIdentity" as const,
                            Condition: {
                                StringEquals: {
                                    "token.actions.githubusercontent.com:aud":
                                        "sts.amazonaws.com",
                                    "token.actions.githubusercontent.com:sub": `repo:${chance.word()}/${chance.word()}:ref:refs/heads/main`,
                                },
                            },
                        },
                    ],
                },
                permission_policies: [
                    {
                        policy_name: `${prefix}-github-apply-permissions`,
                        policy_document: {
                            Version: "2012-10-17" as const,
                            Statement: [
                                {
                                    Sid: "S3Read",
                                    Effect: "Allow" as const,
                                    Action: [
                                        "s3:GetBucketLocation",
                                        "s3:ListBucket",
                                    ],
                                    Resource: `arn:aws:s3:::${prefix}-*`,
                                },
                            ],
                        },
                        estimated_size_bytes: 256,
                    },
                ],
            },
        ],
        template_variables: {
            account_id: "Target AWS account ID",
            region: "Target region",
        },
    };
}

describe("FormulationOutputSchema", () => {
    describe("given valid formulation output", () => {
        it("should accept a well-formed output", () => {
            const input = buildValidFormulationOutput();

            const result = FormulationOutputSchema.safeParse(input);

            expect(result.success).toBe(true);
        });

        it("should accept a policy with Condition block", () => {
            const input = buildValidFormulationOutput();
            const role = input.roles[0];
            if (role) {
                const policy = role.permission_policies[0];
                if (policy) {
                    policy.policy_document.Statement = [
                        {
                            Sid: "PassRole",
                            Effect: "Allow" as const,
                            Action: ["iam:PassRole"],
                            Resource: "*",
                            Condition: {
                                StringEquals: {
                                    "iam:PassedToService":
                                        "ecs-tasks.amazonaws.com",
                                },
                            },
                        },
                    ];
                }
            }

            const result = FormulationOutputSchema.safeParse(input);

            expect(result.success).toBe(true);
        });
    });

    describe("given invalid formulation output", () => {
        it("should reject when roles is missing", () => {
            const result = FormulationOutputSchema.safeParse({
                template_variables: {},
            });

            expect(result.success).toBe(false);
        });

        it("should accept trust policy with non-standard action for validation", () => {
            const input = buildValidFormulationOutput();
            const role = input.roles[0];
            if (role) {
                (
                    role.trust_policy.Statement[0] as Record<string, unknown>
                ).Action = "sts:AssumeRole";
            }

            const result = FormulationOutputSchema.safeParse(input);

            expect(result.success).toBe(true);
        });

        it("should accept policy without Version for validation", () => {
            const input = buildValidFormulationOutput();
            const role = input.roles[0];
            if (role) {
                (
                    role.permission_policies[0] as Record<string, unknown>
                ).policy_document = {
                    Statement: [],
                };
            }

            const result = FormulationOutputSchema.safeParse(input);

            expect(result.success).toBe(true);
        });
    });
});
