import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import { createAnalyzeCommand } from "./commands/analyze.js";
import { createActionMappingDb } from "./gateways/action-mapping-db.js";
import { createActionInventoryBuilder } from "./use-cases/build-action-inventory.js";
import { createResourceActionMapper } from "./use-cases/map-resource-actions.js";
import { createTerraformPlanParser } from "./use-cases/parse-terraform-plan.js";
import { createActionInventorySerializer } from "./use-cases/serialize-action-inventory.js";

const db = createActionMappingDb();
const analyzeCommand = createAnalyzeCommand({
    parser: createTerraformPlanParser(),
    mapper: createResourceActionMapper(db),
    builder: createActionInventoryBuilder(),
    serializer: createActionInventorySerializer(),
});

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
        await analyzeCommand.execute(args.input, {
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
