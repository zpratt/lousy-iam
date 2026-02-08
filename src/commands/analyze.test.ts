import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildPlanJson } from "../lib/test-plan-builder.js";
import { createAnalyzeCommand } from "./analyze.js";

vi.mock("node:fs");

describe("AnalyzeCommand", () => {
    describe("given a valid plan JSON file path", () => {
        it("should produce an action inventory from the plan", async () => {
            // Arrange
            const planJson = buildPlanJson([
                {
                    address: "aws_s3_bucket.main",
                    type: "aws_s3_bucket",
                    actions: ["create"],
                    after: { bucket: "test-bucket" },
                },
            ]);
            vi.mocked(readFileSync).mockReturnValue(planJson);

            const command = createAnalyzeCommand();
            const output: string[] = [];
            const mockConsole = {
                log: (msg: string) => output.push(msg),
                warn: vi.fn(),
            };

            // Act
            const inventory = await command.execute("plan.json", mockConsole);

            // Assert
            expect(inventory.metadata.iacTool).toBe("terraform");
            expect(inventory.metadata.iacVersion).toBe("1.7.0");
            expect(
                inventory.infrastructureActions.planAndApply.length,
            ).toBeGreaterThan(0);
            expect(
                inventory.infrastructureActions.applyOnly.length,
            ).toBeGreaterThan(0);
        });
    });

    describe("given a plan with unknown resource types", () => {
        it("should warn about unmapped resource types", async () => {
            // Arrange
            const planJson = buildPlanJson([
                {
                    address: "aws_unknown_thing.main",
                    type: "aws_unknown_thing",
                    actions: ["create"],
                    after: {},
                },
            ]);
            vi.mocked(readFileSync).mockReturnValue(planJson);

            const command = createAnalyzeCommand();
            const mockConsole = {
                log: vi.fn(),
                warn: vi.fn(),
            };

            // Act
            await command.execute("plan.json", mockConsole);

            // Assert
            expect(mockConsole.warn).toHaveBeenCalledWith(
                expect.stringContaining("aws_unknown_thing"),
            );
        });
    });

    describe("given an invalid file path", () => {
        it("should throw when file cannot be read", async () => {
            // Arrange
            vi.mocked(readFileSync).mockImplementation(() => {
                throw new Error("ENOENT: no such file or directory");
            });
            const command = createAnalyzeCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act & Assert
            await expect(
                command.execute("nonexistent.json", mockConsole),
            ).rejects.toThrow();
        });
    });
});
