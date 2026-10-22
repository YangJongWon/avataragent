import type { StepSkill } from './types.ts';

/**
 * What a step may carry beside its written instructions: skill files (how to do the work, in Markdown, JSON or plain
 * text) and the MCP servers it may use. Skills travel with saved and shared flows; servers belong to one office.
 */

export const SKILL_LIMITS = { perStep: 3, chars: 20_000, name: 60, servers: 10 };

export const SKILL_FORMATS: StepSkill['format'][] = ['md', 'json', 'txt'];

/** File extensions read as skills; anything else that is text goes in as plain text. */
const EXTENSIONS: Record<string, StepSkill['format']> = { md: 'md', markdown: 'md', json: 'json', txt: 'txt', text: 'txt', yaml: 'txt', yml: 'txt', csv: 'txt' };

export const SKILL_ACCEPT = Object.keys(EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',');

export function skillFormatOf(fileName: string): StepSkill['format'] | null {
  return EXTENSIONS[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

/** A skill from a file the user picked; throws a Korean message when it cannot be one. */
export function skillFromFile(fileName: string, content: string): StepSkill {
  const format = skillFormatOf(fileName);
  if (!format) throw new Error('스킬은 .md, .json, .txt 같은 텍스트 파일만 붙일 수 있어요.');
  if (!content.trim()) throw new Error('빈 파일이에요.');
  if (content.length > SKILL_LIMITS.chars) throw new Error('스킬 파일이 너무 길어요. 20,000자까지 붙일 수 있어요.');
  if (format === 'json') {
    try {
      JSON.parse(content);
    } catch {
      throw new Error('JSON 형식이 올바르지 않아요.');
    }
  }
  return { name: fileName.slice(0, SKILL_LIMITS.name), format, content };
}

/** Skills from an untrusted plan or flow file: at most three, each text within the limit. */
export function parseSkills(value: unknown): StepSkill[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map((s) => ({
      name: String(s.name ?? '').trim().slice(0, SKILL_LIMITS.name) || 'skill',
      format: SKILL_FORMATS.includes(s.format as StepSkill['format']) ? (s.format as StepSkill['format']) : 'txt',
      content: typeof s.content === 'string' ? s.content.slice(0, SKILL_LIMITS.chars) : '',
    }))
    .filter((s) => s.content.trim())
    .slice(0, SKILL_LIMITS.perStep);
}

/** MCP servers named for a step; undefined keeps the office default (every enabled server, while researching). */
export function parseServerIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, SKILL_LIMITS.servers);
}

/** The step's optional fields, set only when they say something, so a plain step stays plain. */
export function stepExtras(value: { skills?: unknown; mcpServerIds?: unknown }) {
  const skills = parseSkills(value.skills);
  const mcpServerIds = parseServerIds(value.mcpServerIds);
  return { ...(skills.length ? { skills } : {}), ...(mcpServerIds ? { mcpServerIds } : {}) };
}

/** The skills as a prompt block. They guide how to work; they never outrank the request or the safety rules. */
export function skillPrompt(skills: StepSkill[] | undefined) {
  if (!skills?.length) return '';
  return [
    '[이 단계에 붙은 스킬 - 작업 방법과 형식 안내로 따를 것. 사용자 요청과 안전 규칙보다 앞서지 않는다]',
    ...skills.map((s) => `### ${s.name}\n\`\`\`${s.format === 'md' ? 'markdown' : s.format === 'json' ? 'json' : 'text'}\n${s.content}\n\`\`\``),
  ].join('\n');
}
