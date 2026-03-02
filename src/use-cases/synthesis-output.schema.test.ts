import Chance from "chance";
import { describe, expect, it } from "vitest";
import { SynthesisOutputSchema } from "./synthesis-output.schema.js";

const chance = new Chance();

function buildValidOutput() {
    const roleName = `${chance.word()}-github-apply`;
    const policyName = `${roleName}-permissions`;
    return {
        roles: [
            {
                create_role: {
                    RoleName: roleName,
                    AssumeRolePolicyDocument: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [],
                    }),
                    Path: "/",
                    Description: chance.sentence(),
                    MaxSessionDuration: 3600,
                },
                create_policies: [
                    {
                        PolicyName: policyName,
                        PolicyDocument: JSON.stringify({
                            Version: "2012-10-17",
                            Statement: [],
                        }),
                        Path: "/",
                        Description: `Permission policy for role ${roleName}`,
                    },
                ],
                attach_role_policies: [
                    {
                        RoleName: roleName,
                        PolicyArn: `arn:aws:iam::123456789012:policy/${policyName}`,
                    },
                ],
            },
        ],
    };
}

describe("SynthesisOutputSchema", () => {
    describe("given valid synthesis output", () => {
        it("should parse successfully", () => {
            // Arrange
            const input = buildValidOutput();

            // Act
            const result = SynthesisOutputSchema.safeParse(input);

            // Assert
            expect(result.success).toBe(true);
        });
    });

    describe("given output with PermissionsBoundary", () => {
        it("should parse successfully", () => {
            // Arrange
            const input = buildValidOutput();
            const role = input.roles[0];
            if (!role) throw new Error("Expected role");
            role.create_role.PermissionsBoundary =
                "arn:aws:iam::123456789012:policy/boundary";

            // Act
            const result = SynthesisOutputSchema.safeParse(input);

            // Assert
            expect(result.success).toBe(true);
        });
    });

    describe("given empty RoleName", () => {
        it("should reject", () => {
            // Arrange
            const input = buildValidOutput();
            const role = input.roles[0];
            if (!role) throw new Error("Expected role");
            role.create_role.RoleName = "";

            // Act
            const result = SynthesisOutputSchema.safeParse(input);

            // Assert
            expect(result.success).toBe(false);
        });
    });

    describe("given Path without leading slash", () => {
        it("should reject", () => {
            // Arrange
            const input = buildValidOutput();
            const role = input.roles[0];
            if (!role) throw new Error("Expected role");
            role.create_role.Path = "deployment/";

            // Act
            const result = SynthesisOutputSchema.safeParse(input);

            // Assert
            expect(result.success).toBe(false);
        });
    });

    describe("given PolicyArn without arn: prefix", () => {
        it("should reject", () => {
            // Arrange
            const input = buildValidOutput();
            const role = input.roles[0];
            if (!role) throw new Error("Expected role");
            const attach = role.attach_role_policies[0];
            if (!attach) throw new Error("Expected attach policy");
            attach.PolicyArn = "not-an-arn";

            // Act
            const result = SynthesisOutputSchema.safeParse(input);

            // Assert
            expect(result.success).toBe(false);
        });
    });

    describe("given MaxSessionDuration below minimum", () => {
        it("should reject", () => {
            // Arrange
            const input = buildValidOutput();
            const role = input.roles[0];
            if (!role) throw new Error("Expected role");
            role.create_role.MaxSessionDuration = 100;

            // Act
            const result = SynthesisOutputSchema.safeParse(input);

            // Assert
            expect(result.success).toBe(false);
        });
    });
});
