import type { FormulationConfig } from "../entities/formulation-config.js";
import { stripDangerousKeys } from "../entities/sanitize-json.js";
import { FormulationConfigSchema } from "./formulation-config.schema.js";

export interface FormulationConfigParser {
    parse(jsonString: string): FormulationConfig;
}

function transformSnakeToCamel(data: unknown): unknown {
    if (typeof data !== "object" || data === null) {
        return data;
    }

    const obj = data as Record<string, unknown>;
    const keyMap: Record<string, string> = {
        github_org: "githubOrg",
        github_repo: "githubRepo",
        resource_prefix: "resourcePrefix",
        account_id: "accountId",
        region: "region",
        plan_apply_separation: "planApplySeparation",
        include_delete_actions: "includeDeleteActions",
        use_github_environments: "useGithubEnvironments",
        github_environment_names: "githubEnvironmentNames",
        permission_boundary_arn: "permissionBoundaryArn",
        role_path: "rolePath",
        max_session_duration: "maxSessionDuration",
    };

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = keyMap[key] ?? key;
        result[camelKey] = value;
    }
    return result;
}

export function createFormulationConfigParser(): FormulationConfigParser {
    return {
        parse(jsonString: string): FormulationConfig {
            let rawData: unknown;
            try {
                rawData = JSON.parse(jsonString);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                throw new Error(
                    `Invalid JSON: configuration file is not valid JSON (${message})`,
                );
            }

            let sanitized: unknown;
            try {
                sanitized = stripDangerousKeys(rawData);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                throw new Error(
                    `Invalid JSON: configuration file could not be sanitized (${message})`,
                );
            }

            const transformed = transformSnakeToCamel(sanitized);
            return FormulationConfigSchema.parse(transformed);
        },
    };
}
