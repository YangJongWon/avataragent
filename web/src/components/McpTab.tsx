import { useState } from 'react';
import {
  MCP_ICONS,
  MCP_PRESETS,
  TOOL_MODE_LABEL,
  allowedModes,
  type McpPreset,
  type McpServer,
  type McpTool,
  type McpToolMode,
  type McpTransport,
} from '../../../shared/mcp.ts';
import type { Office, Snapshot } from '../../../shared/types.ts';
import { api, type McpServerInput } from '../api.ts';

type Notify = { onError: (m: string) => void; onNotice: (m: string) => void };
type SecretField = { name: string; label: string; placeholder?: string; prefix?: string; value: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function StatusBadge({ server }: { server: McpServer }) {
  if (!server.enabled) return <span className="key-badge">꺼짐</span>;
  if (server.lastError) return <span className="key-badge warn">연결 오류</span>;
  if (!server.checkedAt) return <span className="key-badge">확인 전</span>;
  return <span className="key-badge ok">연결됨 · 도구 {server.tools.length}개</span>;
}

const scopeLabel = (server: McpServer, offices: Office[]) =>
  server.officeIds === 'all'
    ? '모든 사무실'
    : offices.filter((o) => (server.officeIds as string[]).includes(o.id)).map((o) => o.name).join(', ') || '쓰는 사무실 없음';

function McpForm({
  server,
  preset,
  offices,
  stdioAllowed,
  onDone,
  onError,
  onNotice,
}: { server: McpServer | null; preset: McpPreset | null; offices: Office[]; stdioAllowed: boolean; onDone: () => void } & Notify) {
  const [form, setForm] = useState<McpServerInput>(
    server
      ? { name: server.name, icon: server.icon, transport: server.transport, url: server.url, command: server.command, args: server.args, enabled: server.enabled, officeIds: server.officeIds }
      : {
          name: preset && preset.id !== 'custom' ? preset.name : '',
          icon: preset?.icon ?? '🧩',
          transport: preset?.transport ?? 'http',
          url: preset?.url ?? '',
          command: preset?.command ?? '',
          args: preset?.args ?? [],
          enabled: true,
          officeIds: 'all',
        },
  );
  const [secrets, setSecrets] = useState<SecretField[]>(() => {
    const fields: SecretField[] = (preset?.secrets ?? []).map((s) => ({ ...s, value: '' }));
    for (const saved of server?.secrets ?? []) {
      if (!fields.some((f) => f.name === saved.name)) fields.push({ name: saved.name, label: saved.name, value: '' });
    }
    return fields;
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<McpServerInput>) => setForm((f) => ({ ...f, ...patch }));
  const savedHint = (name: string) => server?.secrets?.find((s) => s.name === name)?.hint;
  const envOrHeader = form.transport === 'stdio' ? '환경 변수' : 'HTTP 헤더';
  const chosen = form.officeIds === 'all' ? null : new Set(form.officeIds);

  const toggleOffice = (id: string) => {
    const next = new Set(chosen ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ officeIds: [...next] });
  };

  const save = async () => {
    const values: Record<string, string> = {};
    for (const field of secrets) {
      const value = field.value.trim();
      if (!field.name.trim() || !value) continue;
      values[field.name.trim()] = field.prefix && !value.startsWith(field.prefix) ? field.prefix + value : value;
    }
    setBusy(true);
    try {
      const saved = server ? await api.updateMcpServer(server.id, { ...form, secrets: values }) : await api.createMcpServer({ ...form, secrets: values });
      onNotice(`${saved.name}을(를) 저장했어요. 연결을 확인하고 있어요…`);
      onDone();
      try {
        const { tools } = await api.checkMcpServer(saved.id);
        onNotice(`${saved.name} 연결 확인: 도구 ${tools.length}개`);
      } catch (e) {
        onError(message(e));
      }
    } catch (e) {
      onError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const removeSecret = async (name: string) => {
    if (!server || !window.confirm(`${name} 비밀값을 지울까요?`)) return;
    try {
      await api.updateMcpServer(server.id, { secrets: { [name]: null } });
      setSecrets((list) => list.filter((f) => f.name !== name || preset?.secrets.some((s) => s.name === name)));
      onNotice(`${name}을(를) 지웠어요.`);
    } catch (e) {
      onError(message(e));
    }
  };

  return (
    <div className="company-form">
      {preset && <p className="muted small">{preset.note}</p>}
      <div className="row wrap">
        <label className="field">
          아이콘
          <select value={form.icon} onChange={(e) => set({ icon: e.target.value })}>
            {[...new Set([form.icon, ...MCP_ICONS])].map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </select>
        </label>
        <label className="field grow">
          이름
          <input value={form.name} maxLength={20} placeholder="예: 회사 메일" onChange={(e) => set({ name: e.target.value })} />
        </label>
      </div>
      <div className="mode-options two">
        {(
          [
            ['http', '주소로 연결 (HTTP)', '원격 MCP 서버 주소에 연결해요.'],
            ['stdio', '이 PC에서 실행 (명령)', stdioAllowed ? 'npx·uvx 같은 명령으로 MCP 서버를 띄워요.' : '.env에 MCP_ALLOW_STDIO=1이 필요해요.'],
          ] as [McpTransport, string, string][]
        ).map(([id, label, note]) => (
          <label key={id} className={`mode-option ${form.transport === id ? 'selected' : ''}`}>
            <input type="radio" name="mcp-transport" checked={form.transport === id} onChange={() => set({ transport: id })} />
            <span>
              <b>{label}</b>
              <span className="muted small">{note}</span>
            </span>
          </label>
        ))}
      </div>
      {form.transport === 'http' ? (
        <label className="field">
          MCP 주소
          <input value={form.url} placeholder="https://example.com/mcp" onChange={(e) => set({ url: e.target.value })} />
        </label>
      ) : (
        <>
          <label className="field">
            실행 명령
            <input value={form.command} placeholder="npx" onChange={(e) => set({ command: e.target.value })} />
          </label>
          <label className="field">
            인자 (한 줄에 하나)
            <textarea
              rows={3}
              value={form.args.join('\n')}
              placeholder={'-y\n@scope/some-mcp-server'}
              onChange={(e) => set({ args: e.target.value.split('\n').map((a) => a.trim()).filter(Boolean) })}
            />
          </label>
        </>
      )}

      <div className="field">
        비밀값 ({envOrHeader})
        {secrets.map((field, i) => (
          <div key={i} className="row wrap mcp-secret">
            {field.label !== field.name || preset?.secrets.some((s) => s.name === field.name) ? (
              <span className="small mcp-secret-name" title={field.name}>
                {field.label} <code>{field.name}</code>
              </span>
            ) : (
              <input
                className="mcp-secret-name"
                value={field.name}
                placeholder="이름 (예: API_KEY)"
                onChange={(e) => setSecrets((list) => list.map((f, j) => (j === i ? { ...f, name: e.target.value, label: e.target.value } : f)))}
              />
            )}
            <input
              className="grow"
              type="password"
              autoComplete="off"
              value={field.value}
              placeholder={savedHint(field.name) ? `등록됨 ${savedHint(field.name)} · 바꿀 때만 입력` : (field.placeholder ?? '값')}
              onChange={(e) => setSecrets((list) => list.map((f, j) => (j === i ? { ...f, value: e.target.value } : f)))}
            />
            {savedHint(field.name) && (
              <button className="pixel-btn small danger" type="button" onClick={() => removeSecret(field.name)}>
                삭제
              </button>
            )}
          </div>
        ))}
        <button className="link-btn" type="button" onClick={() => setSecrets((list) => [...list, { name: '', label: '', value: '' }])}>
          + 비밀값 추가
        </button>
        <span className="muted small">
          값은 이 서버의 data 폴더에만 저장되고 화면으로는 다시 보내지 않아요.
          {form.transport === 'http' && ' 토큰은 보통 이름을 Authorization, 값을 "Bearer 토큰"으로 넣어요.'}
        </span>
      </div>

      <div className="field">
        쓸 사무실
        <div className="row wrap">
          <label className="check">
            <input type="checkbox" checked={form.officeIds === 'all'} onChange={(e) => set({ officeIds: e.target.checked ? 'all' : [] })} />
            모든 사무실
          </label>
          {chosen &&
            offices.map((o) => (
              <label key={o.id} className="check">
                <input type="checkbox" checked={chosen.has(o.id)} onChange={() => toggleOffice(o.id)} />
                {o.name}
              </label>
            ))}
        </div>
      </div>

      <div className="row end wrap">
        <button className="pixel-btn small" type="button" onClick={onDone}>
          취소
        </button>
        <button className="pixel-btn small primary" type="button" disabled={busy || !form.name.trim()} onClick={save}>
          {busy ? '저장 중…' : '저장 후 연결 확인'}
        </button>
      </div>
    </div>
  );
}

function ToolList({ server, onError }: { server: McpServer } & Pick<Notify, 'onError'>) {
  const choose = async (tool: McpTool, mode: McpToolMode) => {
    if (mode === 'auto' && !tool.readOnly) {
      const ok = window.confirm(
        `${tool.name}은(는) 읽기 전용 표시가 없어요. 외부에 글을 쓰거나 보내는 도구일 수 있어요.\n조사 때 자동으로 쓰면 승인 없이 호출돼요. 쓰기 도구라면 "승인 후 실행"을 고르세요. 그래도 자동으로 쓸까요?`,
      );
      if (!ok) return;
    }
    try {
      await api.updateMcpServer(server.id, { tools: { [tool.name]: mode } });
    } catch (e) {
      onError(message(e));
    }
  };

  if (!server.tools.length) return <p className="muted small">아직 확인된 도구가 없어요. 연결 확인을 눌러 주세요.</p>;
  const auto = server.tools.filter((t) => t.mode === 'auto').length;
  const approval = server.tools.filter((t) => t.mode === 'approval').length;
  return (
    <details className="found-models" open={server.tools.length <= 6}>
      <summary>
        도구 {server.tools.length}개 · 조사 때 자동 {auto}개 · 승인 후 실행 {approval}개
      </summary>
      <ul className="mcp-tools">
        {server.tools.map((tool) => (
          <li key={tool.name}>
            <div className="mcp-tool-row" title={tool.description}>
              <select value={tool.mode} onChange={(e) => choose(tool, e.target.value as McpToolMode)}>
                {allowedModes(tool).map((mode) => (
                  <option key={mode} value={mode}>
                    {TOOL_MODE_LABEL[mode]}
                  </option>
                ))}
              </select>
              <code>{tool.name}</code>
              {tool.readOnly && <span className="key-badge ok">읽기</span>}
              {tool.destructive && <span className="key-badge warn">위험 · 승인 필요</span>}
            </div>
            {tool.description && <div className="muted small ellipsis">{tool.description}</div>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function McpTab({ snapshot, onError, onNotice }: { snapshot: Snapshot } & Notify) {
  const servers = snapshot.mcpServers ?? [];
  const stdioAllowed = Boolean(snapshot.mcpStdioAllowed);
  const [editing, setEditing] = useState<{ id: string | 'new'; preset: McpPreset | null } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  const check = async (server: McpServer) => {
    setChecking(server.id);
    try {
      const { tools } = await api.checkMcpServer(server.id);
      onNotice(`${server.name} 연결 확인: 도구 ${tools.length}개`);
    } catch (e) {
      onError(message(e));
    } finally {
      setChecking(null);
    }
  };

  const toggle = async (server: McpServer) => {
    try {
      await api.updateMcpServer(server.id, { enabled: !server.enabled });
    } catch (e) {
      onError(message(e));
    }
  };

  const remove = async (server: McpServer) => {
    if (!window.confirm(`${server.name} 연결과 저장한 비밀값을 지울까요?`)) return;
    try {
      await api.deleteMcpServer(server.id);
      onNotice(`${server.name}을(를) 지웠어요.`);
    } catch (e) {
      onError(message(e));
    }
  };

  const formProps = { offices: snapshot.offices, stdioAllowed, onDone: () => setEditing(null), onError, onNotice };

  return (
    <div className="page">
      <h2>MCP 관리</h2>
      <p className="muted">
        검색, Notion, 메일 같은 외부 기능을 <b>MCP 서버</b>로 연결해요. 켜 둔 도구는 그 사무실 직원들이 <b>조사 단계</b>에서 필요할 때 불러
        써요. 도구 호출과 결과는 업무 기록에 남아요.
      </p>
      {!stdioAllowed && (
        <p className="warn-line">
          ⚠ 이 PC에서 명령을 실행하는 MCP(npx·uvx)는 꺼져 있어요. 쓰려면 .env에 MCP_ALLOW_STDIO=1을 넣고 서버를 다시 켜 주세요. 외부 공개 중이라면
          비밀번호를 길게 바꾼 뒤 켜는 걸 권해요.
        </p>
      )}

      <section className="pixel-box section">
        <div className="row between">
          <h3>연결 추가</h3>
        </div>
        <div className="row wrap">
          {MCP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={`pixel-btn small ${editing?.id === 'new' && editing.preset?.id === preset.id ? 'primary' : ''}`}
              disabled={preset.transport === 'stdio' && !stdioAllowed}
              title={preset.note}
              onClick={() => setEditing({ id: 'new', preset })}
            >
              {preset.icon} {preset.name}
            </button>
          ))}
        </div>
        {editing?.id === 'new' && (
          <div className="company-card editing">
            <McpForm key={editing.preset?.id ?? 'new'} server={null} preset={editing.preset} {...formProps} />
          </div>
        )}
      </section>

      <section className="pixel-box section">
        <h3>연결된 MCP 서버</h3>
        {servers.length === 0 && <p className="muted">아직 연결한 MCP 서버가 없어요. 위에서 하나 골라 추가해 보세요.</p>}
        <div className="company-grid">
          {servers.map((server) =>
            editing?.id === server.id ? (
              <div key={server.id} className="company-card editing">
                <McpForm server={server} preset={null} {...formProps} />
              </div>
            ) : (
              <div key={server.id} className={`company-card ${server.enabled ? '' : 'mcp-off'}`}>
                <div className="company-name">
                  {server.icon} {server.name}
                </div>
                <div className="muted small ellipsis" title={server.transport === 'http' ? server.url : [server.command, ...server.args].join(' ')}>
                  {server.transport === 'http' ? server.url : `$ ${[server.command, ...server.args].join(' ')}`}
                </div>
                <div className="row wrap">
                  <StatusBadge server={server} />
                  {(server.secrets ?? []).map((s) => (
                    <span key={s.name} className="key-badge ok" title={s.name}>
                      🔑 {s.name} {s.hint}
                    </span>
                  ))}
                </div>
                <div className="muted small">🏢 {scopeLabel(server, snapshot.offices)}</div>
                {server.lastError && <div className="small mcp-error">{server.lastError}</div>}
                <ToolList server={server} onError={onError} />
                <div className="row end wrap">
                  <label className="check small">
                    <input type="checkbox" checked={server.enabled} onChange={() => toggle(server)} />
                    사용
                  </label>
                  <button className="pixel-btn small danger" onClick={() => remove(server)}>
                    삭제
                  </button>
                  <button className="pixel-btn small" disabled={checking === server.id} onClick={() => check(server)}>
                    {checking === server.id ? '확인 중…' : '🔌 연결 확인'}
                  </button>
                  <button className="pixel-btn small" onClick={() => setEditing({ id: server.id, preset: null })}>
                    편집
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
