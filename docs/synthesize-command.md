# Synthesize Command

The `synthesize` command is Phase 4 of lousy-iam. It runs validation internally, resolves template variables, and transforms the formulation output into AWS SDK v3 payloads — `CreateRoleCommandInput`, `CreatePolicyCommandInput`, and `AttachRolePolicyCommandInput` — ready to pass directly to `@aws-sdk/client-iam`.

## Usage

```bash
lousy-iam synthesize --input <formulation-output-json> --config <config-json>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--input` | Yes | Path to the Phase 2 formulation output JSON file (output of `formulate`) |
| `--config` | Yes | Path to the formulation configuration JSON file |
| `--output` | No | Path to write the full synthesized JSON output file |
| `--output-dir` | No | Path to a directory to write per-role JSON files |

> **Note:** `--output` and `--output-dir` are mutually exclusive. If both are provided, the command exits with an error.

## How It Works

The synthesize command processes input through four steps:

### 1. Parse the Formulation Output

The command reads the Phase 2 output JSON file containing role definitions with trust policies and permission policies.

### 2. Validate and Auto-Fix

The command runs the Phase 3 validate-and-fix orchestrator internally. This ensures only valid, auto-fixed policies are synthesized into deployment-ready payloads — even if you skip the standalone `validate` command.

- If validation finds **errors** that cannot be auto-fixed, the command prints validation results to stderr and exits with a non-zero exit code.
- If validation finds only **warnings** (no errors), the command proceeds with synthesis and logs the warnings to stderr.

### 3. Resolve Template Variables

The command scans the generated policy documents for `${...}` placeholders to determine which variables need to be resolved. Values are resolved using the following precedence (highest to lowest):

1. Values from the `--config` file
2. Already-resolved values in `template_variables` (validated by format — e.g., 12-digit string for `account_id`, AWS region pattern for `region`)

Descriptive placeholder text (e.g., `"Target AWS account ID"`) is never treated as a resolved value. If required variables cannot be resolved from either source, the command prints an error listing the missing variable names and exits with a non-zero exit code.

### 4. Transform to SDK Payloads

The command transforms the resolved formulation output into AWS SDK v3 payloads grouped by role:

- **CreateRoleCommandInput** — One per role, with `AssumeRolePolicyDocument` as a JSON string
- **CreatePolicyCommandInput** — One per permission policy, with `PolicyDocument` as a JSON string
- **AttachRolePolicyCommandInput** — One per role-policy pair, with a deterministic `PolicyArn`

Output is written to stdout by default. See [Output Modes](#output-modes) for alternatives.

## Output Format

```json
{
  "roles": [
    {
      "create_role": {
        "RoleName": "myteam-github-apply",
        "AssumeRolePolicyDocument": "{\"Version\":\"2012-10-17\",\"Statement\":[...]}",
        "Path": "/",
        "Description": "GitHub Actions apply role for myteam",
        "MaxSessionDuration": 3600
      },
      "create_policies": [
        {
          "PolicyName": "myteam-github-apply-permissions",
          "PolicyDocument": "{\"Version\":\"2012-10-17\",\"Statement\":[...]}",
          "Path": "/",
          "Description": "Permission policy for role myteam-github-apply"
        }
      ],
      "attach_role_policies": [
        {
          "RoleName": "myteam-github-apply",
          "PolicyArn": "arn:aws:iam::123456789012:policy/myteam-github-apply-permissions"
        }
      ]
    }
  ]
}
```

### Output Fields

**roles**: Array of role synthesis results, each containing:

- **create_role** — `CreateRoleCommandInput` payload:
  - `RoleName` — From the role definition's `role_name`
  - `AssumeRolePolicyDocument` — JSON-stringified trust policy document
  - `Path` — Normalized `role_path` (always starts and ends with `/`)
  - `Description` — From the role definition's `description`
  - `MaxSessionDuration` — From the role definition's `max_session_duration`
  - `PermissionsBoundary` — Present only when `permission_boundary_arn` is not null

- **create_policies** — Array of `CreatePolicyCommandInput` payloads:
  - `PolicyName` — From the permission policy's `policy_name`
  - `PolicyDocument` — JSON-stringified permission policy document
  - `Path` — Normalized `role_path`
  - `Description` — Generated: `"Permission policy for role <role_name>"`

- **attach_role_policies** — Array of `AttachRolePolicyCommandInput` payloads:
  - `RoleName` — From the role definition's `role_name`
  - `PolicyArn` — Generated: `arn:{partition}:iam::{account_id}:policy{normalized_path}{policy_name}`

### Path Normalization

The `role_path` is normalized to always start and end with `/`:

| Input | Normalized |
|-------|-----------|
| `/` | `/` |
| `deployment` | `/deployment/` |
| `/deployment` | `/deployment/` |
| `deployment/` | `/deployment/` |

### Policy ARN Generation

The `PolicyArn` in `AttachRolePolicyCommandInput` follows the pattern:

```
arn:{partition}:iam::{account_id}:policy{normalized_path}{policy_name}
```

The partition is derived from the config's `region` field:

| Region | Partition |
|--------|-----------|
| `null` or `*` | `aws` |
| `us-east-1` | `aws` |
| `us-gov-west-1` | `aws-us-gov` |
| `cn-north-1` | `aws-cn` |

## Output Modes

### stdout (default)

```bash
lousy-iam synthesize --input roles.json --config config.json
```

### Single file

```bash
lousy-iam synthesize --input roles.json --config config.json --output sdk-payloads.json
```

### Directory (per-role files)

```bash
lousy-iam synthesize --input roles.json --config config.json --output-dir ./payloads/
```

This creates files named `{basename(role_name)}.json` in the specified directory, where `basename` extracts the final path segment of the role name. Role names must not contain path separators (`/` or `\`); if they do, the command will error on filename collisions:

```
payloads/
├── myteam-github-plan.json
└── myteam-github-apply.json
```

## Configuration Requirements

The `synthesize` command scans the formulation output for **all** `${...}` template variable placeholders and requires that each one can be resolved from either the formulation configuration or from already-resolved values in the formulation output (`template_variables`):

| Variable | When Required | Accepted Sources |
|----------|---------------|------------------|
| `account_id` | Always required for `synthesize` (used for `PolicyArn` construction and `${account_id}` placeholder resolution) | Config `account_id` field or `template_variables.account_id` in formulation output |
| `region` | When formulation output contains `${region}` placeholders | Config `region` field or `template_variables.region` in formulation output |
| Other variables (e.g., `state_bucket`, `state_key_prefix`, `lock_table`) | When formulation output contains `${<name>}` placeholders | Config `template_variables.<name>` field or `template_variables.<name>` in formulation output |

Toolchain-specific variables (such as Terraform state-related placeholders) do not have dedicated top-level config fields. Provide them via the `template_variables` map in the configuration file so the resolver can substitute them during synthesis.

## End-to-End Example

```bash
# Analyze and formulate (Phases 1–2)
lousy-iam analyze --input plan.json > action-inventory.json
lousy-iam formulate --input action-inventory.json --config config.json > roles.json

# Synthesize into AWS SDK v3 payloads (single file)
lousy-iam synthesize --input roles.json --config config.json > sdk-payloads.json

# Alternative: write per-role files
lousy-iam synthesize --input roles.json --config config.json --output-dir ./payloads/
```

## See Also

- [Getting Started](./getting-started.md) — End-to-end workflow
- [Validate Command](./validate-command.md) — Phase 3 validation (run internally by synthesize)
- [Formulate Command](./formulate-command.md) — Phase 2 policy generation
- [Configuration Reference](./configuration.md) — Formulation config options
