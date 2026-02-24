import Chance from "chance";
import { describe, expect, it } from "vitest";
import { createFormulationOutputParser } from "./parse-formulation-output.js";

const chance = new Chance();

function buildValidFormulationOutputJson() {
    const prefix = chance.word();
    return JSON.stringify({
        roles: [
            {
                role_name: `${prefix}-github-apply`,
                role_path: "/",
                description: chance.sentence(),
                max_session_duration: 3600,
                permission_boundary_arn: null,
                trust_policy: {
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Sid: "AllowGitHubOIDC",
                            Effect: "Allow",
                            Principal: {
                                Federated:
                                    // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder
                                    "arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com",
                            },
                            Action: "sts:AssumeRoleWithWebIdentity",
                            Condition: {
                                StringEquals: {
                                    "token.actions.githubusercontent.com:aud":
                                        "sts.amazonaws.com",
                                    "token.actions.githubusercontent.com:sub": `repo:org/repo:ref:refs/heads/main`,
                                },
                            },
                        },
                    ],
                },
                permission_policies: [
                    {
                        policy_name: `${prefix}-permissions`,
                        policy_document: {
                            Version: "2012-10-17",
                            Statement: [
                                {
                                    Sid: "S3Read",
                                    Effect: "Allow",
                                    Action: ["s3:GetBucketLocation"],
                                    Resource: "*",
                                },
                            ],
                        },
                        estimated_size_bytes: 128,
                    },
                ],
            },
        ],
        template_variables: {
            account_id: "Target AWS account ID",
        },
    });
}

describe("ParseFormulationOutput", () => {
    describe("given valid JSON content", () => {
        it("should parse and return formulation output", () => {
            const parser = createFormulationOutputParser();
            const json = buildValidFormulationOutputJson();

            const result = parser.parse(json);

            expect(result.roles).toHaveLength(1);
            expect(result.roles[0]?.role_name).toContain("github-apply");
        });
    });

    describe("given invalid JSON content", () => {
        it("should throw on malformed JSON", () => {
            const parser = createFormulationOutputParser();

            expect(() => parser.parse("{not valid")).toThrow();
        });

        it("should throw on missing required fields", () => {
            const parser = createFormulationOutputParser();

            expect(() => parser.parse("{}")).toThrow();
        });
    });

    describe("given JSON with prototype pollution keys", () => {
        it("should strip __proto__ keys from template_variables", () => {
            const parser = createFormulationOutputParser();
            const json = buildValidFormulationOutputJson();
            const data = JSON.parse(json);
            data.template_variables.__proto__ = "polluted";
            const result = parser.parse(JSON.stringify(data));

            expect(
                Object.keys(result.template_variables).includes("__proto__"),
            ).toBe(false);
        });
    });
});
