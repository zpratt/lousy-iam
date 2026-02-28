# lousy-iam

Generate least-privilege AWS IAM policy documents from Terraform plan JSON for GitHub Actions deployment pipelines.

lousy-iam analyzes your Terraform plan output and produces tightly scoped IAM trust and permission policies — ready to submit to your provisioning pipeline. It enforces a two-role architecture (read-only plan role for PRs, full CRUD apply role for merges) with OIDC federation, so your CI/CD never uses long-lived credentials.

## Features

- **Plan-JSON-driven** — Works from `terraform show -json` output, giving fully resolved resources with accurate planned actions (create, update, delete, no-op)
- **Two-role architecture** — Separate plan (read-only) and apply (full CRUD) roles with distinct trust scopes
- **OIDC trust policies** — GitHub Actions federation via `AssumeRoleWithWebIdentity`, scoped to your org, repo, and branch or environment
- **Toolchain-aware** — Automatically includes Terraform state backend permissions (S3 + DynamoDB)
- **Template variables** — Outputs portable policy documents with `${account_id}`, `${region}`, and other placeholders your pipeline resolves
- **Concrete values** — Optionally provide `account_id` and `region` in configuration for deployment-ready policies (with automatic AWS partition resolution for GovCloud and China regions)
- **Policy validation** — 33 security rules across 6 categories validate generated policies against least-privilege best practices
- **Auto-fix** — 10 deterministic violations are automatically fixed without manual intervention
- **Extensible action mapping** — Built-in database covering 23 AWS resource types, easy to extend

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Step-by-step guide from Terraform plan to validated IAM policies |
| [Analyze Command](docs/analyze-command.md) | Phase 1: parse a Terraform plan and produce an action inventory |
| [Formulate Command](docs/formulate-command.md) | Phase 2: transform the action inventory into IAM policy documents |
| [Validate Command](docs/validate-command.md) | Phase 3: validate policies against least-privilege rules and auto-fix |
| [Configuration Reference](docs/configuration.md) | All formulation configuration options |
| [Action Mapping Database](docs/action-mapping-database.md) | How resource-to-IAM-action mapping works and how to extend it |

## Quick Start

```bash
# Generate a Terraform plan JSON
terraform plan -out=plan.tfplan
terraform show -json plan.tfplan > plan.json

# Analyze the plan to produce an action inventory
npx lousy-iam analyze --input plan.json > action-inventory.json

# Create a formulation config
echo '{
  "github_org": "my-org",
  "github_repo": "infra-repo",
  "resource_prefix": "myteam"
}' > formulation-config.json

# Generate IAM policy documents
npx lousy-iam formulate --input action-inventory.json --config formulation-config.json > roles.json

# Validate policies against least-privilege rules
npx lousy-iam validate --input roles.json > validation-results.json
```

See [Getting Started](docs/getting-started.md) for a detailed walkthrough.

## License

[MIT](LICENSE)