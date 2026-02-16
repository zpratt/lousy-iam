# PR Review: Implement Phase 1 — Plan/Synth Analysis

**Branch:** `copilot/implement-phase-1-spec`
**Commits:** 8 (including review feedback iterations)

## Summary

This PR implements Phase 1 of the lousy-iam tool: parsing Terraform plan JSON, mapping resource types to IAM actions, and producing a structured action inventory for downstream policy generation. The implementation follows Clean Architecture with entities, use cases, gateways, and commands layers. It includes unit tests, an e2e test using TestContainers with moto, and covers the 3 user stories from the spec.

## Verdict

Overall this is well-structured and the core logic is sound. The code adheres to the spec, tests pass (41/41), and types check cleanly. There are several issues to address, ranging from lint warnings to architectural concerns.

---

## Issues

### 1. Lint warnings: `noTemplateCurlyInString` in build-action-inventory.ts (Medium)

**File:** `src/use-cases/build-action-inventory.ts:25,31,38,47,53,60,67`

`biome check` reports 7 warnings for strings like `"arn:aws:s3:::${state_bucket}/${state_key_prefix}*"`. These are intentional template placeholders (not JS template literals), but the linter doesn't know that.

**Recommendation:** Suppress with a `// biome-ignore` comment explaining these are IAM ARN templates for user substitution, not JS template strings. Alternatively, configure this rule to ignore the specific file. Leaving warnings in CI output creates noise that masks real issues.

### 2. Zod schema lives in use-cases layer, not entities (Low)

**Files:** `src/use-cases/terraform-plan.schema.ts`, `src/entities/terraform-plan.ts`

The Zod validation schema is in the use-cases layer while the corresponding TypeScript types are in the entities layer. In Clean Architecture, the entities layer defines the core domain types and their invariants — Zod schemas _are_ the runtime representation of those invariants. Having the schema separate from the types it validates creates a maintenance risk: the types and schema can drift apart since there's no compile-time link between `TerraformPlanSchema` and the `TerraformPlan` interface.

**Recommendation:** Either:
- Move the schema to entities and use `z.infer<>` to derive the TypeScript types from it (single source of truth), or
- Keep them separate but add a type assertion (e.g., `satisfies z.ZodType<TerraformPlan>`) to ensure they stay in sync.

### 3. `analyze` command does synchronous file I/O (Low)

**File:** `src/commands/analyze.ts:39`

The `execute` method is `async` but uses `readFileSync`. For a CLI tool processing single files this is unlikely to matter in practice, but it's inconsistent — the method signature promises asynchronous execution while blocking the event loop.

**Recommendation:** Either use `readFile` from `node:fs/promises` to match the async signature, or make the method synchronous and drop the `async`/`Promise` return type.

### 4. Action mapping database port has no service field contract (Low)

**File:** `src/use-cases/action-mapping-db.port.ts`

The port interface returns `ResourceActionEntry | undefined`, which includes the `service` field from the entity. The `service` field isn't used anywhere in the use-case layer — it's purely informational metadata on the entity. This isn't a bug, but it means the port's contract is broader than what the use cases actually need.

**Recommendation:** This is fine for now, but worth noting if the port interface is later narrowed for a different gateway implementation.

### 5. All infrastructure action `resource` fields are hardcoded to `"*"` (Medium)

**File:** `src/use-cases/map-resource-actions.ts:63,73`

Every `InfrastructureActionEntry` sets `resource: "*"`. The spec's Story 3 acceptance criteria says entries should include an `action` and `resource` field, and the `change.after` attributes are noted for "implicit dependency detection." Setting everything to `"*"` means the output doesn't provide resource-level scoping, which limits the usefulness for least-privilege policy generation.

**Recommendation:** This appears to be a deliberate Phase 1 simplification (resource ARN scoping presumably comes later). If so, consider adding a code comment noting this is intentional and will be refined in a future phase, since this is central to the tool's value proposition.

### 6. Toolchain actions use unresolved template placeholders (Medium)

**File:** `src/use-cases/build-action-inventory.ts:25-67`

The toolchain ARNs contain placeholders like `${state_bucket}`, `${region}`, `${account_id}`, and `${lock_table}` that are output as literal strings in the JSON. There's no mechanism for the user to substitute these values, and no documentation in the output explaining that these need substitution.

**Recommendation:** Either:
- Add a note in the output metadata indicating placeholders need substitution, or
- Accept these as CLI arguments (e.g., `--state-bucket`, `--lock-table`), or
- Document this as a known Phase 1 limitation.

### 7. No deduplication across multiple resources of the same type (Low)

**File:** `src/commands/analyze.ts:48-49`

If a plan contains two `aws_s3_bucket` resources (e.g., `aws_s3_bucket.logs` and `aws_s3_bucket.data`), the inventory will contain duplicate IAM actions (e.g., `s3:CreateBucket` twice in `applyOnly`). The deduplication in `map-resource-actions.ts` only deduplicates within a single resource, not across resources.

**Recommendation:** Add cross-resource deduplication in the analyze command or build-action-inventory use case before producing the final inventory. Downstream IAM policy generation would need to handle this otherwise.

### 8. E2e test container cleanup relies on finally blocks only (Low)

**File:** `tests/e2e/analyze.e2e.test.ts:45-97`

The `beforeAll` hook uses nested try/finally for container cleanup. If the `Network` creation succeeds but `motoContainer.start()` throws, the network `stop()` in the outer finally still runs correctly. However, the nested structure is deep and somewhat fragile. TestContainers does have `StartedNetwork`/`StartedGenericContainer` lifecycle management.

**Recommendation:** This works correctly as-is. Consider using TestContainers' `afterAll` or vitest's `onTestFinished` for slightly cleaner cleanup if this test suite grows.

### 9. Missing `@types/chance` dev dependency (Low)

**File:** `package.json`

The `chance` library is used in tests but `@types/chance` is not listed in devDependencies. This may work if `chance` bundles its own types, but the `Chance` import style (`import Chance from "chance"`) with `new Chance()` typically requires the `@types/chance` package for proper TypeScript support.

**Recommendation:** Verify type support is working. If relying on bundled types, this is fine. If not, add `@types/chance` to devDependencies.

### 10. `.terraform.lock.hcl` committed in fixtures (Low)

**File:** `tests/e2e/fixtures/terraform/.terraform.lock.hcl`

The lock file is committed for the e2e fixtures, which pins the exact provider hashes. This is intentional per the commit message ("Add Terraform lock file...remove .terraform.lock.hcl from gitignore"). This is reasonable for reproducible e2e tests, but the `.gitignore` additions for Terraform files (`*.tfstate`, `*.tfplan`, `.terraform/`) don't exclude `.terraform.lock.hcl` — which is the correct behavior since you want it committed.

**Recommendation:** No action needed. This is correct.

---

## Strengths

- **Clean Architecture adherence**: Clear separation between entities, use cases, gateways, and commands. The `ActionMappingDb` port interface enables future gateway swaps without touching use-case logic.
- **Factory function pattern**: Using `createX()` factories instead of classes keeps the code functional and easily testable with dependency injection through closures.
- **Test quality**: Tests use Arrange/Act/Assert consistently, use randomized data via Chance where appropriate, mock at interface boundaries, and cover edge cases (unknown resources, invalid JSON, empty plans, deduplication).
- **E2e test with real Terraform**: The TestContainers + moto approach validates the full pipeline against real `terraform plan` output, catching integration issues that unit tests miss.
- **snake_case serialization layer**: Cleanly separates internal camelCase domain types from the external snake_case JSON contract via a dedicated serializer, rather than polluting the domain model.
- **Spec coverage**: All acceptance criteria from the 3 user stories are covered by tests.
