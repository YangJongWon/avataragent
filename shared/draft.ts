export function splitDraft(text: string): { body: string; json: string | null } {
  const re = /```json\s*([\s\S]*?)```/gi;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) last = m;
  if (!last) return { body: text, json: null };
  const body = (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
  return { body, json: last[1].trim() };
}
