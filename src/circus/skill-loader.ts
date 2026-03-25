import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import type { Performer, SeverityLevel } from "./types.js";

type SkillMeta = {
  id: string;
  names: Record<string, string>;
  emoji: string;
  severity: SeverityLevel;
  category: string;
};

type LoadedSkill = SkillMeta & {
  prompt: string; // Full SKILL.md content after frontmatter
};

/**
 * Load all performer skills from the skills/ directory.
 * Each skill is a directory with a SKILL.md file containing YAML frontmatter + markdown body.
 */
export function loadSkills(skillsDir: string): LoadedSkill[] {
  const skills: LoadedSkill[] = [];

  let dirs: string[];
  try {
    dirs = readdirSync(skillsDir);
  } catch {
    return skills;
  }

  for (const dir of dirs) {
    const skillPath = join(skillsDir, dir, "SKILL.md");
    try {
      const raw = readFileSync(skillPath, "utf-8");
      const skill = parseSkillFile(raw);
      if (skill) skills.push(skill);
    } catch {
      // Skip directories without SKILL.md
    }
  }

  return skills;
}

/**
 * Parse a SKILL.md file into metadata + prompt content.
 */
function parseSkillFile(raw: string): LoadedSkill | null {
  // Split frontmatter (between --- lines) from body
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const meta = parseFrontmatter(frontmatter);
  if (!meta) return null;

  return {
    ...meta,
    prompt: body,
  };
}

/**
 * Simple YAML-like frontmatter parser (no dependency needed).
 */
function parseFrontmatter(fm: string): SkillMeta | null {
  const lines = fm.split("\n");
  const data: Record<string, unknown> = {};
  let currentKey = "";
  let inNested = false;
  const nested: Record<string, string> = {};

  for (const line of lines) {
    // Nested map (names:)
    if (inNested) {
      const nestedMatch = line.match(/^\s+(\w+):\s*(.+)/);
      if (nestedMatch) {
        nested[nestedMatch[1]] = nestedMatch[2].replace(/^["']|["']$/g, "");
        continue;
      } else {
        data[currentKey] = { ...nested };
        inNested = false;
        // Clear nested for next use
        for (const k of Object.keys(nested)) delete nested[k];
      }
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].replace(/^["']|["']$/g, "").trim();
      if (!value) {
        // Start of nested map
        currentKey = key;
        inNested = true;
      } else {
        data[key] = value;
      }
    }
  }

  // Flush last nested if still open
  if (inNested && Object.keys(nested).length > 0) {
    data[currentKey] = { ...nested };
  }

  const id = data.id as string | undefined;
  const names = data.names as Record<string, string> | undefined;
  const emoji = data.emoji as string | undefined;
  const severity = data.severity as string | undefined;
  const category = (data.category as string) ?? "serious";

  if (!id || !names || !emoji || !severity) return null;

  if (severity !== "insight" && severity !== "warning" && severity !== "critical") return null;

  return { id, names, emoji, severity, category };
}

/**
 * Convert a loaded skill to a Performer with the given language.
 */
export function skillToPerformer(skill: LoadedSkill, lang: string): Performer {
  return {
    id: skill.id,
    name: skill.names[lang] ?? skill.names.en ?? skill.id,
    emoji: skill.emoji,
    prompt: skill.prompt,
    severity: skill.severity,
  };
}

/** Directory for user-created custom skills. */
export const USER_SKILLS_DIR = join(homedir(), ".openclaw", "openclown", "skills");

/**
 * Load user-created skills from ~/.openclaw/openclown/skills/.
 */
export function loadUserSkills(): LoadedSkill[] {
  return loadSkills(USER_SKILLS_DIR);
}

/**
 * Check if a skill ID exists in the user skills directory.
 */
export function isUserSkill(id: string): boolean {
  const skillPath = join(USER_SKILLS_DIR, id, "SKILL.md");
  return existsSync(skillPath);
}

/**
 * Read the raw SKILL.md content for a given skill ID.
 * Tries user dir first, then built-in dir.
 */
export function readSkillMd(id: string): string | null {
  const userPath = join(USER_SKILLS_DIR, id, "SKILL.md");
  try {
    return readFileSync(userPath, "utf-8");
  } catch {
    // Not in user dir
  }

  const builtinDir = resolveSkillsDir();
  const builtinPath = join(builtinDir, id, "SKILL.md");
  try {
    return readFileSync(builtinPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Parse a SKILL.md string into a LoadedSkill. Returns null if invalid.
 * Exported for use by the create command.
 */
export function parseSkillMd(raw: string): LoadedSkill | null {
  return parseSkillFile(raw);
}

/**
 * Resolve the built-in skills directory path.
 * In dev: <repo>/skills/
 * In dist: <package>/skills/ (shipped alongside dist/)
 */
export function resolveSkillsDir(): string {
  // Try relative to this file (works in both dev and dist)
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    // In dev: src/circus/ → ../../skills
    // In dist: dist/ → ../skills
    const candidates = [
      join(thisDir, "..", "..", "skills"),
      join(thisDir, "..", "skills"),
      join(thisDir, "skills"),
    ];
    for (const candidate of candidates) {
      try {
        readdirSync(candidate);
        return candidate;
      } catch {
        // Try next
      }
    }
  } catch {
    // fileURLToPath might fail
  }

  // Fallback: relative to cwd
  return join(process.cwd(), "skills");
}
