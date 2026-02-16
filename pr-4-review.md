# Hostile Review: PR #4 — Add Hostile Reviewer Agent and Handoff Protocol

**Verdict: REQUEST CHANGES**

This PR introduces a Copilot reviewer agent (`.github/agents/reviewer.agent.md`) and a mandatory handoff protocol appended to `.github/copilot-instructions.md`. While the intent—automated adversarial review—is sound, the implementation contains critical platform misunderstandings, specification defects, unenforceable mandates, and threat model mismatches. Detailed findings below.

---

## CRITICAL

### 1. `model: claude-3.5-opus` is a non-existent model

**File:** `reviewer.agent.md:5`

The frontmatter specifies `model: claude-3.5-opus`. This model does not exist. Anthropic's model lineup includes `claude-3-opus`, `claude-3.5-sonnet`, `claude-3.5-haiku`, `claude-sonnet-4`, `claude-opus-4`, etc. There is no "claude-3.5-opus." This will either silently fall back to a default model or fail entirely, depending on the platform. This was changed from `claude-3-opus` in commit `d398b44`, making it a regression.

### 2. `model` property is ignored by GitHub.com Copilot Coding Agent

**File:** `reviewer.agent.md:5`

Per [GitHub's custom agents documentation](https://docs.github.com/en/copilot/reference/custom-agents-configuration): *"The `model`, `argument-hint`, and `handoffs` properties from VS Code and other IDE custom agents are currently not supported for Copilot coding agent on GitHub.com. They are ignored to ensure compatibility."* The model specification is dead configuration on the primary target platform (GitHub.com PR reviews). In VS Code, where `model` IS supported, the format requires a qualified name like `Claude Sonnet 4.5 (copilot)`, not bare model IDs.

### 3. `icon: shield` is not a documented frontmatter property

**File:** `reviewer.agent.md:4`

The `icon` property does not appear in [GitHub's agent configuration reference](https://docs.github.com/en/copilot/reference/custom-agents-configuration) or the [VS Code custom agents documentation](https://code.visualstudio.com/docs/copilot/customization/custom-agents). This is an invented property that will be silently ignored, giving false confidence that the agent has a visible "shield" icon.

### 4. No `tools` property defined — agent has no guaranteed file access

**File:** `reviewer.agent.md` (entire frontmatter)

The agent's reasoning process (§ Reasoning Process, step 1) says: *"Read `.github/instructions/software-architecture.instructions.md`, `.github/instructions/test.instructions.md`..."* But the frontmatter specifies no `tools` property. Without `tools: ["*"]` or an explicit list including file reading tools, there is no guarantee the agent CAN read these files. The entire review process depends on an assumed capability that is never configured.

### 5. Mandatory handoff creates a deadlock with no escape hatch

**File:** `copilot-instructions.md:232-233`

The coding agent is *"strictly forbidden from declaring a task complete until the code has passed a specialized review."* But:
- What if the Reviewer agent is unavailable, misconfigured, or errors out?
- What if the platform doesn't support `@Reviewer` agent invocations in the current context?
- What if the Reviewer enters an infinite loop of findings the coding agent cannot resolve?

There is no timeout, no override mechanism, no fallback, and no maximum review cycle count. This is a liveness hazard: a single broken component deadlocks the entire workflow.

---

## HIGH

### 6. `@Reviewer` invocation mechanism is undefined

**File:** `copilot-instructions.md:243`

The handoff block says: *"@Reviewer check this code for evil paths and architectural violations."* But the spec never defines HOW this invocation works. In what context does `@Reviewer` resolve? GitHub Copilot Chat? PR comments? Issue discussions? The `handoffs` frontmatter property is not set in the agent profile, and even if it were, `handoffs` is ignored on GitHub.com. The coding agent is instructed to perform an action that has no defined execution path.

### 7. Threat model is mismatched to the actual technology stack

**File:** `reviewer.agent.md:25-26`

The "Evil Path" analysis mandates checking for:
- **SQL injection (SQLi)**: This is a CLI tool that processes Terraform plan JSON. There is no SQL database.
- **XSS**: This is a CLI tool. There is no browser, no DOM, no HTML rendering.
- **Buffer Overflow**: This is TypeScript on Node.js, a memory-managed runtime. Traditional buffer overflows do not apply.

These are copy-pasted from a generic OWASP checklist without adaptation to the actual system. An agent following these instructions will waste review cycles checking for impossible vulnerability classes while potentially missing real threats specific to CLI tools (e.g., shell injection via `child_process`, symlink attacks on file paths, environment variable injection, Terraform state file poisoning).

### 8. No reviewer disagreement resolution protocol

**Files:** `reviewer.agent.md`, `copilot-instructions.md:236-243`

The workflow is one-directional: coding agent produces code → reviewer finds flaws → ???. There is no specification for:
- How the coding agent responds to findings
- Whether the reviewer can approve/pass
- Maximum number of review rounds
- Escalation path for disputed findings
- What constitutes "review passed" (zero findings? zero CRITICALs?)

### 9. Severity levels are undefined

**File:** `reviewer.agent.md:66-73`

CRITICAL, HIGH, MEDIUM, and LOW are used extensively but never defined. Without criteria:
- Is a missing test MEDIUM or HIGH?
- Is a `catch (e) {}` block HIGH or CRITICAL?
- What distinguishes "resource exhaustion DDoS" (HIGH in the example) from "null token bypass" (CRITICAL)?

Arbitrary severity assignment undermines the prioritization the classification is meant to provide.

### 10. Redundant hardcoded rules create maintenance drift

**File:** `reviewer.agent.md:32-43` (Architecture Enforcement), `reviewer.agent.md:44-50` (TDD Enforcement), `reviewer.agent.md:52-58` (Stack Violations)

Sections §Architecture Enforcement, §TDD Enforcement, and §Technology Stack Violations are near-verbatim duplications of content from `software-architecture.instructions.md`, `test.instructions.md`, and `copilot-instructions.md`. When those authoritative documents change, this agent spec will become stale. The agent should be instructed to read and enforce the rules FROM those files, not maintain a parallel copy.

---

## MEDIUM

### 11. Missing reference to `spec.instructions.md`

**File:** `reviewer.agent.md:14`

The "Ingest Context" step lists four instruction files to read, but omits `.github/instructions/spec.instructions.md`. This file defines spec/task structure, EARS notation, and acceptance criteria requirements. A reviewer that doesn't know the spec format will miss violations in spec-related PRs.

### 12. "Silently perform" chain-of-thought is unenforceable

**File:** `reviewer.agent.md:13`

*"Before generating any output, you must silently perform the following analysis."* LLMs do not reliably suppress output based on instructions. There is no mechanism to verify the agent actually performed these steps vs. skipping straight to output. More importantly, "silent" analysis means there is no audit trail of the reasoning, making it impossible to verify the review was thorough.

### 13. Table output format is fragile

**File:** `reviewer.agent.md:65-73`

The mandatory table format will break when:
- Findings contain pipe characters (`|`) in code snippets
- Exploit scenarios require multi-line descriptions
- File paths are long enough to make the table unreadable in narrow viewports
- Multiple findings for the same file/line need grouping

No escaping rules or overflow handling is specified. JSON or structured YAML output would be more robust for machine-parseable results.

### 14. "Self-Correction" step is performative, not functional

**File:** `copilot-instructions.md:237`

*"Briefly review your own code for syntax errors"* adds no value. The coding agent either produces valid syntax or it doesn't. An instruction to self-review does not improve model output—it's the LLM equivalent of "please double-check your work." If syntax validation is needed, it should be automated (`npx biome check`, `tsc --noEmit`), not delegated to self-reflection.

### 15. "Security First" declaration requirement is performative theater

**File:** `copilot-instructions.md:247`

*"You must explicitly state: 'I am checking this implementation against OWASP guidelines' before generating code."* The presence or absence of this string has zero causal relationship with the quality of security analysis performed. It's a cargo-cult incantation. If OWASP compliance is required, enforce it through the reviewer agent's checklist or CI tooling (e.g., `npm audit`, SAST scanners), not through mandatory verbal declarations.

### 16. Example table references non-existent doc sections

**File:** `reviewer.agent.md:73`

The example finding `"Error handling best practices"` references a section in `.github/copilot-instructions.md` that does not exist. The copilot-instructions file contains no section with that title. This trains the agent to fabricate document references—the opposite of the stated goal of requiring each finding to reference specific instruction files.

### 17. No enforcement mechanism — entirely honor-system

**Files:** Both files

The "mandatory" handoff and "strictly forbidden" completion exist only as text in instruction files. There is:
- No GitHub Actions workflow that blocks merge without reviewer approval
- No required status check
- No branch protection rule integration
- No automated detection of whether the handoff was performed

A coding agent can simply ignore the handoff instructions, and nothing will prevent the code from being merged.

---

## LOW

### 18. Context Awareness rules duplicate `applyTo` scoping

**File:** `copilot-instructions.md:245-246`

*"You must read `.github/instructions/software-architecture.instructions.md` before writing any new feature."* This is redundant. The architecture instructions already have `applyTo: "src/**/*.ts"` in their frontmatter and are automatically loaded by Copilot when editing source files. The manual instruction adds complexity without value.

### 19. Emoji-heavy formatting may cause rendering issues

**Files:** Both files

Both files use extensive emoji (🧠, 🛡️, 🏗️, 🧪, 🔧, 📝, 🚫, 🤖, 🛑, 🔄, 📚) for section headers. These may render inconsistently across terminals, editors, and GitHub's markdown renderer (especially in diffs). Plain-text prefixes (`[REASONING]`, `[SECURITY]`, etc.) would be more reliable.

### 20. `as any` in authoritative architecture example

**File:** `software-architecture.instructions.md:87` (pre-existing, but relevant)

The software-architecture instructions file—which this reviewer agent is told to enforce—contains `type: input.type as any` in its Use Case example code. The reviewer agent is simultaneously told to flag `as Type` assertions AND to treat the architecture instructions as the authoritative standard. This creates a contradiction: should the agent flag the example code in the instruction file it's told to follow?

---

## Summary

This PR attempts to solve a real problem (automated adversarial review) but the implementation is:
1. **Platform-ignorant**: Uses unsupported/ignored frontmatter properties, references a non-existent model, and doesn't configure required tools
2. **Unenforceable**: All "mandatory" requirements are honor-system text with no CI/CD integration
3. **Mismatched to the domain**: Generic web-app security checklist applied to a CLI/Terraform tool
4. **Architecturally incomplete**: One-directional workflow with no resolution, no escape hatch, no approval path
5. **Maintenance-hostile**: Hardcoded rule duplications that will drift from authoritative sources

Recommendation: Redesign the agent with platform-correct configuration, domain-appropriate threat modeling, enforceable CI integration, and a complete bidirectional review workflow before merging.
