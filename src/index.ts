import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import { createAnalyzeCommand } from "./commands/analyze.js";

const analyzeUseCase = createAnalyzeCommand();

const analyze = defineCommand({
    meta: {
        name: "analyze",
        description:
            "Analyze a Terraform plan JSON to produce an IAM action inventory",
    },
    args: {
        input: {
            type: "string",
            description: "Path to Terraform plan JSON file",
            required: true,
        },
    },
    async run({ args }) {
        await analyzeUseCase.execute(args.input, {
            log: (msg) => consola.log(msg),
            warn: (msg) => consola.warn(msg),
        });
    },
});

const main = defineCommand({
    meta: {
        name: "lousy-iam",
        description:
            "Analyze and generate least-privilege AWS IAM policies from CDK applications",
    },
    subCommands: {
        analyze,
    },
});

runMain(main);
