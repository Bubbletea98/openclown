import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Performer, Circus } from "./types.js";
import {
  loadSkills,
  loadUserSkills,
  skillToPerformer,
  resolveSkillsDir,
  isUserSkill,
  parseSkillMd,
  USER_SKILLS_DIR,
} from "./skill-loader.js";

// --- Load skills from both built-in and user directories ---

const builtinSkillsDir = resolveSkillsDir();
let loadedSkills = mergeSkills(loadSkills(builtinSkillsDir), loadUserSkills());

/**
 * Merge built-in and user skills. User skills with the same ID override built-in ones.
 */
function mergeSkills(
  builtins: ReturnType<typeof loadSkills>,
  userSkills: ReturnType<typeof loadSkills>,
): ReturnType<typeof loadSkills> {
  const userIds = new Set(userSkills.map((s) => s.id));
  const filtered = builtins.filter((s) => !userIds.has(s.id));
  return [...filtered, ...userSkills];
}

// --- Persistence ---

const PERSIST_DIR = join(homedir(), ".openclaw", "openclown");
const PERSIST_FILE = join(PERSIST_DIR, "circus.json");

function loadPersistedIds(): string[] | null {
  try {
    const raw = readFileSync(PERSIST_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.enabledIds)) return data.enabledIds;
  } catch {
    // File doesn't exist yet or is invalid
  }
  return null;
}

function persistIds(ids: string[]): void {
  try {
    mkdirSync(PERSIST_DIR, { recursive: true });
    writeFileSync(PERSIST_FILE, JSON.stringify({ enabledIds: ids }, null, 2));
  } catch {
    // Silently fail — persistence is best-effort
  }
}

// --- Language detection ---

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const JP_REGEX = /[\u3040-\u309f\u30a0-\u30ff]/;
const KO_REGEX = /[\uac00-\ud7af\u1100-\u11ff]/;

let detectedLang = "en";

export function detectLanguage(text: string): string {
  if (JP_REGEX.test(text)) return "ja";
  if (KO_REGEX.test(text)) return "ko";
  if (CJK_REGEX.test(text)) return "zh";
  if (/[àâéèêëïîôùûüÿçœæ]/i.test(text)) return "fr";
  if (/[áéíóúñ¿¡]/i.test(text)) return "es";
  return "en";
}

export function setDetectedLanguage(lang: string): void {
  detectedLang = lang;
  refreshPerformerNames();
}

// --- Performers (built from skills) ---

export let ALL_PERFORMERS: Performer[] = loadedSkills.map((s) => skillToPerformer(s, detectedLang));

export function refreshPerformerNames(): void {
  ALL_PERFORMERS = loadedSkills.map((s) => skillToPerformer(s, detectedLang));
}

/** Reload skills from both built-in and user directories. */
function reloadAllSkills(): void {
  loadedSkills = mergeSkills(loadSkills(builtinSkillsDir), loadUserSkills());
  refreshPerformerNames();
}

// --- Circus state (with persistence) ---

const DEFAULT_ENABLED_IDS = ["philosopher", "security", "developer"];

// Load from disk, fall back to defaults
const persisted = loadPersistedIds();
let enabledIds: Set<string> = new Set(persisted ?? DEFAULT_ENABLED_IDS);

function save(): void {
  persistIds([...enabledIds]);
}

export function getActiveCircus(): Circus {
  return {
    performers: ALL_PERFORMERS.filter((p) => enabledIds.has(p.id)),
  };
}

/** Enable one or more performers by id. Returns list of successfully enabled ids. */
export function enablePerformers(...ids: string[]): string[] {
  const enabled: string[] = [];
  for (const id of ids) {
    const exists = ALL_PERFORMERS.some((p) => p.id === id);
    if (exists && !enabledIds.has(id)) {
      enabledIds.add(id);
      enabled.push(id);
    }
  }
  if (enabled.length > 0) save();
  return enabled;
}

/** Disable one or more performers by id. Returns list of successfully disabled ids. */
export function disablePerformers(...ids: string[]): string[] {
  const disabled: string[] = [];
  for (const id of ids) {
    if (enabledIds.has(id) && enabledIds.size > 1) {
      enabledIds.delete(id);
      disabled.push(id);
    }
  }
  if (disabled.length > 0) save();
  return disabled;
}

/** Toggle a performer: enable if disabled, disable if enabled. */
export function togglePerformer(id: string): { enabled: boolean; success: boolean } {
  if (enabledIds.has(id)) {
    if (enabledIds.size <= 1) return { enabled: true, success: false };
    enabledIds.delete(id);
    save();
    return { enabled: false, success: true };
  }
  const exists = ALL_PERFORMERS.some((p) => p.id === id);
  if (!exists) return { enabled: false, success: false };
  enabledIds.add(id);
  save();
  return { enabled: true, success: true };
}

// Keep single-id compat
export function enablePerformer(id: string): boolean {
  return enablePerformers(id).length > 0;
}

export function disablePerformer(id: string): boolean {
  return disablePerformers(id).length > 0;
}

export function resetCircus(): void {
  enabledIds = new Set(DEFAULT_ENABLED_IDS);
  save();
}

export function isPerformerEnabled(id: string): boolean {
  return enabledIds.has(id);
}

// --- Custom performer management ---

/**
 * Save a custom performer SKILL.md to the user directory, reload, and enable.
 * Returns the parsed performer or null if the content is invalid.
 */
export function addCustomPerformer(skillMdContent: string): Performer | null {
  const parsed = parseSkillMd(skillMdContent);
  if (!parsed) return null;

  // Save to user directory (overrides built-in if same ID — used by edit)
  const skillDir = join(USER_SKILLS_DIR, parsed.id);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), skillMdContent, "utf-8");

  // Reload and enable
  reloadAllSkills();
  enablePerformers(parsed.id);

  return ALL_PERFORMERS.find((p) => p.id === parsed.id) ?? null;
}

/**
 * Permanently delete a custom performer.
 * Returns true if deleted, false if not found or is a built-in skill.
 */
export function deleteCustomPerformer(id: string): { success: boolean; reason?: string } {
  if (!isUserSkill(id)) {
    const isBuiltin = ALL_PERFORMERS.some((p) => p.id === id);
    if (isBuiltin) {
      return { success: false, reason: "builtin" };
    }
    return { success: false, reason: "not-found" };
  }

  // Remove from enabled set
  enabledIds.delete(id);
  save();

  // Delete from disk
  const skillDir = join(USER_SKILLS_DIR, id);
  rmSync(skillDir, { recursive: true, force: true });

  // Reload
  reloadAllSkills();

  return { success: true };
}

export const DEFAULT_CIRCUS: Circus = {
  performers: loadedSkills
    .filter((s) => DEFAULT_ENABLED_IDS.includes(s.id))
    .map((s) => skillToPerformer(s, "en")),
};

// Log what was loaded
if (loadedSkills.length > 0) {
  console.log(`[openclown] Loaded ${loadedSkills.length} performer skills from ${builtinSkillsDir}`);
  if (persisted) {
    console.log(`[openclown] Restored circus config: ${[...enabledIds].join(", ")}`);
  }
} else {
  console.warn(`[openclown] No skills found in ${builtinSkillsDir}, using empty circus`);
}
