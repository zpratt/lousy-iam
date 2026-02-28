# Formulate Command

The `formulate` command is Phase 2 of lousy-iam. It transforms a Phase 1 action inventory into candidate IAM policy documents — trust policies and permission policies — ready for submission to your provisioning pipeline.

## Usage

```bash
lousy-iam formulate --input <action-inventory-json> --config <formulation-config-json>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--input` | Yes | Path to the Phase 1 action inventory JSON (output of `analyze`) |
| `--config` | Yes | Path to the formulation configuration JSON file |

## How It Works

The formulate command:

1. Parses the action inventory from Phase 1
2. Reads the formulation configuration
3. Generates trust policies (OIDC) for GitHub Actions
4. Generates permission policies grouped by service
5. Outputs complete role definitions as JSON

## Two-Role Architecture

When `plan_apply_separation` is `true` (the default), lousy-iam generates two roles:

### Plan Role

- **Name**: `<resource_prefix>-github-plan`
- **Purpose**: Read-only role for `terraform plan` on pull requests
- **Trust**: Scoped to `pull_request` events only
- **Permissions**: Only `plan_and_apply` actions (read/describe operations)

### Apply Role

- **Name**: `<resource_prefix>-github-apply`
- **Purpose**: Full CRUD role for `terraform apply` on merge to main
- **Trust**: Scoped to `ref:refs/heads/main` (or a GitHub Environment)
- **Permissions**: Both `plan_and_apply` and `apply_only` actions

When `plan_apply_separation` is `false`, only the apply role is generated.

## Output Format

```json
{
  "roles": [
    {
      "role_name": "myteam-github-plan",
      "role_path": "/",
      "description": "Read-only role for terraform plan / cdk diff on pull requests",
      "max_session_duration": 3600,
      "permission_boundary_arn": null,
      "trust_policy": {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Sid": "AllowGitHubOIDCPlanOnPR",
            "Effect": "Allow",
            "Principal": {
              "Federated": "arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
              "StringEquals": {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub": "repo:my-org/infra-repo:pull_request"
              }
            }
          }
        ]
      },
      "permission_policies": [
        {
          "policy_name": "myteam-github-plan-permissions",
          "policy_document": {
            "Version": "2012-10-17",
            "Statement": [
              {
                "Sid": "S3ToolchainRead",
                "Effect": "Allow",
                "Action": ["s3:GetObject", "s3:ListBucket"],
                "Resource": "arn:aws:s3:::${state_bucket}"
              }
            ]
          },
          "estimated_size_bytes": 1234
        }
      ]
    },
    {
      "role_name": "myteam-github-apply",
      "role_path": "/",
      "description": "Full CRUD role for terraform apply / cdk deploy on merge to main",
      "max_session_duration": 3600,
      "permission_boundary_arn": null,
      "trust_policy": { "..." : "..." },
      "permission_policies": [
        {
          "policy_name": "myteam-github-apply-permissions",
          "policy_document": { "..." : "..." },
          "estimated_size_bytes": 4567
        }
      ]
    }
  ],
  "template_variables": {
    "account_id": "Target AWS account ID",
    "region": "Target region or * for multi-region",
    "resource_prefix": "myteam",
    "org": "my-org",
    "repo": "infra-repo"
  }
}
```

### Output Fields

**roles**: Array of role definitions, each containing:
- `role_name` — IAM role name
- `role_path` — IAM role path (default `/`)
- `description` — Human-readable description
- `max_session_duration` — Maximum session duration in seconds
- `permission_boundary_arn` — Permission boundary ARN, or `null`
- `trust_policy` — OIDC trust policy document for GitHub Actions
- `permission_policies` — Array of permission policy documents with estimated sizes

**template_variables**: Variables used in the policy documents that your provisioning pipeline must resolve (e.g., `${account_id}`, `${region}`).

## Trust Policy Details

### Apply Role Trust

By default, the apply role trust policy scopes to the `main` branch:

```json
"token.actions.githubusercontent.com:sub": "repo:my-org/infra-repo:ref:refs/heads/main"
```

### AWS Partition Resolution

The AWS partition for the OIDC provider ARN is always derived from the `region` configuration, regardless of whether `account_id` is provided. When `account_id` is provided, the ARN uses your actual AWS account ID; when it is omitted, the `${account_id}` template placeholder is kept, but the partition still changes based on the region.

| Region | Partition | OIDC ARN Example (real account ID) |
|--------|-----------|-------------------------------------|
| Standard (e.g., `us-east-1`) | `aws` | `arn:aws:iam::123456789012:oidc-provider/...` |
| GovCloud (e.g., `us-gov-west-1`) | `aws-us-gov` | `arn:aws-us-gov:iam::123456789012:oidc-provider/...` |
| China (e.g., `cn-north-1`) | `aws-cn` | `arn:aws-cn:iam::123456789012:oidc-provider/...` |

When `account_id` is not provided, the `${account_id}` template placeholder is used instead of a concrete ID, but the partition still follows the region. For example:

- Standard: `arn:aws:iam::${account_id}:oidc-provider/...`
- GovCloud: `arn:aws-us-gov:iam::${account_id}:oidc-provider/...`
- China: `arn:aws-cn:iam::${account_id}:oidc-provider/...`

### Plan Role Trust

The plan role trust policy scopes to pull request events:

```json
"token.actions.githubusercontent.com:sub": "repo:my-org/infra-repo:pull_request"
```

### GitHub Environments

When `use_github_environments` is `true`, the apply role trust uses environment-scoped subjects instead of branch-scoped:

```json
"token.actions.githubusercontent.com:sub": "repo:my-org/infra-repo:environment:production"
```

The environment name comes from `github_environment_names` in the config. If no environment names are provided, a `${github_environment_name}` placeholder is used.

## Permission Policy Details

Permission policies group IAM actions by service and include a descriptive `Sid`:

- **Toolchain statements** are labeled with suffixes like `ToolchainRead` and `ToolchainWrite`
- **Infrastructure statements** are labeled with suffixes like `InfraRead` and `InfraWrite`
- Each statement groups actions from the same service sharing the same resource scope

### Delete Actions

When `include_delete_actions` is `false`, delete-category actions are excluded from the apply role's permission policies. This is useful when you want to prevent accidental resource destruction.

## See Also

- [Getting Started](./getting-started.md) — End-to-end workflow
- [Configuration Reference](./configuration.md) — All configuration options
- [Validate Command](./validate-command.md) — Phase 3 policy validation
- [Analyze Command](./analyze-command.md) — Phase 1 action inventory generation
