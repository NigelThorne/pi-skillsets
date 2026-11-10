import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";

const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const root = join(agentDir, "skillsets");
const entryType = "skillset-selection";

export function discoverSkillsets(base = root) {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = resolve(base, entry.name);
      try {
        const manifest = join(dir, "skillset.json");
        const config = existsSync(manifest)
          ? JSON.parse(readFileSync(manifest, "utf8"))
          : { skills: ["skills"] };
        const pathsFor = (key: string, fallback: string[] = []) => {
          const values = config[key] ?? fallback;
          if (!Array.isArray(values) || !values.every((p: unknown) => typeof p === "string")) {
            throw new Error(`${key} must be an array of relative paths`);
          }
          const paths = values.map((p: string) => resolve(dir, p));
          if (paths.some((p: string) => !p.startsWith(dir + sep))) {
            throw new Error(`${key} paths must be inside the skillset folder`);
          }
          return paths as string[];
        };
        const paths = pathsFor("skills");
        const extensions = pathsFor("extensions");
        const missing = [...paths, ...extensions].filter((p) => !existsSync(p));
        const count = paths.reduce((n, p) => n + countSkills(p), 0);
        return { name: entry.name, paths, extensions, count, error: missing.length ? "resource files not installed" : undefined };
      } catch (error) {
        return { name: entry.name, paths: [] as string[], extensions: [] as string[], count: 0, error: String(error) };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function countSkills(path: string): number {
  if (!existsSync(path)) return 0;
  if (statSync(path).isFile()) return path.endsWith("SKILL.md") ? 1 : 0;
  return readdirSync(path, { withFileTypes: true }).reduce((n, entry) => {
    if (entry.isDirectory()) return n + countSkills(join(path, entry.name));
    return n + (entry.isFile() && entry.name === "SKILL.md" ? 1 : 0);
  }, 0);
}

export default function (pi: ExtensionAPI) {
  let active: string | null = null;
  // Pi's resource discovery only accepts skills/prompts/themes. Delegate extension
  // factories through this extension's API after restoring the session selection.
  // A /skillset switch reloads the runtime, removing the previous registrations.
  const loaded = new Map<string, {
    tools: ToolDefinition[];
    starts: Array<(event: any, ctx: ExtensionContext) => unknown>;
  }>();

  async function loadExtensions(name: string, paths: string[]) {
    const state = { tools: [] as ToolDefinition[], starts: [] as Array<(event: any, ctx: ExtensionContext) => unknown> };
    loaded.set(name, state);
    const scopedAPI = {
      ...pi,
      on(event: string, handler: (event: any, ctx: ExtensionContext) => unknown) {
        if (event === "session_start") {
          state.starts.push(handler);
          return () => { state.starts = state.starts.filter((item) => item !== handler); };
        }
        return pi.on(event as any, (event: any, ctx: ExtensionContext) => {
          if (active === name || event.type === "session_shutdown") return handler(event, ctx);
        });
      },
      registerTool(tool: ToolDefinition) {
        if (pi.getAllTools().some((item) => item.name === tool.name)) {
          throw new Error(`Skillset tool conflicts with an existing tool: ${tool.name}`);
        }
        const guarded = {
          ...tool,
          execute(...args: any[]) {
            if (active !== name) throw new Error(`Enable /skillset ${name} before using ${tool.name}`);
            return (tool.execute as any)(...args);
          },
        };
        state.tools.push(guarded);
        pi.registerTool(guarded);
      },
      registerCommand(command: string, options: any) {
        if (command === "skillset" || pi.getCommands().some((item) => item.name === command)) {
          throw new Error(`Skillset command conflicts with an existing command: ${command}`);
        }
        pi.registerCommand(command, {
          ...options,
          handler: async (args: string, ctx: any) => {
            if (active !== name) {
              ctx.ui.notify(`Enable /skillset ${name} first.`, "warning");
              return;
            }
            // pi-pstack 0.1.0 expects this command-context helper. Current Pi
            // provides the equivalent on ExtensionAPI, not command context.
            const commandContext = new Proxy(ctx, {
              get(target, key) {
                if (key === "sendUserMessage" && !(key in target)) return pi.sendUserMessage;
                return Reflect.get(target, key);
              },
            });
            await options.handler(args, commandContext);
          },
        });
      },
    } as ExtensionAPI;
    for (const path of paths) {
      const module = await import(pathToFileURL(path).href);
      if (typeof module.default !== "function") throw new Error(`Not an extension factory: ${path}`);
      await module.default(scopedAPI);
    }
  }

  pi.on("session_start", async (event, ctx) => {
    active = null;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === entryType) {
        const name = (entry.data as { name?: unknown })?.name;
        active = typeof name === "string" ? name : null;
      }
    }
    const selected = discoverSkillsets().find((set) => set.name === active);
    if (active && (!selected || selected.error || (!selected.count && !selected.extensions.length))) {
      ctx.ui.notify(`Skillset ${active} unavailable; no collection resources loaded.`, "warning");
      active = null;
    }
    if (active && selected?.extensions.length && !loaded.has(active)) {
      try {
        await loadExtensions(active, selected.extensions);
      } catch (error) {
        ctx.ui.notify(`Could not load ${active}: ${String(error)}. Collection disabled.`, "error");
        active = null;
      }
    }
    // Also guard session replacement without a reload: stale collection tools
    // become unreachable, and commands/hooks are gated by the restored selection.
    for (const [name, state] of loaded) {
      for (const tool of state.tools) {
        pi.registerTool(name === active ? tool : { ...tool, exposure: "hidden" });
      }
      if (name === active) for (const start of state.starts) await start(event, ctx);
    }
    ctx.ui.setStatus("skillset", active ? `skillset: ${active}` : undefined);
    if (active !== "pi-pstack") ctx.ui.setStatus("pstack-mode", undefined);
  });

  pi.on("resources_discover", () => {
    const selected = discoverSkillsets().find((set) => set.name === active);
    return { skillPaths: selected && !selected.error ? selected.paths : [] };
  });

  pi.registerCommand("skillset", {
    description: "Choose session skills/extensions; /skillset list or /skillset none",
    getArgumentCompletions: (prefix) => ["list", "none", ...discoverSkillsets().map((set) => set.name)]
      .filter((name) => name.startsWith(prefix))
      .map((name) => ({ value: name, label: name })),
    handler: async (args, ctx) => {
      const sets = discoverSkillsets();
      let name = args.trim();
      if (name === "list" || (!name && !ctx.hasUI)) {
        ctx.ui.notify([
          `Active: ${active || "none"}`,
          ...sets.map((set) => `${set.name}: ${set.error || `${set.count} skills, ${set.extensions.length} extensions`}`),
        ].join("\n"), "info");
        return;
      }
      if (!name) {
        const options = ["none", ...sets.filter((set) => !set.error && (set.count > 0 || set.extensions.length > 0)).map((set) => set.name)];
        const picked = await ctx.ui.select(`Skillset (active: ${active || "none"})`, options);
        if (!picked) return;
        name = picked;
      }
      const selected = sets.find((set) => set.name === name);
      if (name !== "none" && (!selected || selected.error || (!selected.count && !selected.extensions.length))) {
        ctx.ui.notify(`Cannot enable ${name}: ${selected?.error || "unknown or empty skillset"}. Use /skillset list.`, "error");
        return;
      }
      const next = name === "none" ? null : name;
      if (next === active && !(next === null && loaded.size)) {
        ctx.ui.notify(`Skillset already ${name}.`, "info");
        return;
      }
      await ctx.waitForIdle();
      pi.appendEntry(entryType, { name: next });
      ctx.ui.notify(`Skillset: ${name}. Reloading skills/extensions. Previously read instructions remain in conversation history.`, "info");
      await ctx.reload();
    },
  });
}
