# Getting Started

lousy-iam generates least-privilege AWS IAM policy documents from Terraform plan JSON. It works in four phases:

1. **Analyze** — Parse a Terraform plan and produce an action inventory of every IAM permission the deployment role needs.
2. **Formulate** — Transform the action inventory into ready-to-use IAM trust and permission policy documents for GitHub Actions OIDC roles.
3. **Validate** — Check the generated policies against 33 least-privilege security rules, auto-fix deterministic violations, and report remaining issues.
4. **Synthesize** — Transform validated policies into AWS SDK v3 payloads (`CreateRoleCommand`, `CreatePolicyCommand`, `AttachRolePolicyCommand`) ready for deployment.

The output is JSON payloads you can use directly with the AWS JavaScript SDK v3 or submit to your provisioning pipeline.

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

### Step 5: Validate the Generated Policies

Run the `validate` command to check the generated policies against least-privilege security rules:

```bash
lousy-iam validate --input roles.json
```

This validates the policies against 33 security rules, automatically fixes deterministic violations, and outputs structured validation results. Save the output:

```bash
lousy-iam validate --input roles.json > validation-results.json
```

Review the results to ensure `valid` is `true`. If violations remain, the output includes rule IDs, severity levels, and fix hints. See [Validate Command](./validate-command.md) for details.

### Step 6: Synthesize AWS SDK v3 Payloads

Run the `synthesize` command to transform the validated policies into deployment-ready AWS SDK v3 payloads:

```bash
lousy-iam synthesize --input roles.json --config formulation-config.json
```

This runs validation internally, resolves template variables (like `${account_id}`) using your config, and produces `CreateRoleCommand`, `CreatePolicyCommand`, and `AttachRolePolicyCommand` payloads. Save the output:

```bash
lousy-iam synthesize --input roles.json --config formulation-config.json > sdk-payloads.json
```

Or write per-role files to a directory:

```bash
lousy-iam synthesize --input roles.json --config formulation-config.json --output-dir ./payloads/
```

> **Note:** When the formulation output contains `${account_id}` placeholders, the `synthesize` command requires either an `account_id` in the config or an already-resolved 12-digit `template_variables.account_id`. See [Configuration Reference](./configuration.md) for details.

See [Synthesize Command](./synthesize-command.md) for full details.

### Step 7: Deploy with AWS SDK v3

Use the synthesized payloads with the AWS JavaScript SDK v3 to create IAM resources:

```javascript
import { IAMClient, CreateRoleCommand, CreatePolicyCommand, AttachRolePolicyCommand } from "@aws-sdk/client-iam";
import payloads from "./sdk-payloads.json";

const client = new IAMClient({});

for (const role of payloads.roles) {
    await client.send(new CreateRoleCommand(role.create_role));
    for (const policy of role.create_policies) {
        await client.send(new CreatePolicyCommand(policy));
    }
    for (const attach of role.attach_role_policies) {
        await client.send(new AttachRolePolicyCommand(attach));
    }
}
```

## What's Next

- [Analyze Command](./analyze-command.md) — Full reference for the analyze phase
- [Formulate Command](./formulate-command.md) — Full reference for the formulate phase
- [Validate Command](./validate-command.md) — Full reference for the validate phase
- [Synthesize Command](./synthesize-command.md) — Full reference for the synthesize phase
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
  "account_id": "123456789012",
  "region": "us-east-1",
  "plan_apply_separation": true,
  "include_delete_actions": true,
  "use_github_environments": false,
  "role_path": "/",
  "max_session_duration": 3600
}
EOF

# 4. Generate IAM policy documents
lousy-iam formulate --input action-inventory.json --config formulation-config.json > roles.json

# 5. Validate policies against least-privilege rules
lousy-iam validate --input roles.json > validation-results.json

# 6. Synthesize AWS SDK v3 payloads
lousy-iam synthesize --input roles.json --config formulation-config.json > sdk-payloads.json

# 7. Review and deploy
cat sdk-payloads.json
```
