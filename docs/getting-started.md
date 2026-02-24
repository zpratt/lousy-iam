# Getting Started

lousy-iam generates least-privilege AWS IAM policy documents from Terraform plan JSON. It works in two phases:

1. **Analyze** — Parse a Terraform plan and produce an action inventory of every IAM permission the deployment role needs.
2. **Formulate** — Transform the action inventory into ready-to-use IAM trust and permission policy documents for GitHub Actions OIDC roles.

The output is JSON policy documents you submit to your provisioning pipeline. lousy-iam does **not** create IAM roles directly in AWS.

## Prerequisites

- [Node.js](https://nodejs.org/) 22 or later
- [Terraform](https://www.terraform.io/) (to generate plan JSON)
- An AWS infrastructure project with Terraform configuration

## Installation

```bash
npm install -g lousy-iam
```

Or run directly with `npx`:

```bash
npx lousy-iam --help
```

## Quick Start

### Step 1: Generate a Terraform Plan JSON

Run `terraform plan` and export the plan as JSON:

```bash
terraform plan -out=plan.tfplan
terraform show -json plan.tfplan > plan.json
```

### Step 2: Analyze the Plan

Run the `analyze` command to produce an action inventory:

```bash
lousy-iam analyze --input plan.json
```

This outputs the action inventory JSON to stdout. Save it to a file:

```bash
lousy-iam analyze --input plan.json > action-inventory.json
```

The action inventory lists every IAM action needed, split into `plan_and_apply` (read-only actions both roles need) and `apply_only` (write actions only the apply role needs). See [Analyze Command](./analyze-command.md) for details.

### Step 3: Create a Formulation Config

Create a JSON configuration file with your GitHub and AWS details:

```json
{
  "github_org": "my-org",
  "github_repo": "infra-repo",
  "resource_prefix": "myteam",
  "plan_apply_separation": true,
  "include_delete_actions": true
}
```

See [Configuration Reference](./configuration.md) for all available options.

### Step 4: Formulate IAM Policies

Run the `formulate` command with the action inventory and config:

```bash
lousy-iam formulate --input action-inventory.json --config formulation-config.json
```

This outputs the complete IAM role definitions with trust and permission policies. Save it:

```bash
lousy-iam formulate --input action-inventory.json --config formulation-config.json > roles.json
```

The output contains role definitions for a plan role (read-only, scoped to pull requests) and an apply role (full CRUD, scoped to merges to main). See [Formulate Command](./formulate-command.md) for details.

### Step 5: Submit to Your Provisioning Pipeline

Submit the `roles.json` output to your IAM provisioning pipeline. The JSON contains template variables (such as `${account_id}` and `${region}`) that your pipeline resolves at creation time.

## What's Next

- [Analyze Command](./analyze-command.md) — Full reference for the analyze phase
- [Formulate Command](./formulate-command.md) — Full reference for the formulate phase
- [Configuration Reference](./configuration.md) — All formulation config options
- [Action Mapping Database](./action-mapping-database.md) — How resource-to-IAM-action mapping works

## End-to-End Example

Here is a complete workflow analyzing a Terraform project that creates an S3 bucket and an ECS cluster:

```bash
# 1. Generate plan JSON
cd my-terraform-project
terraform plan -out=plan.tfplan
terraform show -json plan.tfplan > plan.json

# 2. Analyze the plan
lousy-iam analyze --input plan.json > action-inventory.json

# 3. Create formulation config
cat > formulation-config.json << 'EOF'
{
  "github_org": "my-org",
  "github_repo": "infra-repo",
  "resource_prefix": "myteam",
  "plan_apply_separation": true,
  "include_delete_actions": true,
  "use_github_environments": false,
  "role_path": "/",
  "max_session_duration": 3600
}
EOF

# 4. Generate IAM policy documents
lousy-iam formulate --input action-inventory.json --config formulation-config.json > roles.json

# 5. Review and submit to provisioning pipeline
cat roles.json
```
