#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const MAX_TEXT_CHARS = 12_000;
const MAX_TAIL_CHARS = 4_000;

function truncate(value, max = MAX_TEXT_CHARS) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n...[truncated ${s.length - max} chars]`;
}

function tail(value, max = MAX_TAIL_CHARS) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return `...[tail truncated]\n${s.slice(-max)}`;
}

async function git(cwd, args) {
  try {
    const { stdout } = await execFileP("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function runCursorAgent(input) {
  const args = ["-p", "--output-format", "json", "--force"];
  if (input.model) args.push("--model", input.model);
  if (input.resume) args.push("--resume", input.resume);
  else if (input.continueSession) args.push("--continue");
  args.push(input.task);

  return await new Promise((resolve) => {
    const child = spawn("/home/ysamohvalov/.local/bin/cursor-agent", args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 5_000).unref();
    }, input.timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-1_000_000);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: `Failed to spawn cursor-agent: ${error.message}`,
        args,
        cwd: input.cwd,
      });
    });

    child.on("close", async (code, signal) => {
      clearTimeout(timer);

      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        // cursor-agent prints one JSON object per run in --output-format json;
        // if parsing fails, fall back to raw stdout below.
      }

      const diffStat = await git(input.cwd, ["diff", "--stat"]);
      const statusShort = await git(input.cwd, ["status", "--short"]);

      resolve({
        ok: !killedByTimeout && code === 0 && !(parsed?.is_error),
        killedByTimeout,
        exitCode: code,
        signal,
        sessionID: parsed?.session_id ?? null,
        args,
        cwd: input.cwd,
        text: truncate(parsed?.result ?? stdout.trim()),
        usage: parsed?.usage ?? null,
        diffStat,
        statusShort,
        stderrTail: tail(stderr),
      });
    });
  });
}

const server = new McpServer({
  name: "cursor-agent-mcp",
  version: "0.1.0",
});

server.tool(
  "cursor_execute",
  "Execute one bounded coding task through cursor-agent CLI (synchronous, blocks until done) and return a compact JSON report with diff/status context.",
  {
    task: z.string().min(10).describe("Bounded coding task with goal, constraints, files, acceptance criteria, and verification command."),
    cwd: z.string().describe("Absolute working directory/repository root."),
    model: z.string().optional().describe("Optional cursor-agent model, e.g. gpt-5, sonnet-4-thinking, composer."),
    timeoutMs: z.number().int().min(1000).max(3600000).default(900000).describe("Internal timeout; must be below the MCP client's own per-call timeout."),
    resume: z.string().optional().describe("Resume a specific cursor-agent chat/session id instead of starting a new one."),
    continueSession: z.boolean().default(false).describe("Continue the last cursor-agent session; ignored when resume is set."),
  },
  async (input) => {
    const result = await runCursorAgent(input);
    return {
      isError: !result.ok,
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
