import { defineCommand, runMain } from "citty";
import { createAnalyzeCittyCommand } from "./commands/analyze.js";
import { createFormulateCittyCommand } from "./commands/formulate.js";
import { createValidateCittyCommand } from "./commands/validate.js";
import { createActionMappingDb } from "./gateways/action-mapping-db.js";
import { createActionInventoryBuilder } from "./use-cases/build-action-inventory.js";
import { createPermissionPolicyBuilder } from "./use-cases/build-permission-policy.js";
import { createTrustPolicyBuilder } from "./use-cases/build-trust-policy.js";
import { createPolicyFixer } from "./use-cases/fix-policy.js";
import { createPolicyFormulator } from "./use-cases/formulate-policies.js";
import { createResourceActionMapper } from "./use-cases/map-resource-actions.js";
import { createActionInventoryParser } from "./use-cases/parse-action-inventory.js";
import { createFormulationConfigParser } from "./use-cases/parse-formulation-config.js";
import { createFormulationOutputParser } from "./use-cases/parse-formulation-output.js";
import { createTerraformPlanParser } from "./use-cases/parse-terraform-plan.js";
import { createActionInventorySerializer } from "./use-cases/serialize-action-inventory.js";
import { createValidateAndFixOrchestrator } from "./use-cases/validate-and-fix.js";
import { createPermissionPolicyValidator } from "./use-cases/validate-permission-policy.js";
import { createTrustPolicyValidator } from "./use-cases/validate-trust-policy.js";

const UNSCOPED_ACTIONS = new Set([
    "ec2:DescribeVpcs",
    "ec2:DescribeVpcAttribute",
    "ec2:DescribeSubnets",
    "ec2:DescribeSecurityGroups",
    "ec2:DescribeSecurityGroupRules",
    "ec2:DescribeTags",
    "ecs:DescribeClusters",
    "ecs:DescribeServices",
    "ecs:DescribeTaskDefinition",
    "ecs:ListClusters",
    "ecs:ListServices",
    "ecs:ListTagsForResource",
    "elasticloadbalancing:DescribeLoadBalancers",
    "elasticloadbalancing:DescribeLoadBalancerAttributes",
    "elasticloadbalancing:DescribeTargetGroups",
    "elasticloadbalancing:DescribeTargetGroupAttributes",
    "elasticloadbalancing:DescribeListeners",
    "elasticloadbalancing:DescribeTags",
    "rds:DescribeDBInstances",
    "rds:DescribeDBClusters",
    "rds:DescribeDBSubnetGroups",
    "lambda:ListFunctions",
    "lambda:ListLayers",
    "lambda:GetAccountSettings",
    "lambda:ListVersionsByFunction",
    "lambda:ListTags",
    "cloudwatch:DescribeAlarms",
    "cloudwatch:ListMetrics",
    "logs:DescribeLogGroups",
    "sns:ListTopics",
    "sqs:ListQueues",
    "route53:ListHostedZones",
    "route53:GetHostedZoneCount",
    "route53:ListResourceRecordSets",
    "acm:ListCertificates",
    "secretsmanager:ListSecrets",
    "ssm:DescribeParameters",
    "sts:GetCallerIdentity",
    "cloudformation:ListStacks",
    "cloudformation:GetTemplateSummary",
    "iam:GetRole",
    "iam:GetRolePolicy",
    "iam:ListRolePolicies",
    "iam:ListAttachedRolePolicies",
    "iam:ListInstanceProfilesForRole",
    "iam:GetPolicy",
    "iam:GetPolicyVersion",
    "iam:ListPolicyVersions",
    "rds:ListTagsForResource",
    "logs:ListTagsLogGroup",
]);

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

const validate = createValidateCittyCommand({
    parser: createFormulationOutputParser(),
    orchestrator: createValidateAndFixOrchestrator({
        permissionValidator: createPermissionPolicyValidator(),
        trustValidator: createTrustPolicyValidator(),
        fixer: createPolicyFixer(),
        unscopedActions: UNSCOPED_ACTIONS,
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
        validate,
    },
});

runMain(main);
