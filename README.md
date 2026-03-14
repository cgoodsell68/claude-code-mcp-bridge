# Claude Code MCP Bridge

An MCP (Model Context Protocol) server that bridges to Claude Code's headless mode, enabling AI agents to delegate coding tasks to Claude Code for autonomous implementation, building, linting, and testing.

## Architecture

```
Tasklet Agent (Kai)
    |
    | MCP Protocol (HTTP + SSE)
    |
Claude Code MCP Bridge (Railway)
    |
    | claude -p (headless mode)
    |
Claude Code CLI
    |
    | Git operations + code changes
    |
GitHub Repos
```

## Tools

| Tool | Description |
|------|-------------|
| `code_task` | Send a coding task to Claude Code. Clones the repo, runs the task headless, returns output + changed files. |
| `build_check` | Run `tsc --noEmit` + `npm run build` and return pass/fail with errors. |
| `lint_fix` | Run ESLint with `--fix` on specified files or entire repo. |
| `run_tests` | Execute `npm test` and return full results. |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_API_KEY` | Yes | API key for authenticating MCP clients |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude Code CLI |
| `GITHUB_TOKEN` | No | GitHub PAT for cloning private repos |
| `TASK_TIMEOUT_MS` | No | Max execution time per task (default: 300000 = 5 min) |
| `PORT` | No | Server port (default: 3000) |

## Deployment (Railway)

1. Push this repo to GitHub
2. Create a new Railway project and connect the repo
3. Set environment variables in Railway dashboard:
   - `MCP_API_KEY` = generate a secure random string
   - `ANTHROPIC_API_KEY` = your Anthropic API key
   - `GITHUB_TOKEN` = a GitHub PAT with repo access
4. Railway will auto-build using the Dockerfile and deploy

## Connecting to Tasklet

1. In Tasklet, create a new MCP connection
2. Server URL: `https://your-railway-url.up.railway.app/sse`
3. Add the `Authorization: Bearer <MCP_API_KEY>` header

## Local Development

```bash
# Install dependencies
npm install

# Set environment variables
export MCP_API_KEY=test-key
export ANTHROPIC_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...

# Run in development mode
npm run dev

# Build for production
npm run build
npm start
```

## How It Works

1. **Kai** (Tasklet agent) calls `code_task` via MCP with a repo and task description
2. The bridge **clones** the repo to a temp directory
3. **Claude Code** runs headless (`claude -p`) with the task in the repo context
4. Claude Code reads the codebase, makes changes, runs commands as needed
5. The bridge captures **output, errors, and changed files**
6. Temp directory is **cleaned up**
7. Kai receives structured results and can push changes via GitHub API

## Response Format

All tools return JSON with this shape:

```json
{
  "success": true,
  "output": "Claude Code output or command output",
  "errors": "Error details if any",
  "files_changed": ["src/foo.ts", "src/bar.ts"],
  "duration_ms": 45000
}
```

## Security

- All endpoints (except `/health`) require Bearer token authentication
- Repos are cloned to isolated temp directories
- Temp directories are cleaned up after every operation
- Output is capped at 50KB to prevent memory issues
- Task timeout prevents runaway processes
