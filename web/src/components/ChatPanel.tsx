import { useEffect, useRef, useState } from 'react';
import { COMPANY_CHANNEL, MAX_CHAT_CHARS, officeChannel, parseChannel } from '../../../shared/chat.ts';
import { planHas } from '../../../shared/plans.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { ChatMessage, Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { krw, TASK_STATUS_LABEL } from '../format.ts';

export const isMine = (snapshot: Snapshot, message: ChatMessage) =>
  snapshot.viewer.kind === 'owner' ? message.author.kind === 'owner' : snapshot.viewer.kind === 'member' && message.author.id === snapshot.viewer.memberId;

export function ChatPanel(props: {
  snapshot: Snapshot;
  channel: string;
  onChannel: (channel: string) => void;
  onOpenTask: (taskId: string) => void;
  onClose: () => void;
  onError: (m: string) => void;
}) {
  const { snapshot, channel } = props;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const officeChannels = planHas(snapshot.plan, 'officeChannels');
  const parsed = parseChannel(channel);
  const threadTask = parsed?.kind === 'task' ? snapshot.tasks.find((t) => t.id === parsed.id) : undefined;
  const messages = snapshot.chat.filter((m) => m.channel === channel);
  const taskOf = (id: string) => snapshot.tasks.find((t) => t.id === id);
  const officeName = (id: string) => snapshot.offices.find((o) => o.id === id)?.name ?? '';

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, channel]);

  const send = async (body: { channel: string; text: string; taskId?: string }) => {
    setBusy(true);
    try {
      await api.postChat(body);
      return true;
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!text.trim()) return;
    if (await send({ channel, text })) setText('');
  };

  const shareTarget = threadTask ? (officeChannels ? officeChannel(threadTask.officeId) : COMPANY_CHANNEL) : null;

  return (
    <aside className="chat-panel pixel-box">
      <div className="chat-head">
        <select value={channel} onChange={(e) => props.onChannel(e.target.value)}>
          <option value={COMPANY_CHANNEL}># 회사 전체</option>
          {officeChannels &&
            snapshot.offices.map((o) => (
              <option key={o.id} value={officeChannel(o.id)}>
                # {TEAMS[o.team].emoji} {o.name}
              </option>
            ))}
          {threadTask && <option value={channel}>💬 업무: {threadTask.title}</option>}
        </select>
        <button className="icon-btn" title="닫기" onClick={props.onClose}>
          ✕
        </button>
      </div>

      {threadTask && shareTarget && (
        <div className="chat-thread-bar small">
          <button className="link-btn" onClick={() => props.onOpenTask(threadTask.id)}>
            [{TASK_STATUS_LABEL[threadTask.status]}] {threadTask.title}
          </button>
          <button
            className="pixel-btn small"
            disabled={busy}
            onClick={() => void send({ channel: shareTarget, text: '이 업무 같이 봐 주세요.', taskId: threadTask.id }).then((ok) => ok && props.onChannel(shareTarget))}
          >
            📣 {officeChannels ? `${officeName(threadTask.officeId)} 채널` : '회사 채널'}에 공유
          </button>
        </div>
      )}

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="muted small">아직 대화가 없어요. 첫 메시지를 남겨 보세요.</p>}
        {messages.map((m) => {
          const task = m.taskId ? taskOf(m.taskId) : undefined;
          return (
            <div key={m.id} className={`chat-msg ${isMine(snapshot, m) ? 'mine' : ''} ${m.author.kind === 'system' ? 'system' : ''}`}>
              <div className="chat-meta small muted">
                {m.author.name} · {new Date(m.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </div>
              {m.text && <div className="chat-text">{m.text}</div>}
              {m.taskId && (
                <button className="chat-task" disabled={!task} onClick={() => task && props.onOpenTask(task.id)}>
                  {task ? (
                    <>
                      <b>{task.title}</b>
                      <span className="small muted">
                        {officeName(task.officeId)} · {TASK_STATUS_LABEL[task.status]} · 비용 {krw(task.costKrw)}
                      </span>
                    </>
                  ) : (
                    <span className="small muted">지워진 업무예요.</span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="chat-input">
        <textarea
          value={text}
          maxLength={MAX_CHAT_CHARS}
          rows={2}
          placeholder="메시지 (Enter 보내기, Shift+Enter 줄바꿈)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button className="pixel-btn small primary" disabled={busy || !text.trim()} onClick={() => void submit()}>
          보내기
        </button>
      </div>
      <p className="muted small chat-note">채팅 내용은 AI 직원에게 전달되지 않아요.</p>
    </aside>
  );
}
