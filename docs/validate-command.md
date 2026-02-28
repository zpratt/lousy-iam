# Validate Command

The `validate` command is Phase 3 of lousy-iam. It checks candidate IAM policy documents (output of `formulate`) against least-privilege security rules, automatically fixes deterministic violations, and reports remaining issues.

## Usage

```bash
lousy-iam validate --input <formulation-output-json>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--input` | Yes | Path to the Phase 2 formulation output JSON file (output of `formulate`) |

## How It Works

The validate command processes the formulation output in three steps:

### 1. Parse the Formulation Output

The command reads the Phase 2 output JSON file containing role definitions with trust policies and permission policies.

### 2. Validate Against Security Rules

Each role's trust and permission policies are validated against 33 rules across 6 categories:

| Category | Rules | Description |
|----------|-------|-------------|
| [Action Scoping](#action-scoping-rules) | LP-001 – LP-005 | Wildcards, deny-listed actions, overly broad actions |
| [Resource Scoping](#resource-scoping-rules) | LP-010 – LP-013 | `Resource: "*"` detection, hardcoded account IDs, ARN patterns |
| [Condition Requirements](#condition-requirement-rules) | LP-020 – LP-025 | Required conditions on sensitive actions (iam:PassRole, etc.) |
| [Trust Policy](#trust-policy-rules) | LP-030 – LP-036 | OIDC configuration, audience/subject conditions |
| [Policy Structure](#policy-structure-rules) | LP-040 – LP-046 | Version field, Sid, size limits, duplicates |
| [Privilege Escalation](#privilege-escalation-rules) | LP-050 – LP-053 | Self-modification prevention |

### 3. Auto-Fix and Re-Validate

When auto-fixable violations are found, the command applies deterministic fixes and re-validates — up to 5 iterations. This resolves common issues (missing `Version` field, duplicate actions, missing conditions) without manual intervention.

## Output Format

The validate command outputs JSON with validation results:

```json
{
  "valid": false,
  "fix_iterations": 2,
  "role_results": [
    {
      "role_name": "myteam-github-plan",
      "valid": false,
      "policy_results": [
        {
          "policy_name": "myteam-github-plan-permissions",
          "policy_type": "permission",
          "valid": false,
          "violations": [
            {
              "rule_id": "LP-010",
              "severity": "error",
              "message": "Resource '*' used on action that supports resource-level permissions",
              "statement_sid": "InfrastructureRead",
              "statement_index": 0,
              "field": "Resource",
              "current_value": "*",
              "auto_fixable": false,
              "fix_hint": "Scope Resource to specific ARN patterns"
            }
          ],
          "stats": {
            "total_statements": 2,
            "total_actions": 6,
            "errors": 1,
            "warnings": 0,
            "auto_fixable_errors": 0,
            "auto_fixable_warnings": 0
          }
        },
        {
          "policy_name": "myteam-github-plan-trust",
          "policy_type": "trust",
          "valid": true,
          "violations": [],
          "stats": {
            "total_statements": 1,
            "total_actions": 1,
            "errors": 0,
            "warnings": 0,
            "auto_fixable_errors": 0,
            "auto_fixable_warnings": 0
          }
        }
      ]
    }
  ]
}
```

### Output Fields

**valid**: `true` if all roles pass all rules with zero errors; `false` otherwise.

**fix_iterations**: Maximum number of auto-fix cycles applied to any single policy across all roles. `0` means no auto-fixable violations were found.

**role_results**: Array of results per role, each containing:
- `role_name` — Name of the IAM role
- `valid` — Whether this role passed all rules
- `policy_results` — Array of per-policy results

**policy_results**: Per-policy validation details:
- `policy_name` — Name of the policy
- `policy_type` — `"permission"` or `"trust"`
- `valid` — Whether this policy passed all rules
- `violations` — Array of rule violations found
- `stats` — Summary counts (statements, actions, errors, warnings, auto-fixable counts)

**violations**: Each violation includes:
- `rule_id` — Rule identifier (e.g., `LP-001`)
- `severity` — `"error"` or `"warning"`
- `message` — Human-readable description
- `auto_fixable` — Whether this violation was (or can be) automatically fixed
- `fix_hint` — Suggested remediation

## Validation Rules

### Action Scoping Rules

| Rule | Severity | Description |
|------|----------|-------------|
| LP-001 | Error | `Action: "*"` — full wildcard action |
| LP-002 | Error | Service-level wildcard (e.g., `s3:*`) |
| LP-003 | Warning | Use of `NotAction` |
| LP-004 | Error | Deny-listed actions (`organizations:*`, `account:*`, `iam:CreateUser`, `iam:CreateAccessKey`, `iam:CreateLoginProfile`, unscoped `sts:AssumeRole`) |
| LP-005 | Warning | Overly broad actions (`ec2:*`, `s3:*`, `lambda:*`) |

### Resource Scoping Rules

| Rule | Severity | Description |
|------|----------|-------------|
| LP-010 | Error | `Resource: "*"` on actions that support resource-level permissions |
| LP-011 | Warning | `Resource: "*"` on unscoped actions (encourages adding conditions) |
| LP-012 | Error | Hardcoded AWS account ID in resource ARN |
| LP-013 | Warning | ARN with only `*` in resource segment and no conditions |

### Condition Requirement Rules

| Rule | Severity | Auto-Fix | Description |
|------|----------|----------|-------------|
| LP-020 | Error | No | `iam:PassRole` with `Resource: "*"` |
| LP-021 | Error | ✅ | `iam:PassRole` missing `iam:PassedToService` condition |
| LP-022 | Error | No | `iam:CreateRole` without `iam:PermissionsBoundary` condition when boundary is configured |
| LP-023 | Error | ✅ | `iam:CreateServiceLinkedRole` missing `iam:AWSServiceName` condition |
| LP-024 | Warning | ✅ | `Resource: "*"` on region-scoped service without `aws:RequestedRegion` condition |
| LP-025 | Warning | ✅ | Resource creation action missing `aws:RequestTag` conditions |

### Trust Policy Rules

| Rule | Severity | Auto-Fix | Description |
|------|----------|----------|-------------|
| LP-030 | Error | No | Trust policy does not use `sts:AssumeRoleWithWebIdentity` |
| LP-031 | Error | ✅ | Missing `aud` condition with `sts.amazonaws.com` |
| LP-032 | Error | No | Missing `sub` condition |
| LP-033 | Error | No | `sub` condition uses org-wide wildcard |
| LP-034 | Warning | ✅ | `StringLike` used where no wildcards are present |
| LP-035 | Error | No | Plan role trust does not use `pull_request` subject |
| LP-036 | Error | No | Apply role trust does not use `ref:refs/heads/main` or `environment:<name>` subject |

### Policy Structure Rules

| Rule | Severity | Auto-Fix | Description |
|------|----------|----------|-------------|
| LP-040 | Error | ✅ | Missing `"Version": "2012-10-17"` |
| LP-041 | Error | ✅ | Statement lacks an explicit `Sid` |
| LP-042 | Error | No | Policy document exceeds 6,144 bytes |
| LP-043 | Warning | No | Statement contains more than 20 actions |
| LP-044 | Warning | No | Policy document contains more than 10 statements (the CLI message references "managed policies per role" but the check counts statements) |
| LP-045 | Error | ✅ | Duplicate actions within a statement |
| LP-046 | Warning | ✅ | Duplicate actions across statements |

### Privilege Escalation Rules

| Rule | Severity | Description |
|------|----------|-------------|
| LP-050 | Error | `iam:PutRolePolicy` or `iam:AttachRolePolicy` targeting the deployment role |
| LP-051 | Error | `iam:CreatePolicyVersion` targeting the deployment role's policies |
| LP-052 | Error | `iam:CreateRole` with unscoped `iam:PassRole` |
| LP-053 | Warning | `iam:Put*Policy` or `iam:Attach*Policy` without resource scoping |

## Auto-Fix Behavior

10 rules support automatic fixes. When the validate command detects these violations, it:

1. Applies the deterministic fix (e.g., adds a missing `Version` field, deduplicates actions)
2. Re-validates the fixed policy
3. Repeats up to 5 iterations

If the same set of violations appears in consecutive iterations (oscillation), the command halts early.

### Auto-Fixable Rules Summary

| Rule | Fix Applied |
|------|------------|
| LP-021 | Adds `iam:PassedToService` condition |
| LP-023 | Adds `iam:AWSServiceName` condition |
| LP-024 | Adds `aws:RequestedRegion` condition |
| LP-025 | Adds `aws:RequestTag` conditions for mandatory tags |
| LP-031 | Adds `aud` condition with `sts.amazonaws.com` |
| LP-034 | Replaces `StringLike` with `StringEquals` (no wildcards present) |
| LP-040 | Adds `"Version": "2012-10-17"` |
| LP-041 | Generates a `Sid` from the action group |
| LP-045 | Deduplicates actions within the statement |
| LP-046 | Removes duplicate actions from the less specific statement |

## End-to-End Example

```bash
# Generate formulation output from Phase 1 + Phase 2
lousy-iam analyze --input plan.json > action-inventory.json
lousy-iam formulate --input action-inventory.json --config config.json > roles.json

# Validate the generated policies
lousy-iam validate --input roles.json > validation-results.json

# Check for errors
cat validation-results.json | jq '.valid'
```

## See Also

- [Getting Started](./getting-started.md) — End-to-end workflow
- [Formulate Command](./formulate-command.md) — Phase 2 policy generation
- [Configuration Reference](./configuration.md) — Formulation config options
