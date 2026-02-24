# Action Mapping Database

The action mapping database maps AWS resource types to the IAM actions required for each CRUD operation. The [analyze command](./analyze-command.md) uses this database to translate Terraform plan resource changes into IAM action inventories.

## How It Works

When the analyze command encounters a resource change in the Terraform plan JSON (e.g., `aws_s3_bucket` with action `create`), it:

1. Looks up the resource type in the database
2. Selects the action categories needed for the planned operation (e.g., `create` → create, read, and tag categories)
3. Adds the corresponding IAM actions to the action inventory

## Supported Resource Types

The database currently includes mappings for the following AWS resource types:

| Terraform Type | AWS Service | Actions Mapped |
|---------------|-------------|----------------|
| `aws_s3_bucket` | S3 | Read, Create, Update, Delete, Tag |
| `aws_ecs_cluster` | ECS | Read, Create, Update, Delete, Tag |
| `aws_ecs_service` | ECS | Read, Create, Update, Delete, Tag |
| `aws_ecs_task_definition` | ECS | Read, Create, Update, Delete, Tag |
| `aws_lambda_function` | Lambda | Read, Create, Update, Delete, Tag |
| `aws_iam_role` | IAM | Read, Create, Update, Delete, Tag |
| `aws_iam_policy` | IAM | Read, Create, Update, Delete, Tag |
| `aws_vpc` | EC2 | Read, Create, Update, Delete, Tag |
| `aws_subnet` | EC2 | Read, Create, Update, Delete, Tag |
| `aws_security_group` | EC2 | Read, Create, Update, Delete, Tag |
| `aws_lb` | ELB | Read, Create, Update, Delete, Tag |
| `aws_lb_target_group` | ELB | Read, Create, Update, Delete, Tag |
| `aws_lb_listener` | ELB | Read, Create, Update, Delete, Tag |
| `aws_cloudwatch_log_group` | CloudWatch Logs | Read, Create, Update, Delete, Tag |
| `aws_route53_record` | Route 53 | Read, Create, Update, Delete |
| `aws_db_instance` | RDS | Read, Create, Update, Delete, Tag |

## Action Categories

Each resource type maps to five categories of IAM actions:

| Category | Description | Example (`aws_ecs_cluster`) |
|----------|-------------|----------------------------|
| **read** | Describe, Get, List operations for plan/diff | `ecs:DescribeClusters`, `ecs:ListTagsForResource` |
| **create** | Actions to create the resource | `ecs:CreateCluster` |
| **update** | Actions to modify the resource | `ecs:UpdateCluster`, `ecs:UpdateClusterSettings` |
| **delete** | Actions to destroy the resource | `ecs:DeleteCluster` |
| **tag** | Tagging operations | `ecs:TagResource`, `ecs:UntagResource` |

## Unknown Resource Types

When the analyze command encounters a resource type not in the database, it:

1. Logs a warning with the resource type and address
2. Skips the resource (no actions are added to the inventory)

The warning message looks like:

```
Unknown resource type: aws_sqs_queue (module.messaging.aws_sqs_queue.events) — add to action mapping database
```

## Extending the Database

The action mapping database is defined in `src/gateways/action-mapping-db.ts`. To add a new resource type, add an entry to the `RESOURCE_ACTIONS` array:

```typescript
{
    terraformType: "aws_sqs_queue",
    service: "sqs",
    actions: {
        read: ["sqs:GetQueueAttributes", "sqs:GetQueueUrl", "sqs:ListQueueTags"],
        create: ["sqs:CreateQueue", "sqs:SetQueueAttributes"],
        update: ["sqs:SetQueueAttributes"],
        delete: ["sqs:DeleteQueue"],
        tag: ["sqs:TagQueue", "sqs:UntagQueue"],
    },
},
```

After adding a new mapping, run the tests to verify:

```bash
npm test
```

## See Also

- [Analyze Command](./analyze-command.md) — How the database is used during analysis
- [Getting Started](./getting-started.md) — End-to-end workflow
