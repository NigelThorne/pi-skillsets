import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSkillsets } from "../extensions/skillset.ts";

const base = mkdtempSync(join(tmpdir(), "skillsets-"));
test.after(() => rmSync(base, { recursive: true, force: true }));
const skill = (d: string) => { mkdirSync(d, { recursive: true }); writeFileSync(join(d, "SKILL.md"), "---\nname: x\n---\n"); };
const find = (n: string) => discoverSkillsets(base).find((s) => s.name === n)!;

test("missing base dir yields empty list", () => {
  assert.deepEqual(discoverSkillsets(join(base, "nope")), []);
});

test("default skills/ fallback", () => {
  skill(join(base, "plain", "skills", "a"));
  const s = find("plain");
  assert.equal(s.error, undefined);
  assert.equal(s.count, 1);
  assert.deepEqual(s.extensions, []);
});

test("manifest parsing", () => {
  skill(join(base, "man", "custom", "a"));
  skill(join(base, "man", "custom", "b"));
  mkdirSync(join(base, "man", "ext"));
  writeFileSync(join(base, "man", "ext", "e.ts"), "export default () => {}");
  writeFileSync(join(base, "man", "skillset.json"), JSON.stringify({ skills: ["custom"], extensions: ["ext/e.ts"] }));
  const s = find("man");
  assert.equal(s.error, undefined);
  assert.equal(s.count, 2);
  assert.equal(s.extensions.length, 1);
});

test("path escape rejected", () => {
  mkdirSync(join(base, "esc"));
  writeFileSync(join(base, "esc", "skillset.json"), JSON.stringify({ skills: ["../plain/skills"] }));
  assert.match(find("esc").error!, /inside the skillset folder/);
});

test("non-array manifest value rejected", () => {
  mkdirSync(join(base, "bad"));
  writeFileSync(join(base, "bad", "skillset.json"), JSON.stringify({ skills: "skills" }));
  assert.match(find("bad").error!, /array of relative paths/);
});

test("missing resources error", () => {
  mkdirSync(join(base, "empty"));
  const s = find("empty");
  assert.equal(s.error, "resource files not installed");
  assert.equal(s.count, 0);
});
