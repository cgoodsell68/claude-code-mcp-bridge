import { exec } from "child_process";
import { mkdtemp, rm, readdir, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { v4 as uuid } from "uuid";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const TASK_TIMEOUT_MS = parseInt(process.env.TASK_TIMEOUT_MS || "300000", 10); // 5 min default

export interface ExecResult {
  success: boolean;
  output: string;
  errors: string;
  exitCode: number;
  filesChanged: string[];
  durationMs: number;
}

/**
 * Run a shell command in a directory, capture output, enforce timeout.
 */
function run(
  cmd: string,
  cwd: string,
  timeoutMs = TASK_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = exec(
      cmd,
      {
        cwd,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        timeout: timeoutMs,
        env: { ...process.env, FORCE_COLOR: "0" },
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() || "",
          stderr: stderr?.toString() || "",
          exitCode: error?.code ?? (error ? 1 : 0),
        });
      }
    );

    // Safety net: kill if exec timeout didn't fire
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs + 5000);

    child.on("exit", () => clearTimeout(timer));
  });
}

/**
 * Clone a GitHub repo into a temp directory.
 * Returns the path to the cloned repo.
 */
export async function cloneRepo(
  repo: string,
  branch?: string
): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), `mcp-bridge-${uuid()}-`));
  const repoUrl = GITHUB_TOKEN
    ? `https://${GITHUB_TOKEN}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`;

  const branchFlag = branch ? `--branch ${branch}` : "";
  const result = await run(
    `git clone --depth 1 ${branchFlag} ${repoUrl} repo`,
    tmpDir,
    60000
  );

  if (result.exitCode !== 0) {
    await cleanUp(tmpDir);
    throw new Error(`git clone failed: ${result.stderr}`);
  }

  return join(tmpDir, "repo");
}

/**
 * Clean up a temp directory.
 */
export async function cleanUp(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

/**
 * Get the parent temp dir from the repo dir for cleanup.
 */
export function getTempRoot(repoDir: string): string {
  return join(repoDir, "..");
}

/**
 * List files changed by git (compared to HEAD).
 */
async function getChangedFiles(repoDir: string): Promise<string[]> {
  const result = await run("git diff --name-only HEAD", repoDir, 10000);
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Send a task to Claude Code headless mode.
 */
export async function runClaudeCode(
  repoDir: string,
  task: string
): Promise<ExecResult> {
  const start = Date.now();

  // Run Claude Code in headless (print) mode
  const result = await run(
    `claude -p "${task.replace(/"/g, '\\"')}" --output-format json`,
    repoDir
  );

  const filesChanged = await getChangedFiles(repoDir);

  return {
    success: result.exitCode === 0,
    output: result.stdout.slice(0, 50000), // Cap at 50KB
    errors: result.stderr.slice(0, 10000),
    exitCode: result.exitCode,
    filesChanged,
    durationMs: Date.now() - start,
  };
}

/**
 * Run npm install in the repo directory.
 */
export async function npmInstall(repoDir: string): Promise<ExecResult> {
  const start = Date.now();
  const result = await run("npm ci --ignore-scripts 2>&1 || npm install --ignore-scripts 2>&1", repoDir, 120000);
  return {
    success: result.exitCode === 0,
    output: result.stdout.slice(0, 10000),
    errors: result.stderr.slice(0, 10000),
    exitCode: result.exitCode,
    filesChanged: [],
    durationMs: Date.now() - start,
  };
}

/**
 * Run build check (tsc + npm run build).
 */
export async function runBuildCheck(repoDir: string): Promise<ExecResult> {
  const start = Date.now();

  // TypeScript check
  const tsc = await run("npx tsc --noEmit 2>&1", repoDir, 120000);

  // npm build
  const build = await run("npm run build 2>&1", repoDir, 180000);

  const success = tsc.exitCode === 0 && build.exitCode === 0;

  return {
    success,
    output: [
      "=== TypeScript Check ===",
      tsc.exitCode === 0 ? "PASS" : "FAIL",
      tsc.stdout,
      "",
      "=== npm run build ===",
      build.exitCode === 0 ? "PASS" : "FAIL",
      build.stdout,
    ]
      .join("\n")
      .slice(0, 50000),
    errors: [tsc.stderr, build.stderr]
      .filter(Boolean)
      .join("\n---\n")
      .slice(0, 10000),
    exitCode: success ? 0 : 1,
    filesChanged: [],
    durationMs: Date.now() - start,
  };
}

/**
 * Run ESLint fix on specified files or all files.
 */
export async function runLintFix(
  repoDir: string,
  files?: string[]
): Promise<ExecResult> {
  const start = Date.now();
  const target = files?.length ? files.join(" ") : ".";
  const result = await run(
    `npx eslint --fix ${target} 2>&1`,
    repoDir,
    120000
  );

  const filesChanged = await getChangedFiles(repoDir);

  return {
    success: result.exitCode === 0,
    output: result.stdout.slice(0, 50000),
    errors: result.stderr.slice(0, 10000),
    exitCode: result.exitCode,
    filesChanged,
    durationMs: Date.now() - start,
  };
}

/**
 * Run test suite.
 */
export async function runTests(repoDir: string): Promise<ExecResult> {
  const start = Date.now();
  const result = await run("npm test 2>&1", repoDir, 180000);

  return {
    success: result.exitCode === 0,
    output: result.stdout.slice(0, 50000),
    errors: result.stderr.slice(0, 10000),
    exitCode: result.exitCode,
    filesChanged: [],
    durationMs: Date.now() - start,
  };
}
