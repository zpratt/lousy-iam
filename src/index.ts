import { defineCommand, runMain } from "citty";
import { createAnalyzeCittyCommand } from "./commands/analyze.js";
import { createFormulateCittyCommand } from "./commands/formulate.js";
import { createActionMappingDb } from "./gateways/action-mapping-db.js";
import { createActionInventoryBuilder } from "./use-cases/build-action-inventory.js";
import { createPermissionPolicyBuilder } from "./use-cases/build-permission-policy.js";
import { createTrustPolicyBuilder } from "./use-cases/build-trust-policy.js";
import { createPolicyFormulator } from "./use-cases/formulate-policies.js";
import { createResourceActionMapper } from "./use-cases/map-resource-actions.js";
import { createActionInventoryParser } from "./use-cases/parse-action-inventory.js";
import { createFormulationConfigParser } from "./use-cases/parse-formulation-config.js";
import { createTerraformPlanParser } from "./use-cases/parse-terraform-plan.js";
import { createActionInventorySerializer } from "./use-cases/serialize-action-inventory.js";

const db = createActionMappingDb();
const analyze = createAnalyzeCittyCommand({
    parser: createTerraformPlanParser(),
    mapper: createResourceActionMapper(db),
    builder: createActionInventoryBuilder(),
    serializer: createActionInventorySerializer(),
});

const formulate = createFormulateCittyCommand({
    configParser: createFormulationConfigParser(),
    inventoryParser: createActionInventoryParser(),
    formulator: createPolicyFormulator({
        permissionPolicyBuilder: createPermissionPolicyBuilder(),
        trustPolicyBuilder: createTrustPolicyBuilder(),
    }),
});

const main = defineCommand({
    meta: {
        name: "lousy-iam",
        description:
            "Analyze infrastructure-as-code plans (e.g., Terraform plan JSON) to generate least-privilege AWS IAM action inventories and policies",
    },
    subCommands: {
        analyze,
        formulate,
    },
});

runMain(main);
