import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { FormulationConfig } from "../entities/formulation-config.js";
import { createOutputVariableResolver } from "./resolve-output-variables.js";
import type { TemplateVariableResolver } from "./resolve-template-variables.js";

const chance = new Chance();

function buildConfig(
    overrides?: Partial<FormulationConfig>,
): FormulationConfig {
    return {
        githubOrg: chance.word(),
        githubRepo: chance.word(),
        resourcePrefix: chance.word(),
        accountId: "123456789012",
        region: "us-east-1",
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

function buildResolver(
    resolveFn?: TemplateVariableResolver["resolve"],
): TemplateVariableResolver {
    return {
        resolve:
            resolveFn ??
            vi.fn().mockReturnValue({ resolved: true, output: "resolved" }),
    };
}

function buildPassthroughResolver(): TemplateVariableResolver {
    return {
        resolve: vi.fn((input: string) => ({
            resolved: true as const,
            output: input,
        })),
    };
}

describe("OutputVariableResolver", () => {
    describe("given an object with string values containing placeholders", () => {
        it("should resolve all string values via the resolver", () => {
            // Arrange
            const resolver = buildResolver(
                vi.fn((input: string) => ({
                    resolved: true as const,
                    output: input.replaceAll(
                        // biome-ignore lint/suspicious/noTemplateCurlyInString: test placeholder
                        "${bucket}",
                        "my-bucket",
                    ),
                })),
            );
            const config = buildConfig();
            const templateVars = { bucket: "my-bucket" };
            const input = {
                // biome-ignore lint/suspicious/noTemplateCurlyInString: test placeholder
                resource: "arn:aws:s3:::${bucket}",
            };

            const outputResolver = createOutputVariableResolver(resolver);

            // Act
            const result = outputResolver.resolve(input, templateVars, config);

            // Assert
            expect(result.resolved).toBe(true);
            if (result.resolved) {
                expect(result.output).toEqual({
                    resource: "arn:aws:s3:::my-bucket",
                });
            }
        });
    });

    describe("given an object with nested arrays and objects", () => {
        it("should recursively resolve all string values", () => {
            // Arrange
            const replacements: Record<string, string> = {
                "${var}": "resolved",
            };
            const resolver = buildResolver(
                vi.fn((input: string) => ({
                    resolved: true as const,
                    output: Object.entries(replacements).reduce(
                        (acc, [k, v]) => acc.replaceAll(k, v),
                        input,
                    ),
                })),
            );
            const config = buildConfig();
            const input = {
                // biome-ignore lint/suspicious/noTemplateCurlyInString: test placeholder
                items: [{ name: "${var}" }],
                // biome-ignore lint/suspicious/noTemplateCurlyInString: test placeholder
                nested: { deep: "${var}" },
            };

            const outputResolver = createOutputVariableResolver(resolver);

            // Act
            const result = outputResolver.resolve(input, {}, config);

            // Assert
            expect(result.resolved).toBe(true);
            if (result.resolved) {
                expect(result.output).toEqual({
                    items: [{ name: "resolved" }],
                    nested: { deep: "resolved" },
                });
            }
        });
    });

    describe("given missing template variables", () => {
        it("should return resolved false with missing variable names", () => {
            // Arrange
            const missingVar = chance.word();
            const resolver = buildResolver(
                vi.fn(() => ({
                    resolved: false as const,
                    missingVariables: [missingVar],
                })),
            );
            const config = buildConfig();
            const input = { key: "value-with-placeholder" };

            const outputResolver = createOutputVariableResolver(resolver);

            // Act
            const result = outputResolver.resolve(input, {}, config);

            // Assert
            expect(result.resolved).toBe(false);
            if (!result.resolved) {
                expect(result.missingVariables).toContain(missingVar);
            }
        });
    });

    describe("given a resolved key that is a dangerous object key", () => {
        it("should throw an error rejecting the unsafe key", () => {
            // Arrange
            const resolver = buildResolver(
                vi.fn((input: string) => ({
                    resolved: true as const,
                    output: input === "placeholder" ? "__proto__" : input,
                })),
            );
            const config = buildConfig();
            const input = { placeholder: "value" };

            const outputResolver = createOutputVariableResolver(resolver);

            // Act & Assert
            expect(() => outputResolver.resolve(input, {}, config)).toThrow(
                "unsafe object key",
            );
        });
    });

    describe("given template variables that resolve two different keys to the same value", () => {
        it("should throw an error about duplicate resolved keys", () => {
            // Arrange
            const resolver = buildResolver(
                vi.fn((input: string) => ({
                    resolved: true as const,
                    output:
                        input === "key_a" || input === "key_b"
                            ? "same_key"
                            : input,
                })),
            );
            const config = buildConfig();
            const input = { key_a: "val-a", key_b: "val-b" };

            const outputResolver = createOutputVariableResolver(resolver);

            // Act & Assert
            expect(() => outputResolver.resolve(input, {}, config)).toThrow(
                "duplicate object key",
            );
        });
    });

    describe("given input nested deeper than the maximum allowed depth", () => {
        it("should throw an error about nesting too deep", () => {
            // Arrange
            const resolver = buildPassthroughResolver();
            const config = buildConfig();

            // Build an object nested 65 levels deep (exceeds MAX_DEPTH of 64)
            let input: Record<string, unknown> = { leaf: "value" };
            for (let i = 0; i < 65; i++) {
                input = { nested: input };
            }

            const outputResolver = createOutputVariableResolver(resolver);

            // Act & Assert
            expect(() => outputResolver.resolve(input, {}, config)).toThrow(
                "exceeded maximum nesting depth",
            );
        });
    });

    describe("given input with deeply nested arrays exceeding maximum depth", () => {
        it("should throw an error about nesting too deep", () => {
            // Arrange
            const resolver = buildPassthroughResolver();
            const config = buildConfig();

            // Build an array nested 65 levels deep (exceeds MAX_DEPTH of 64)
            let input: unknown = "leaf";
            for (let i = 0; i < 65; i++) {
                input = [input];
            }

            const outputResolver = createOutputVariableResolver(resolver);

            // Act & Assert
            expect(() =>
                outputResolver.resolve({ data: input }, {}, config),
            ).toThrow("exceeded maximum nesting depth");
        });
    });

    describe("given non-object/non-string primitive values", () => {
        it("should pass through numbers, booleans, and nulls unchanged", () => {
            // Arrange
            const resolver = buildPassthroughResolver();
            const config = buildConfig();
            const input = {
                count: 42,
                active: true,
                boundary: null,
                name: "test",
            };

            const outputResolver = createOutputVariableResolver(resolver);

            // Act
            const result = outputResolver.resolve(input, {}, config);

            // Assert
            expect(result.resolved).toBe(true);
            if (result.resolved) {
                expect(result.output).toEqual({
                    count: 42,
                    active: true,
                    boundary: null,
                    name: "test",
                });
            }
        });
    });
});
