# Analyze Command

The `analyze` command is Phase 1 of lousy-iam. It parses a Terraform plan JSON file and produces an action inventory — a structured list of every IAM action the deployment role needs.

## Usage

```bash
lousy-iam analyze --input <path-to-plan-json>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--input` | Yes | Path to the Terraform plan JSON file |

### Generating the Input

```bash
terraform plan -out=plan.tfplan
terraform show -json plan.tfplan > plan.json
```

## How It Works

The analyze command processes the plan in three steps:

### 1. Parse the Terraform Plan

The command reads the `resource_changes` array from the Terraform plan JSON. Each entry describes one resource and its planned action (`create`, `update`, `delete`, `read`, or `no-op`).

### 2. Map Resources to IAM Actions

Each resource type (e.g., `aws_s3_bucket`, `aws_ecs_cluster`) is looked up in the [action mapping database](./action-mapping-database.md). The database maps resource types to the specific IAM actions needed for each CRUD operation.

The planned action determines which action categories are included:

| Planned Action | IAM Categories Included | Role Assignment |
|----------------|------------------------|-----------------|
| `no-op` | Read | Plan + Apply |
| `read` | Read | Plan + Apply |
| `create` | Create, Read, Tag | Apply (create/tag), Plan+Apply (read) |
| `update` | Update, Read, Tag | Apply (update/tag), Plan+Apply (read) |
| `delete` | Delete, Read | Apply (delete), Plan+Apply (read) |
| `create` + `delete` | Create, Delete, Read, Tag | Apply (create/delete/tag), Plan+Apply (read) |

### 3. Build the Action Inventory

The output combines infrastructure actions with Terraform toolchain permissions (state backend access for S3 and DynamoDB). Actions from multiple resources that map to the same IAM action are deduplicated, with source resource addresses aggregated for traceability.

## Output Format

The action inventory is JSON with this structure:

```json
{
  "metadata": {
    "iac_tool": "terraform",
    "iac_version": "1.7.0",
    "format_version": "1.2"
  },
  "toolchain_actions": {
    "plan_and_apply": [
      {
        "action": "s3:GetObject",
        "resource": "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
        "purpose": "Read Terraform state",
        "category": "toolchain"
      }
    ],
    "apply_only": [
      {
        "action": "s3:PutObject",
        "resource": "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
        "purpose": "Write Terraform state",
        "category": "toolchain"
      }
    ]
  },
  "infrastructure_actions": {
    "plan_and_apply": [
      {
        "action": "ecs:DescribeClusters",
        "resource": "*",
        "purpose": "read for aws_ecs_cluster",
        "source_resource": ["aws_ecs_cluster.main"],
        "plan_action": ["create"],
        "category": "read"
      }
    ],
    "apply_only": [
      {
        "action": "ecs:CreateCluster",
        "resource": "*",
        "purpose": "create for aws_ecs_cluster",
        "source_resource": ["aws_ecs_cluster.main"],
        "plan_action": ["create"],
        "category": "create"
      }
    ]
  }
}
```

### Output Fields

**metadata**:
- `iac_tool` — Always `"terraform"` (CDK support is planned)
- `iac_version` — Terraform version from the plan JSON
- `format_version` — Terraform plan format version

**toolchain_actions**: IAM actions required by Terraform itself for state management.
- `plan_and_apply` — Actions needed by both plan and apply roles (state read, lock check)
- `apply_only` — Actions needed only by the apply role (state write, lock acquire/release)

**infrastructure_actions**: IAM actions required to manage the declared AWS resources.
- `plan_and_apply` — Read/Describe actions needed by both roles
- `apply_only` — Write actions (Create, Update, Delete, Tag) needed only by the apply role
- `source_resource` — The Terraform resource address(es) that require this action
- `plan_action` — The Terraform planned action(s) that triggered this mapping

## Toolchain Permissions

The analyze command automatically includes Terraform toolchain permissions for state backend access:

| Action | Resource | Purpose | Role |
|--------|----------|---------|------|
| `sts:GetCallerIdentity` | `*` | Provider initialization | Plan + Apply |
| `s3:GetObject` | `arn:aws:s3:::${state_bucket}/${state_key_prefix}*` | Read state | Plan + Apply |
| `s3:ListBucket` | `arn:aws:s3:::${state_bucket}` | List state files | Plan + Apply |
| `dynamodb:GetItem` | `arn:aws:dynamodb:${region}:${account_id}:table/${lock_table}` | Check lock | Plan + Apply |
| `s3:PutObject` | `arn:aws:s3:::${state_bucket}/${state_key_prefix}*` | Write state | Apply only |
| `s3:DeleteObject` | `arn:aws:s3:::${state_bucket}/${state_key_prefix}*` | Delete old state | Apply only |
| `dynamodb:PutItem` | `arn:aws:dynamodb:${region}:${account_id}:table/${lock_table}` | Acquire lock | Apply only |
| `dynamodb:DeleteItem` | `arn:aws:dynamodb:${region}:${account_id}:table/${lock_table}` | Release lock | Apply only |

The ARN placeholders (`${state_bucket}`, `${state_key_prefix}`, etc.) are template variables resolved by your provisioning pipeline.

## Unknown Resource Types

When the analyze command encounters a resource type not in the action mapping database, it prints a warning:

```
Unknown resource type: aws_sqs_queue (module.messaging.aws_sqs_queue.events) — add to action mapping database
```

The resource is skipped in the output. See [Action Mapping Database](./action-mapping-database.md) for the list of supported types and how to extend it.

## See Also

- [Getting Started](./getting-started.md) — End-to-end workflow
- [Formulate Command](./formulate-command.md) — Phase 2 policy generation
- [Validate Command](./validate-command.md) — Phase 3 policy validation
- [Action Mapping Database](./action-mapping-database.md) — How resource-to-IAM-action mapping works
