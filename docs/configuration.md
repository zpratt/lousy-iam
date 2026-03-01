# Configuration Reference

The formulate command requires a JSON configuration file. This document describes all available options.

## Example Configuration

```json
{
  "github_org": "my-org",
  "github_repo": "infra-repo",
  "resource_prefix": "myteam",
  "account_id": "123456789012",
  "region": "us-east-1",
  "plan_apply_separation": true,
  "include_delete_actions": true,
  "use_github_environments": false,
  "github_environment_names": {},
  "permission_boundary_arn": null,
  "role_path": "/",
  "max_session_duration": 3600
}
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `github_org` | string | GitHub organization name. Must contain only letters, numbers, and single hyphens. Max 39 characters. |
| `github_repo` | string | GitHub repository name. Must contain only letters, numbers, hyphens, underscores, and dots. Max 100 characters. |
| `resource_prefix` | string | Naming prefix for generated role and policy names (e.g., `myteam`). Used in role names like `myteam-github-plan` and `myteam-github-apply`. May include template variables like `${environment}`. |

## Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `account_id` | string or null | `null` | AWS account ID (12 digits). When provided, replaces `${account_id}` placeholder in trust policy OIDC ARNs with the actual value. **Required for the `synthesize` command** to generate valid IAM Policy ARNs. |
| `region` | string or null | `null` | AWS region identifier (e.g., `us-east-1`) or `*` for multi-region. When provided, records the actual region in `template_variables` output. Also determines the AWS partition for OIDC ARNs. |
| `plan_apply_separation` | boolean | `true` | Generate separate plan and apply roles. When `false`, only the apply role is generated. |
| `include_delete_actions` | boolean | `true` | Include delete-category IAM actions in the apply role. Set to `false` to prevent accidental resource destruction. |
| `use_github_environments` | boolean | `false` | Use GitHub Environments for apply role trust scoping instead of branch-based scoping. |
| `github_environment_names` | object | `{}` | Map of logical environment names to GitHub Environment names (e.g., `{"prod": "production"}`). Used when `use_github_environments` is `true`. |
| `permission_boundary_arn` | string or null | `null` | ARN of an IAM permission boundary to attach to the generated roles. |
| `role_path` | string | `"/"` | IAM role path for the generated roles. |
| `max_session_duration` | number | `3600` | Maximum session duration in seconds. Must be between 3600 (1 hour) and 43200 (12 hours). |

## Validation Rules

The configuration is validated at runtime using the following rules:

- `github_org` must match the pattern `^(?!-)(?!.*--)(?!.*-$)[A-Za-z0-9][A-Za-z0-9-]{0,38}$`
- `github_repo` must match the pattern `^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`
- `resource_prefix` must match the pattern `^[A-Za-z0-9_${}][A-Za-z0-9_\-${}]*$`
- `account_id` must be exactly 12 digits (e.g., `123456789012`)
- `region` must be a valid AWS region identifier (e.g., `us-east-1`) or `*` for multi-region
- `max_session_duration` must be an integer between 3600 and 43200

Invalid configurations produce a descriptive error message.

## How Fields Affect Output

### `plan_apply_separation`

When `true` (default), two roles are generated:

| Role | Trust Scope | Permissions |
|------|-------------|-------------|
| `<resource_prefix>-github-plan` | `pull_request` events | Read-only (plan_and_apply actions) |
| `<resource_prefix>-github-apply` | `ref:refs/heads/main` or GitHub Environment | Full CRUD (all actions) |

When `false`, only the apply role is generated.

### `use_github_environments` and `github_environment_names`

These control how the apply role trust policy scopes the OIDC subject claim:

| `use_github_environments` | `github_environment_names` | Trust Subject |
|---------------------------|---------------------------|---------------|
| `false` | (ignored) | `repo:org/repo:ref:refs/heads/main` |
| `true` | `{"prod": "production"}` | `repo:org/repo:environment:production` |
| `true` | `{}` | `repo:org/repo:environment:${github_environment_name}` |

### `include_delete_actions`

When `false`, actions with category `delete` are excluded from the apply role's permission policies. Read, create, update, and tag actions are still included.

### `account_id`

When provided, the 12-digit AWS account ID replaces the `${account_id}` template placeholder in trust policy OIDC provider ARNs:

| `account_id` | Trust Policy OIDC ARN |
|--------------|----------------------|
| `null` | `arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com` |
| `"123456789012"` | `arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com` |

The actual value is also recorded in the `template_variables` output.

### `region`

When provided, the region determines the AWS partition used in OIDC provider ARNs:

| `region` | Partition | Example ARN Prefix |
|----------|-----------|-------------------|
| `null` or `*` | `aws` | `arn:aws:iam::...` |
| `us-east-1` | `aws` | `arn:aws:iam::...` |
| `us-gov-west-1` | `aws-us-gov` | `arn:aws-us-gov:iam::...` |
| `cn-north-1` | `aws-cn` | `arn:aws-cn:iam::...` |

The actual region value is recorded in the `template_variables` output when provided.

### `resource_prefix`

Used as a prefix in generated names:
- Role names: `<resource_prefix>-github-plan`, `<resource_prefix>-github-apply`
- Policy names: `<resource_prefix>-github-plan-permissions`, `<resource_prefix>-github-apply-permissions`
- Listed in `template_variables` output for ARN resolution

## File Format

The configuration file must be valid JSON. Field names use `snake_case` to match AWS and Terraform conventions. The tool internally transforms these to camelCase for processing.

## See Also

- [Getting Started](./getting-started.md) — End-to-end workflow
- [Formulate Command](./formulate-command.md) — How the config is used to generate policies
- [Validate Command](./validate-command.md) — Phase 3 policy validation
- [Synthesize Command](./synthesize-command.md) — Phase 4 SDK payload synthesis
