import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  cloneRepo,
  cleanUp,
  getTempRoot,
  runClaudeCode,
  npmInstall,
  runBuildCheck,
  runLintFix,
  runTests,
} from "../executor.js";

export function registerTools(server: McpServer): void {
  // ── code_task ───────────────────────────────────────────────────
  server.tool(
    "code_task",
    "Send a coding task to Claude Code headless mode. Claude Code will clone the repo, understand the codebase, execute the task (write/modify files, run commands), and return results. Use this for any coding work: feature implementation, bug fixes, refactoring, file creation.",
    {
      repo: z
        .string()
        .describe(
          "GitHub repo in owner/name format, e.g. cgoodsell68/aiida-app"
        ),
      task: z
        .string()
        .describe(
          "Detailed coding task description. Be specific about what files to change, what behavior to implement, and any constraints."
        ),
      branch: z
        .string()
        .optional()
        .describe("Branch to clone. Defaults to the repo default branch."),
    },
    async ({ repo, task, branch }) => {
      let repoDir: string | null = null;
      try {
        repoDir = await cloneRepo(repo, branch);

        // Install dependencies first
        const installResult = await npmInstall(repoDir);
        if (!installResult.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    phase: "npm_install",
                    output: installResult.output,
                    errors: installResult.errors,
                    files_changed: [],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Run Claude Code
        const result = await runClaudeCode(repoDir, task);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  output: result.output,
                  errors: result.errors,
                  files_changed: result.filesChanged,
                  duration_ms: result.durationMs,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  output: "",
                  errors:
                    error instanceof Error ? error.message : String(error),
                  files_changed: [],
                },
                null,
                2
              ),
            },
          ],
        };
      } finally {
        if (repoDir) await cleanUp(getTempRoot(repoDir));
      }
    }
  );

  // ── build_check ─────────────────────────────────────────────────
  server.tool(
    "build_check",
    "Clone a repo and run TypeScript type checking (tsc --noEmit) and the build script (npm run build). Returns pass/fail with detailed error output. Use this to verify a repo builds cleanly before or after changes.",
    {
      repo: z
        .string()
        .describe("GitHub repo in owner/name format"),
      branch: z
        .string()
        .optional()
        .describe("Branch to check. Defaults to the repo default branch."),
    },
    async ({ repo, branch }) => {
      let repoDir: string | null = null;
      try {
        repoDir = await cloneRepo(repo, branch);
        await npmInstall(repoDir);
        const result = await runBuildCheck(repoDir);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  output: result.output,
                  errors: result.errors,
                  files_changed: [],
                  duration_ms: result.durationMs,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  output: "",
                  errors:
                    error instanceof Error ? error.message : String(error),
                  files_changed: [],
                },
                null,
                2
              ),
            },
          ],
        };
      } finally {
        if (repoDir) await cleanUp(getTempRoot(repoDir));
      }
    }
  );

  // ── lint_fix ────────────────────────────────────────────────────
  server.tool(
    "lint_fix",
    "Clone a repo and run ESLint with --fix on specified files (or all files). Returns the lint output and list of files that were auto-fixed.",
    {
      repo: z
        .string()
        .describe("GitHub repo in owner/name format"),
      branch: z
        .string()
        .optional()
        .describe("Branch to lint. Defaults to the repo default branch."),
      files: z
        .array(z.string())
        .optional()
        .describe(
          "Specific files to lint (relative to repo root). If omitted, lints all files."
        ),
    },
    async ({ repo, branch, files }) => {
      let repoDir: string | null = null;
      try {
        repoDir = await cloneRepo(repo, branch);
        await npmInstall(repoDir);
        const result = await runLintFix(repoDir, files);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  output: result.output,
                  errors: result.errors,
                  files_changed: result.filesChanged,
                  duration_ms: result.durationMs,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  output: "",
                  errors:
                    error instanceof Error ? error.message : String(error),
                  files_changed: [],
                },
                null,
                2
              ),
            },
          ],
        };
      } finally {
        if (repoDir) await cleanUp(getTempRoot(repoDir));
      }
    }
  );

  // ── run_tests ───────────────────────────────────────────────────
  server.tool(
    "run_tests",
    "Clone a repo and execute its test suite (npm test). Returns pass/fail with full test output including individual test results.",
    {
      repo: z
        .string()
        .describe("GitHub repo in owner/name format"),
      branch: z
        .string()
        .optional()
        .describe("Branch to test. Defaults to the repo default branch."),
    },
    async ({ repo, branch }) => {
      let repoDir: string | null = null;
      try {
        repoDir = await cloneRepo(repo, branch);
        await npmInstall(repoDir);
        const result = await runTests(repoDir);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  output: result.output,
                  errors: result.errors,
                  files_changed: [],
                  duration_ms: result.durationMs,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  output: "",
                  errors:
                    error instanceof Error ? error.message : String(error),
                  files_changed: [],
                },
                null,
                2
              ),
            },
          ],
        };
      } finally {
        if (repoDir) await cleanUp(getTempRoot(repoDir));
      }
    }
  );
}
