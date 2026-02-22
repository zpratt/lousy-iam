import { defineCommand, runMain } from "citty";
import { createAnalyzeCittyCommand } from "./commands/analyze.js";
import { createActionMappingDb } from "./gateways/action-mapping-db.js";
import { createActionInventoryBuilder } from "./use-cases/build-action-inventory.js";
import { createResourceActionMapper } from "./use-cases/map-resource-actions.js";
import { createTerraformPlanParser } from "./use-cases/parse-terraform-plan.js";
import { createActionInventorySerializer } from "./use-cases/serialize-action-inventory.js";

const db = createActionMappingDb();
const analyze = createAnalyzeCittyCommand({
    parser: createTerraformPlanParser(),
    mapper: createResourceActionMapper(db),
    builder: createActionInventoryBuilder(),
    serializer: createActionInventorySerializer(),
});

const main = defineCommand({
    meta: {
        name: "lousy-iam",
        description:
            "Analyze infrastructure-as-code plans (e.g., Terraform plan JSON) to generate least-privilege AWS IAM action inventories and policies",
    },
    subCommands: {
        analyze,
    },
});

runMain(main);
