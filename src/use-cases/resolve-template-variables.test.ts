import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { FormulationConfig } from "../entities/formulation-config.js";
import { createTemplateVariableResolver } from "./resolve-template-variables.js";

const chance = new Chance();

function buildConfig(
    overrides?: Partial<FormulationConfig>,
): FormulationConfig {
    return {
        githubOrg: chance.word(),
        githubRepo: chance.word(),
        resourcePrefix: chance.word(),
        accountId: null,
        region: null,
        planApplySeparation: true,
        includeDeleteActions: true,
        useGithubEnvironments: false,
        githubEnvironmentNames: {},
        permissionBoundaryArn: null,
        rolePath: "/",
        maxSessionDuration: 3600,
        templateVariables: {},
        ...overrides,
    };
}

describe("TemplateVariableResolver", () => {
    const resolver = createTemplateVariableResolver();

    describe("given input with no template variables", () => {
        it("should return input unchanged", () => {
            // Arrange
            const input = '{"key": "value"}';
            const templateVariables: Record<string, string> = {};
            const config = buildConfig();

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({ resolved: true, output: input });
        });
    });

    describe("given config provides account_id", () => {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: testing IAM placeholder
        it("should replace ${account_id} placeholders with config value", () => {
            // Arrange
            const accountId = "123456789012";
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "arn:aws:iam::${account_id}:role/test";
            const templateVariables = {
                account_id: "Target AWS account ID",
            };
            const config = buildConfig({ accountId });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:iam::${accountId}:role/test`,
            });
        });
    });

    describe("given template_variables contains a resolved account_id value", () => {
        it("should use the resolved value when config omits account_id", () => {
            // Arrange
            const resolvedAccountId = "987654321012";
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "arn:aws:iam::${account_id}:policy/test";
            const templateVariables = {
                account_id: resolvedAccountId,
            };
            const config = buildConfig({ accountId: null });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:iam::${resolvedAccountId}:policy/test`,
            });
        });
    });

    describe("given config and template_variables both provide resolved values", () => {
        it("should prefer config value over template_variables value", () => {
            // Arrange
            const configAccountId = "111111111111";
            const templateAccountId = "222222222222";
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "arn:aws:iam::${account_id}:role/test";
            const templateVariables = {
                account_id: templateAccountId,
            };
            const config = buildConfig({ accountId: configAccountId });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:iam::${configAccountId}:role/test`,
            });
        });
    });

    describe("given template_variables has descriptive placeholder and config omits value", () => {
        it("should return error with missing variable names", () => {
            // Arrange
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "arn:aws:iam::${account_id}:role/test";
            const templateVariables = {
                account_id: "Target AWS account ID",
            };
            const config = buildConfig({ accountId: null });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: false,
                missingVariables: ["account_id"],
            });
        });
    });

    describe("given multiple template variables with some missing", () => {
        it("should list all missing variables", () => {
            // Arrange
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "${account_id} ${region}";
            const templateVariables = {
                account_id: "Target AWS account ID",
                region: "Target AWS region",
            };
            const config = buildConfig({ accountId: null, region: null });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result.resolved).toBe(false);
            if (!result.resolved) {
                expect(result.missingVariables).toContain("account_id");
                expect(result.missingVariables).toContain("region");
            }
        });
    });

    describe("given config provides region", () => {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: testing IAM placeholder
        it("should replace ${region} placeholder", () => {
            // Arrange
            const region = "us-east-1";
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM placeholder for testing
            const input = "arn:aws:s3:::bucket-${region}-*";
            const templateVariables = { region: "Target AWS region" };
            const config = buildConfig({ region });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:s3:::bucket-${region}-*`,
            });
        });
    });

    describe("given template_variables has resolved region value", () => {
        it("should use the resolved region when config omits it", () => {
            // Arrange
            const resolvedRegion = "eu-west-1";
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM placeholder for testing
            const input = "arn:aws:s3:::bucket-${region}-*";
            const templateVariables = { region: resolvedRegion };
            const config = buildConfig({ region: null });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:s3:::bucket-${resolvedRegion}-*`,
            });
        });
    });

    describe("given multiple occurrences of the same placeholder", () => {
        it("should replace all occurrences", () => {
            // Arrange
            const accountId = "123456789012";
            const input =
                // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
                "arn:aws:iam::${account_id}:role/test arn:aws:iam::${account_id}:policy/test";
            const templateVariables = {
                account_id: "Target AWS account ID",
            };
            const config = buildConfig({ accountId });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:iam::${accountId}:role/test arn:aws:iam::${accountId}:policy/test`,
            });
        });
    });

    describe("given template_variables has wildcard region '*' and config omits region", () => {
        it("should treat '*' as a resolved value for region", () => {
            // Arrange
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM placeholder for testing
            const input = "arn:aws:s3:::bucket-${region}-*";
            const templateVariables = { region: "*" };
            const config = buildConfig({ region: null });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: "arn:aws:s3:::bucket-*-*",
            });
        });
    });

    describe("given template_variables has extra keys not referenced in input", () => {
        it("should ignore unreferenced keys and resolve successfully", () => {
            // Arrange
            const accountId = "123456789012";
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "arn:aws:iam::${account_id}:role/test";
            const templateVariables = {
                account_id: "Target AWS account ID",
                region: "Target AWS region",
                resource_prefix: "myprefix",
                org: "my-org",
                repo: "my-repo",
            };
            const config = buildConfig({ accountId });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:iam::${accountId}:role/test`,
            });
        });
    });

    describe("given template_variables has unresolvable keys but none are referenced in input", () => {
        it("should resolve successfully without errors for unreferenced keys", () => {
            // Arrange
            const input = '{"key": "no-placeholders-here"}';
            const templateVariables = {
                account_id: "Target AWS account ID",
                region: "Target AWS region",
                resource_prefix: "myprefix",
                org: "my-org",
                repo: "my-repo",
            };
            const config = buildConfig({ accountId: null, region: null });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: input,
            });
        });
    });

    describe("given input contains placeholder but templateVariables omits the key", () => {
        it("should report the missing key", () => {
            // Arrange
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "arn:aws:iam::${account_id}:role/test";
            const templateVariables: Record<string, string> = {};
            const config = buildConfig({ accountId: null });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: false,
                missingVariables: ["account_id"],
            });
        });

        it("should resolve via config even when templateVariables omits the key", () => {
            // Arrange
            const accountId = "123456789012";
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "arn:aws:iam::${account_id}:role/test";
            const templateVariables: Record<string, string> = {};
            const config = buildConfig({ accountId });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:iam::${accountId}:role/test`,
            });
        });
    });

    describe("given template_variables has user-defined keys not in the validator map", () => {
        it("should treat user-defined values as resolved for keys without validators", () => {
            // Arrange
            const bucketName = chance.word();
            const keyPrefix = chance.word();
            const lockTable = chance.word();
            const input =
                // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
                "arn:aws:s3:::${state_bucket}/${state_key_prefix}* arn:aws:dynamodb:us-east-1:123456789012:table/${lock_table}";
            const templateVariables = {
                state_bucket: bucketName,
                state_key_prefix: keyPrefix,
                lock_table: lockTable,
            };
            const config = buildConfig();

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:s3:::${bucketName}/${keyPrefix}* arn:aws:dynamodb:us-east-1:123456789012:table/${lockTable}`,
            });
        });
    });

    describe("given config.templateVariables provides a value for an unknown key", () => {
        it("should resolve the placeholder from config.templateVariables", () => {
            // Arrange
            const bucketName = chance.word();
            const keyPrefix = chance.word();
            const lockTable = chance.word();
            const input =
                // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
                "arn:aws:s3:::${state_bucket}/${state_key_prefix}* arn:aws:dynamodb:us-east-1:123456789012:table/${lock_table}";
            const templateVariables: Record<string, string> = {};
            const config = buildConfig({
                templateVariables: {
                    state_bucket: bucketName,
                    state_key_prefix: keyPrefix,
                    lock_table: lockTable,
                },
            });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:s3:::${bucketName}/${keyPrefix}* arn:aws:dynamodb:us-east-1:123456789012:table/${lockTable}`,
            });
        });

        it("should prefer named config fields over config.templateVariables", () => {
            // Arrange
            const configAccountId = "111111111111";
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "arn:aws:iam::${account_id}:role/test";
            const templateVariables: Record<string, string> = {};
            const config = buildConfig({
                accountId: configAccountId,
                templateVariables: {
                    account_id: "222222222222",
                },
            });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                output: `arn:aws:iam::${configAccountId}:role/test`,
            });
        });
    });

    describe("given a replacement value that contains the placeholder string", () => {
        it("should not cause an infinite loop", () => {
            // Arrange
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for testing
            const input = "prefix-${region}-suffix";
            const templateVariables = { region: "us-east-1" };
            // biome-ignore lint/suspicious/noTemplateCurlyInString: testing edge case where config contains placeholder text
            const config = buildConfig({ region: "${region}-expanded" });

            // Act
            const result = resolver.resolve(input, templateVariables, config);

            // Assert
            expect(result).toEqual({
                resolved: true,
                // biome-ignore lint/suspicious/noTemplateCurlyInString: expected output contains literal placeholder text from config value
                output: "prefix-${region}-expanded-suffix",
            });
        });
    });
});
