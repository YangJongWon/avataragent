/** File extensions for the languages a result's code blocks are saved as. */
export const CODE_EXT: Record<string, string> = { python: 'py', py: 'py', typescript: 'ts', ts: 'ts', javascript: 'js', js: 'js', tsx: 'tsx', jsx: 'jsx', java: 'java', go: 'go', rust: 'rs', c: 'c', cpp: 'cpp', csharp: 'cs', cs: 'cs', ruby: 'rb', php: 'php', sql: 'sql', bash: 'sh', sh: 'sh', shell: 'sh', powershell: 'ps1', html: 'html', css: 'css', json: 'json', yaml: 'yaml', yml: 'yml', kotlin: 'kt', swift: 'swift' };

/** Code blocks of a result worth saving as files: a known language, or a file name written just above the block. */
export function codeBlocks(markdown: string) {
  return [...markdown.matchAll(/(?:^|\n)(?:[#*`\s]*([\w.-]+\.\w{1,5})[`*\s:]*\n)?```(\w+)[^\n]*\n([\s\S]*?)```/g)]
    .map((m) => ({ name: m[1] as string | undefined, lang: m[2].toLowerCase(), code: m[3] }))
    .filter((b) => CODE_EXT[b.lang] && b.code.trim().split('\n').length >= 3)
    .map((b) => ({ ...b, ext: CODE_EXT[b.lang] }));
}
