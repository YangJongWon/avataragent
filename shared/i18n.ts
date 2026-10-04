/**
 * Display language. Korean is the source of truth: every catalogue key *is* the
 * Korean source string, and anything without a translation falls back to that source.
 * Adding a language therefore never blanks a screen or shows a raw key.
 */
export type Language = 'ko' | 'zh' | 'ja' | 'en';

export interface LanguageMeta {
  id: Language;
  /** Self-describing name, always written in the language itself. */
  label: string;
  /** Endonym plus an English gloss, for people who cannot read the endonym. */
  note: string;
  flag: string;
  /** BCP 47 tag for Intl formatting and <html lang>. */
  locale: string;
}

export const LANGUAGES: LanguageMeta[] = [
  { id: 'ko', label: '한국어', note: 'Korean', flag: '🇰🇷', locale: 'ko-KR' },
  { id: 'zh', label: '中文', note: 'Chinese (Simplified)', flag: '🇨🇳', locale: 'zh-CN' },
  { id: 'ja', label: '日本語', note: 'Japanese', flag: '🇯🇵', locale: 'ja-JP' },
  { id: 'en', label: 'English', note: 'English', flag: '🇬🇧', locale: 'en-US' },
];

export const DEFAULT_LANGUAGE: Language = 'ko';

export const isLanguage = (v: unknown): v is Language => LANGUAGES.some((l) => l.id === v);
export const languageOf = (id: Language | undefined) => LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
export const localeOf = (id: Language | undefined) => languageOf(id).locale;

/** Picks the closest supported language for a browser locale list, e.g. `['ja-JP','en']` -> 'ja'. */
export function detectLanguage(tags: readonly string[]): Language {
  for (const tag of tags) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLanguage(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}

export type Vars = Record<string, string | number | null | undefined>;

/** `{name}` holes a translation may reorder, since zh/ja/en word order differs from ko. */
const PLACEHOLDER = /\{(\w+)\}/g;

type Catalogue = Record<string, Partial<Record<Language, string>>>;

const CATALOGUE: Catalogue = {
  // ── 환경 설정 ───────────────────────────────────────────────
  '환경 설정': { zh: '环境设置', ja: '環境設定', en: 'Settings' },
  '화면 언어': { zh: '界面语言', ja: '表示言語', en: 'Display language' },
  '언어를 고르면 설정 화면과 안내 문구가 바뀝니다.': {
    zh: '选择语言后，设置界面和说明文字会随之改变。',
    ja: '言語を選ぶと、設定画面と説明文が切り替わります。',
    en: 'Pick a language and the settings screen and help text switch with it.',
  },
  '현재 언어': { zh: '当前语言', ja: '現在の言語', en: 'Current language' },

  // ── 상단 탭 ─────────────────────────────────────────────────
  '사무실': { zh: '办公室', ja: 'オフィス', en: 'Office' },
  '프로젝트 라운지': { zh: '项目休息室', ja: 'プロジェクトラウンジ', en: 'Project lounge' },
  '직원 관리': { zh: '员工管理', ja: '社員管理', en: 'Staff' },
  '모델 관리': { zh: '模型管理', ja: 'モデル管理', en: 'Models' },
  'MCP 관리': { zh: 'MCP 管理', ja: 'MCP 管理', en: 'MCP' },
  '손익·결산': { zh: '损益·结算', ja: '損益・決算', en: 'Profit' },
  '성과·개선': { zh: '成果·改进', ja: '成果・改善', en: 'Results' },
  '플랜·구성원': { zh: '套餐·成员', ja: 'プラン・メンバー', en: 'Plan & people' },
  '업무 게시판': { zh: '任务看板', ja: 'タスクボード', en: 'Task board' },
  '업무 설계': { zh: '任务设计', ja: 'タスク設計', en: 'Task design' },
  '근무·효율': { zh: '考勤·效率', ja: '勤務・効率', en: 'Attendance' },
  '사용법 묻기': { zh: '询问使用方法', ja: '使い方を聞く', en: 'How do I use this?' },
  '알파 이후 추가 예정': { zh: 'Alpha 之后推出', ja: 'Alpha の後に追加予定', en: 'Planned after alpha' },

  // ── 공통 버튼·상태 ──────────────────────────────────────────
  '저장': { zh: '保存', ja: '保存', en: 'Save' },
  '닫기': { zh: '关闭', ja: '閉じる', en: 'Close' },
  '취소': { zh: '取消', ja: 'キャンセル', en: 'Cancel' },
  '예정': { zh: '预计', ja: '予定', en: 'ETA' },
  '새로 뽑기': { zh: '重新抽取', ja: '選び直す', en: 'Shuffle' },
  '도움말': { zh: '帮助', ja: 'ヘルプ', en: 'Help' },
  '채팅': { zh: '聊天', ja: 'チャット', en: 'Chat' },
  '그룹 채팅': { zh: '群聊', ja: 'グループチャット', en: 'Group chat' },
  '나가기': { zh: '退出', ja: 'ログアウト', en: 'Sign out' },
  '전체 사무실': { zh: '全部办公室', ja: '全オフィス', en: 'All offices' },
  '잔액': { zh: '余额', ja: '残高', en: 'Balance' },
  '이익': { zh: '利润', ja: '利益', en: 'Profit' },
  '이번 달 남은 AI 예산': { zh: '本月剩余 AI 预算', ja: '今月の残りAI予算', en: 'AI budget left this month' },
  '인정 가치 - 비용': { zh: '确认价值 − 成本', ja: '認定価値 − 費用', en: 'Recognized value − cost' },

  // ── 업무 상태 ───────────────────────────────────────────────
  '대기': { zh: '排队中', ja: '待機中', en: 'Queued' },
  '진행 중': { zh: '进行中', ja: '進行中', en: 'In progress' },
  '도움 요청': { zh: '请求帮助', ja: 'ヘルプ依頼', en: 'Needs help' },
  '승인 대기': { zh: '等待批准', ja: '承認待ち', en: 'Needs approval' },
  '완료': { zh: '完成', ja: '完了', en: 'Done' },
  '중단': { zh: '中止', ja: '中断', en: 'Stopped' },
  '직원': { zh: '员工', ja: '社員', en: 'Staff' },
  '다시': { zh: 'again', ja: 'もう一度', en: 'back' },
  '도구': { zh: '工具', ja: 'ツール', en: 'tool' },
  '슬라이드': { zh: '幻灯片', ja: 'スライド', en: 'slides' },
  '문서': { zh: '文档', ja: 'ドキュメント', en: 'document' },

  // ── 모델 등급 ──────────────────────────────────────────────
  '기본': { zh: '基础', ja: '基本', en: 'Standard' },
  '중급': { zh: '中档', ja: '中級', en: 'Advanced' },
  '고급': { zh: '高档', ja: '上級', en: 'Premium' },

  // ── 팀 ─────────────────────────────────────────────────────
  '개발팀': { zh: '开发团队', ja: '開発チーム', en: 'Engineering' },
  '인사팀': { zh: '人事团队', ja: '人事チーム', en: 'People' },
  '경영팀': { zh: '管理团队', ja: '経営チーム', en: 'Management' },
  '서포터팀': { zh: '客服团队', ja: 'サポートチーム', en: 'Support' },
  '복지팀': { zh: '福利团队', ja: '福利厚生チーム', en: 'Wellbeing' },

  // ── 직무 ───────────────────────────────────────────────────
  '개발 팀장': { zh: '开发组长', ja: '開発チームリーダー', en: 'Engineering lead' },
  '리서처': { zh: '研究员', ja: 'リサーチャー', en: 'Researcher' },
  '분석·정리': { zh: '分析·整理', ja: '分析・整理', en: 'Analyst' },
  '리뷰어': { zh: '评审', ja: 'レビュアー', en: 'Reviewer' },
  '인사 팀장': { zh: '人事组长', ja: '人事チームリーダー', en: 'People lead' },
  '메일 담당': { zh: '邮件专员', ja: 'メール担当', en: 'Mail specialist' },
  '일정 담당': { zh: '日程专员', ja: 'スケジュール担当', en: 'Scheduler' },
  '검토자': { zh: '审查员', ja: 'チェッカー', en: 'Checker' },
  '경영 실장': { zh: '经营主管', ja: '経営マネージャー', en: 'Ops manager' },
  '데이터 담당': { zh: '数据专员', ja: 'データ担当', en: 'Analyst' },
  '예산 담당': { zh: '预算专员', ja: '予算担当', en: 'Budget owner' },
  '감사': { zh: '审计', ja: '監査', en: 'Auditor' },
  '서포트 리더': { zh: '客服组长', ja: 'サポートリーダー', en: 'Support lead' },
  '문의 분류': { zh: '咨询分类', ja: '問い合わせ分類', en: 'Triage' },
  '답변 작성': { zh: '撰写回复', ja: '返信作成', en: 'Replies' },
  '품질 검수': { zh: '质量检查', ja: '品質チェック', en: 'QA' },
  '복지 팀장': { zh: '福利组长', ja: '福利厚生リーダー', en: 'Wellbeing lead' },
  '관심사 탐색': { zh: '兴趣探索', ja: '興味探索', en: 'Interest scout' },
  '추천 큐레이터': { zh: '推荐策划', ja: 'レコメンダー', en: 'Curator' },

  // ── 여정 상태 ──────────────────────────────────────────────
  '작업 중': { zh: '进行中', ja: '作業中', en: 'Working' },
  '오류': { zh: '错误', ja: 'エラー', en: 'Error' },
  '사용자 대기': { zh: '等待用户', ja: 'ユーザー待ち', en: 'Waiting on you' },
  '되돌아감': { zh: '已回退', ja: '差し戻し', en: 'Looped back' },
  '사용자': { zh: '用户', ja: 'ユーザー', en: 'You' },
  '담당 없음': { zh: '未分配', ja: '担当なし', en: 'Unassigned' },
  '업무 여정': { zh: '任务流程', ja: 'タスクフロー', en: 'Task journey' },
  '✋ 배치 조정': { zh: '✋ 调整布局', ja: '✋ 配置を調整', en: '✋ Adjust layout' },
  '✓ 배치 완료': { zh: '✓ 布局完成', ja: '✓ 配置完了', en: '✓ Layout done' },
  '↺ 자동 배치': { zh: '↺ 自动布局', ja: '↺ 自動配置', en: '↺ Auto layout' },
  '✏️ 여정 편집': { zh: '✏️ 编辑流程', ja: '✏️ フローを編集', en: '✏️ Edit journey' },
  '단계 상자를 끌어서 옮기고, 모서리를 끌어서 크기를 바꿔요': {
    zh: '拖动方块移动位置，拖动边角调整大小。',
    ja: 'ボックスをドラッグして移動し、角をドラッグしてサイズを変えます。',
    en: 'Drag a box to move it, and drag a corner to resize.',
  },
  '화면 너비에 맞춰 자동으로 줄바꿈해요': {
    zh: '会按屏幕宽度自动换行排列。',
    ja: '画面幅に合わせて自動で折り返します。',
    en: 'Reflows automatically to fit the screen width.',
  },

  // ── 여정 단계 종류 ─────────────────────────────────────────
  '접수·지시': { zh: '接收·指示', ja: '受付・指示', en: 'Intake' },
  '조사·분석': { zh: '调查·分析', ja: '調査・分析', en: 'Research' },
  '결과물 작성': { zh: '撰写成果物', ja: '成果物を作成', en: 'Write up' },
  '요청을 읽고 작업 지시서를 만들어요.': {
    zh: '阅读请求并生成作业指示书。',
    ja: 'リクエストを読み、作業指示書を作成します。',
    en: 'Reads the request and writes a brief.',
  },
  '자료를 모으거나 분석 메모를 남겨요. 여러 개 둘 수 있어요.': {
    zh: '收集资料或留下分析备忘。可以放多个。',
    ja: '資料を集め거나分析メモを残します。複数設置できます。',
    en: 'Gathers sources or leaves analysis notes. Several allowed.',
  },
  '최종 결과물을 써요. 하나만 둘 수 있어요.': {
    zh: '撰写最终成果物。只能放一个。',
    ja: '最終成果物を書きます。1つだけ設置できます。',
    en: 'Writes the final deliverable. Only one allowed.',
  },
  '반려 조건에 걸리면 정한 단계로 되돌아가요.': {
    zh: '一旦触发驳回条件，就回到指定步骤。',
    ja: '差戻し条件に引っかかったら、指定したステップに戻ります。',
    en: 'Sends it back to a chosen step when the reject condition hits.',
  },
  '내가 승인하면 반영돼요.': {
    zh: '你批准后才会生效。',
    ja: 'あなたが承認すると反映されます。',
    en: 'Takes effect once you approve.',
  },

  // ── 여정 설계 ──────────────────────────────────────────────
  '유형 기본': { zh: '按类型套用', ja: 'タイプ標準', en: 'Template' },
  'AI 설계': { zh: 'AI 设计', ja: 'AI設計', en: 'AI designed' },
  '직접 설계': { zh: '手动设计', ja: '手動設計', en: 'Designed by hand' },
  '추가 조사': { zh: '追加调查', ja: '追加調査', en: 'Extra research' },
  '추가 검토': { zh: '追加审查', ja: '追加レビュー', en: 'Extra review' },

  // ── 성격 ───────────────────────────────────────────────────
  '균형형': { zh: '均衡型', ja: 'バランス型', en: 'Balanced' },
  '꼼꼼형': { zh: '细致型', ja: '丁寧型', en: 'Meticulous' },
  '신속형': { zh: '迅速型', ja: '迅速型', en: 'Fast' },
  '창의형': { zh: '创意型', ja: '創造型', en: 'Creative' },
  '친절형': { zh: '亲切型', ja: '親切型', en: 'Friendly' },
  '비판형': { zh: '批判型', ja: '批判型', en: 'Critical' },
  '속도와 꼼꼼함을 적당히 맞춰요. 처음엔 이걸로 충분해요.': {
    zh: '速度和细致程度取得平衡。刚开始用这个就够了。',
    ja: '速度と丁寧さを適度に調和させます。最初はこれで十分です。',
    en: 'Balances speed and care. Good enough to start with.',
  },
  '근거와 수치를 하나하나 확인하고, 애매하면 먼저 물어봐요. 대신 조금 느리고 길어요.': {
    zh: '逐条确认依据和数字，有歧义就先提问。代价是稍慢、稍长。',
    ja: '根拠と数値を一つずつ確認し、曖昧なら先に質問します。その代わり少し遅く長くなります。',
    en: 'Checks every source and figure, and asks when unsure. Slower and longer in exchange.',
  },
  '핵심만 짧게, 빨리 끝내요. 토큰이 적게 들어 비용도 줄어요.': {
    zh: '只写要点、迅速完成。token 少，成本也更低。',
    ja: '要点だけ短く、快速に終わります。tokenが少なくコストも下がります。',
    en: 'Short and quick on the essentials. Uses fewer tokens, so it costs less.',
  },
  '뻔한 답 대신 새로운 관점과 대안을 함께 내놓아요.': {
    zh: '不给出千篇一律的答案，而是同时提出新视角和替代方案。',
    ja: 'ありきたりな答えの代わりに、新しい視点と代替案を併せて出します。',
    en: 'Offers a fresh angle and an alternative instead of the obvious answer.',
  },
  '쉬운 말과 부드러운 말투로, 처음 보는 사람도 이해하게 써요.': {
    zh: '用平实语言和温和语气，让第一次看到的人也能看懂。',
    ja: 'やさしい言葉で柔らかい口調で、初めて見る人にも分かるように書きます。',
    en: 'Writes plainly and warmly so a newcomer can follow.',
  },
  '약점, 위험, 반대 의견부터 짚어요. 검토 담당에게 잘 어울려요.': {
    zh: '先指出弱点、风险和反对意见。很适合负责审查的成员。',
    ja: '弱点・リスク・反対意見から指摘します。レビュー担当に向いています。',
    en: 'Leads with weaknesses, risks, and objections. Suits a reviewer.',
  },

  // ── 성과·개선 ──────────────────────────────────────────────
  '조사와 검수가 끝날 때마다 결과를 기록해요. 기록은 다음 업무의 지시(지난 반려 사유), 담당자 배정(성과 좋은 직원 우선), 개선 제안에 자동으로 쓰여요.': {
    zh: '每次调查和审查结束都会记录结果。这些记录会自动用于下一次任务的指示（以往的驳回原因）、负责人分配（优先安排成绩好的成员）和改进建议。',
    ja: '調査とレビューが終わるたびに結果を記録します。この記録は次のタスクの指示（過去の差戻し理由）、担当割り当て（成績の良いメンバーを優先）、改善提案に自動で使われます。',
    en: 'Records the outcome of every research and review. Those records feed the next job brief (past rejections), who gets assigned (best performers first), and improvement suggestions.',
  },
  '조사 정확도': { zh: '调查准确度', ja: '調査精度', en: 'Research accuracy' },
  '조사 속도': { zh: '调查速度', ja: '調査速度', en: 'Research speed' },
  '검수 통과율': { zh: '审查通过率', ja: 'レビュー合格率', en: 'Review pass rate' },
  '첫 시도 통과율': { zh: '一次通过率', ja: '初回合格率', en: 'First-pass rate' },
  '검수 판단 정확도': { zh: '审查判断准确度', ja: 'レビュー判断精度', en: 'Review judgement accuracy' },
  '작성물 검수 통과': { zh: '成果物审查通过', ja: '成果物レビュー合格', en: 'Deliverables passed' },
  '직원별 기록': { zh: '按成员记录', ja: 'メンバー別記録', en: 'Per-person record' },
  '개선 제안': { zh: '改进建议', ja: '改善提案', en: 'Suggestions' },
  '반영 기록': { zh: '应用记录', ja: '反映履歴', en: 'Applied history' },
  '최근 반려 사유': { zh: '最近的驳回原因', ja: '最近の差戻し理由', en: 'Recent rejections' },
  '직접 결정': { zh: '需手动决定', ja: '手動で決定', en: 'Decide manually' },
  '자동 반영 가능': { zh: '可自动应用', ja: '自動反映可', en: 'Can auto-apply' },
  '직접 적용': { zh: '手动应用', ja: '手動で適用', en: 'Applied by hand' },
  '적용': { zh: '应用', ja: '適用', en: 'Apply' },
  '설정': { zh: '配置', ja: '設定', en: 'Setup' },
  '사무실이 없어요.': { zh: '没有办公室。', ja: 'オフィスがありません。', en: 'No offices yet.' },
  '(내보낸 직원)': { zh: '（已导出的成员）', ja: '（退社したメンバー）', en: '(departed staff)' },

  // ── 모자 · 스킨 ────────────────────────────────────────────
  '기본 모자': { zh: '基础帽', ja: '基本帽子', en: 'Plain cap' },
  '중급 모자': { zh: '中档帽', ja: '中級帽子', en: 'Banded cap' },
  '고급 + 테두리 + 장식 모자': { zh: '高档 + 帽檐 + 装饰', ja: '上級 + つば + 装飾', en: 'Premium + brim + trim' },
  '비니 + 스파크': { zh: '毛线帽 + 绒球', ja: 'ニット帽 + ポンポン', en: 'Beanie + pompom' },
  '야구모자 + 매듭': { zh: '棒球帽 + 结', ja: '野球帽 + 結び目', en: 'Cap + knot' },
  '헬멧 + 바이저': { zh: '头盔 + 面罩', ja: 'ヘルメット + バイザー', en: 'Helmet + visor' },
  '마법사 모자 + 별': { zh: '巫师帽 + 星星', ja: '魔法使い帽子 + 星', en: 'Wizard hat + star' },
  '베레모': { zh: '贝雷帽', ja: 'ベレー帽', en: 'Beret' },
  '실크햇 + 리본': { zh: '高礼帽 + 缎带', ja: 'シルケット + リボン', en: 'Top hat + ribbon' },
  '두건 + 물방울': { zh: '头巾 + 水滴', ja: 'バンダナ + しずく', en: 'Bandana + drop' },
  '기본 픽셀': { zh: '基础像素', ja: '基本ピクセル', en: 'Basic pixel' },
  '미소녀': { zh: '像素美少女', ja: 'ピクセル美少女', en: 'Pixel girl' },
  '핑크 소녀 (CC0)': { zh: '粉色少女 (CC0)', ja: 'ピンク少女 (CC0)', en: 'Pink girl (CC0)' },
  '역할별 소품과 표정이 있는 기본 직원': {
    zh: '带角色道具和表情的基础成员',
    ja: '役割ごとの小物と表情がある基本メンバー',
    en: 'The basic staff member, with role props and expressions',
  },
  '긴 머리·큰 눈 픽셀 미소녀. 표정과 역할 소품 지원': {
    zh: '长发明眼的像素美少女。支持表情和角色道具',
    ja: 'ロングヘア・大きな目のピクセル美少女。表情と役割の小物に対応',
    en: 'A pixel girl with long hair and big eyes. Supports expressions and role props',
  },
  '무료 공개 스프라이트. 걷기 애니메이션 지원, 표정 변화 없음': {
    zh: '免费公开的素材。支持走路动画，无表情变化',
    ja: '無料で公開されているスプライト。歩行アニメーション対応、表情変化なし',
    en: 'Freely released sprite. Walk animation, no expression changes',
  },

  // ── 직원 관리 ──────────────────────────────────────────────
  '이름 없음': { zh: '未命名', ja: '名前なし', en: 'Unnamed' },
  '이름': { zh: '姓名', ja: '名前', en: 'Name' },
  '이름 (비우면 자동)': { zh: '姓名（留空自动生成）', ja: '名前（空欄で自動）', en: 'Name (blank for auto)' },
  '역할': { zh: '职责', ja: '役割', en: 'Role' },
  '개인 규칙': { zh: '个人规则', ja: '個人ルール', en: 'Personal rules' },
  '외형 고르기': { zh: '1. 选择外观', ja: '1. 外観を選ぶ', en: '1. Pick a look' },
  '모델 고르기': { zh: '2. 选择模型', ja: '2. モデルを選ぶ', en: '2. Pick a model' },
  '후보 캐릭터 고르기': { zh: '3. 选择候选角色', ja: '3. 候補キャラクターを選ぶ', en: '3. Pick a candidate' },
  '성격 · 일하는 스타일': { zh: '4. 性格 · 工作风格', ja: '4. 性格・働き方', en: '4. Personality and style' },
  '후보 새로 뽑기': { zh: '再抽一批候选', ja: '候補を引き直す', en: 'Shuffle candidates' },
  '모자 모양 = AI 회사, 장식 = 등급': {
    zh: '帽子款式 = AI 公司，装饰 = 等级',
    ja: '帽子の形 = AI会社、装飾 = ランク',
    en: 'Hat shape = AI vendor, trim = tier',
  },
  '마음에 드는 캐릭터를 눌러 바로 적용하세요.': {
    zh: '点击喜欢的角色即可立即应用。',
    ja: '気になるキャラクターを押すと 바로適用されます。',
    en: 'Click a character you like to apply it.',
  },
  '지시를 어떤 방식으로 수행할지 정해요. 실제 AI에게는 매번 이 스타일이 함께 전달돼요.': {
    zh: '决定如何执行指示。每次调用真实 AI 时都会一并传达这个风格。',
    ja: '指示をどう実行するかを決めます。実際のAIには毎回このスタイルが 함께渡されます。',
    en: 'Decides how instructions get carried out. Every real AI call passes this style along.',
  },
  '직원 고용': { zh: '雇用成员', ja: 'メンバーを雇用', en: 'Hire staff' },
  '고용하기': { zh: '雇用', ja: '雇用する', en: 'Hire' },
  '자리가 꽉 찼어요': { zh: '位置已满', ja: '席が埋まりました', en: 'No room left' },
  '변경': { zh: '修改', ja: '変更', en: 'Edit' },
  '내보내기': { zh: '让其离职', ja: '退職させる', en: 'Let go' },
  '이 역할의 마지막 직원은 내보낼 수 없어요.': {
    zh: '这个职责的最后一名成员不能离职。',
    ja: 'この役割の最後のメンバーは退職できません。',
    en: 'The last person in a role cannot be let go.',
  },
  '같은 역할 직원이 여럿이면 업무 흐름을 짤 때 단계마다 담당자를 고를 수 있어요.': {
    zh: '同一职责有多名成员时，编排任务流程可以逐步选择负责人。',
    ja: '同じ役割のメンバーが複数いる場合、タスクのフローを組む 단계ごとに担当者を選べます。',
    en: 'With several people in a role, you can pick an owner at each step when building a journey.',
  },
  '모자 모양 = AI 회사': { zh: '帽子款式 = AI 公司', ja: '帽子の形 = AI会社', en: 'Hat shape = AI vendor' },
  '장식 = 모델 등급': { zh: '装饰 = 模型等级', ja: '装飾 = モデルランク', en: 'Trim = model tier' },
  '스킨 출처': { zh: '皮肤来源', ja: 'スキンの出典', en: 'Skin credits' },
  '출처': { zh: '来源', ja: '出典', en: 'Credit' },

  // ── 모델 관리 ──────────────────────────────────────────────
  '시뮬레이션': { zh: '模拟', ja: 'シミュレーション', en: 'Simulation' },
  'OpenAI 하나로 호출': { zh: '统一走 OpenAI', ja: 'OpenAI に統一', en: 'All through OpenAI' },
  'Anthropic 하나로 호출': { zh: '统一走 Anthropic', ja: 'Anthropic に統一', en: 'All through Anthropic' },
  'Gemini 하나로 호출': { zh: '统一走 Gemini', ja: 'Gemini に統一', en: 'All through Gemini' },
  'xAI 하나로 호출': { zh: '统一走 xAI', ja: 'xAI に統一', en: 'All through xAI' },
  '등록됨': { zh: '已登记', ja: '登録済み', en: 'Registered' },
  '키 없음': { zh: '无密钥', ja: 'キーなし', en: 'No key' },
  '키 없음 (필요 없으면 괜찮아요)': {
    zh: '无密钥（不需要也没关系）',
    ja: 'キーなし（不要なら問題ありません）',
    en: 'No key (fine if you do not need one)',
  },
  '키 저장': { zh: '保存密钥', ja: 'キーを保存', en: 'Save key' },
  '키 삭제': { zh: '删除密钥', ja: 'キーを削除', en: 'Delete key' },
  'API 키': { zh: 'API 密钥', ja: 'APIキー', en: 'API key' },
  'API 키 입력': { zh: '输入 API 密钥', ja: 'APIキーを入力', en: 'Enter an API key' },
  'API 키 바꾸기': { zh: '更换 API 密钥', ja: 'APIキーを変更', en: 'Replace API key' },
  '바꿀 때만 입력': { zh: '只在更换时输入', ja: '変更するときだけ入力', en: 'Only when replacing' },
  'API 키를 지웠어요.': { zh: '已删除 API 密钥。', ja: 'APIキーを削除しました。', en: 'Deleted the API key.' },
  '확인 중…': { zh: '确认中…', ja: '確認中…', en: 'Checking…' },
  '연결 확인': { zh: '检查连接', ja: '接続を確認', en: 'Check connection' },
  '목록이 비어 있어요.': { zh: '列表为空。', ja: '一覧が空です。', en: 'The list is empty.' },
  '빠른 채우기': { zh: '快速填充', ja: 'クイック入力', en: 'Quick fill' },
  '회사 이름': { zh: '公司名称', ja: '会社名', en: 'Company name' },
  '회사 (모자)': { zh: '公司（帽子）', ja: '会社（帽子）', en: 'Company (hat)' },
  '회사 · 모자 모양': { zh: '公司 · 帽子款式', ja: '会社・ハットの形', en: 'Companies and hats' },
  '회사 등록': { zh: '登记公司', ja: '会社を登録', en: 'Add a company' },
  '모자 색': { zh: '帽子颜色', ja: '帽子の色', en: 'Hat colour' },
  'API 종류': { zh: 'API 类型', ja: 'APIの種類', en: 'API kind' },
  'API 주소 (Base URL)': { zh: 'API 地址（Base URL）', ja: 'APIアドレス (Base URL)', en: 'API address (Base URL)' },
  '예: DeepSeek': { zh: '例如：DeepSeek', ja: '例: DeepSeek', en: 'e.g. DeepSeek' },
  '예: DeepSeek Chat': { zh: '例如：DeepSeek Chat', ja: '例: DeepSeek Chat', en: 'e.g. DeepSeek Chat' },
  '예: deepseek-chat': { zh: '例如：deepseek-chat', ja: '例: deepseek-chat', en: 'e.g. deepseek-chat' },
  '예: https://api.deepseek.com/v1 · http://localhost:11434/v1': {
    zh: '例如：https://api.deepseek.com/v1 · http://localhost:11434/v1',
    ja: '例: https://api.deepseek.com/v1 · http://localhost:11434/v1',
    en: 'e.g. https://api.deepseek.com/v1 · http://localhost:11434/v1',
  },
  '키는 이 서버의 data 폴더에만 저장되고 화면으로는 다시 보내지 않아요.': {
    zh: '密钥只保存在这台服务器的 data 文件夹里，不会再发回浏览器。',
    ja: 'キーはこのサーバーのdataフォルダーにのみ保存され、ブラウザには再送されません。',
    en: 'Keys are stored only in this server’s data folder and never sent back to the browser.',
  },
  'API 모델 ID': { zh: 'API 模型 ID', ja: 'APIモデルID', en: 'API model ID' },
  '목록 불러오기': { zh: '读取列表', ja: '一覧を読み込む', en: 'Load the list' },
  '불러오는 중…': { zh: '读取中…', ja: '読み込み中…', en: 'Loading…' },
  '등급 (장식)': { zh: '等级（装饰）', ja: 'ランク（装飾）', en: 'Tier (trim)' },
  '화면에 보일 이름': { zh: '画面显示名称', ja: '画面に表示する名前', en: 'Name shown on screen' },
  '입력 단가 ($ / 100만 토큰)': {
    zh: '输入单价（$ / 100 万 token）',
    ja: '入力単価（$ / 100万トークン）',
    en: 'Input price ($ / 1M tokens)',
  },
  '출력 단가 ($ / 100만 토큰)': {
    zh: '输出单价（$ / 100 万 token）',
    ja: '出力単価（$ / 100万トークン）',
    en: 'Output price ($ / 1M tokens)',
  },
  'per 1M tok': { zh: '每 100 万 token', ja: '100万トークンあたり', en: 'per 1M tok' },
  '단가 확인': { zh: '确认单价', ja: '単価を確認', en: 'Check pricing' },
  '모델 · 등급': { zh: '模型 · 等级', ja: 'モデル・ランク', en: 'Models and tiers' },
  '모델 등록': { zh: '登记模型', ja: 'モデルを登録', en: 'Add a model' },
  '편집 · 키': { zh: '编辑 · 密钥', ja: '編集・キー', en: 'Edit and keys' },
  '물어보는 중…': { zh: '询问中…', ja: '問い合わせ中…', en: 'Asking…' },
  'AI에게 물어 채우기': { zh: '让 AI 帮你填', ja: 'AIに埋めてもらう', en: 'Fill in via AI' },
  'AI 추정': { zh: 'AI 推测', ja: 'AI推定', en: 'AI estimate' },
  '참고 가격표': { zh: '参考价格表', ja: '参考価格表', en: 'Reference price list' },
  '이름으로 추정': { zh: '按名称推测', ja: '名前から推定', en: 'Guessed from the name' },
  '값이 다르면 그대로 고쳐서 저장하세요.': {
    zh: '如果数值不同，请直接改正后保存。',
    ja: '数値が異なる場合はそのまま直して保存してください。',
    en: 'If the numbers differ, correct them and save.',
  },
  'AI 실행 방식': { zh: 'AI 执行方式', ja: 'AIの実行方式', en: 'How AI runs' },
  '지금': { zh: '现在', ja: '現在', en: 'Now' },
  'AI 실행 방식을 바꿨어요. 다음 AI 호출부터 적용돼요.': {
    zh: '已更改 AI 执行方式。下次调用 AI 起生效。',
    ja: 'AIの実行方式を変更しました。次のAI呼び出しから適用されます。',
    en: 'AI mode changed. It applies from the next AI call.',
  },
  'API를 부르지 않아요. 비용은 모델 단가로 계산하고, 등급이 높을수록 검토 점수가 올라가요.': {
    zh: '不会调用 API。成本按模型单价计算，等级越高审查分数越高。',
    ja: 'APIは呼びません。コストはモデル単価で計算し、ランクが高いほどレビュー点数が上がります。',
    en: 'No API calls. Cost follows the model price, and a higher tier raises the review score.',
  },
  '직원마다 고른 모델의 회사 API로 호출해요. 회사마다 API 키가 필요해요.': {
    zh: '按每位成员所选模型的厂商 API 调用。每家公司都需要 API 密钥。',
    ja: 'メンバーごとに選んだモデルの会社APIを呼び出します。会社ごとにAPIキーが必要です。',
    en: 'Calls the vendor API of the model each person picked. Every vendor needs an API key.',
  },
  '회사를 등록하면 ': { zh: '登记公司后，', ja: '会社を登録すると', en: 'Once a company is registered, ' },
  '모자 모양과 색': { zh: '帽子款式和颜色', ja: 'ハットの形と色', en: 'the hat shape and colour' },
  '이 정해지고, 그 회사의 모델을 등록하면 ': {
    zh: '就定下来了；登记该公司的模型后，',
    ja: 'が決まり、その会社のモデルを登録すると',
    en: 'are set. Registering one of its models adds ',
  },
  '등급에 따라 장식': { zh: '按等级的装饰', ja: 'ランクに応じた装飾', en: 'trim based on the tier', },
  '이 붙어요. 등록한 모델은 직원 관리 탭에서 직원에게 고를 수 있어요.': {
    zh: '。登记的模型可以在员工管理标签页里分配给成员。',
    ja: 'がつきます。登録したモデルは従業員管理タブでメンバーに選べます。',
    en: '. You can assign registered models to staff on the Staff tab.',
  },
  'API 키 발급': { zh: '获取 API 密钥', ja: 'APIキーを発行', en: 'Get an API key' },
  'API 키 발급(콘솔)': { zh: '获取 API 密钥（控制台）', ja: 'APIキーを発行（コンソール）', en: 'Get an API key (console)' },
  'Ollama 설치': { zh: '安装 Ollama', ja: 'Ollamaをインストール', en: 'Install Ollama' },
  '가격표': { zh: '价格表', ja: '価格表', en: 'Pricing' },
  '사용 내역': { zh: '使用记录', ja: '使用履歴', en: 'Usage history' },
  '모델 목록': { zh: '模型列表', ja: 'モデル一覧', en: 'Model list' },
  '모델 목록·가격표': { zh: '模型列表 · 价格表', ja: 'モデル一覧・価格表', en: 'Model list and pricing' },
  '자주 쓰는 곳': { zh: '常用入口', ja: 'よく使う場所', en: 'Useful links' },
  '삭제': { zh: '删除', ja: '削除', en: 'Delete' },
  '편집': { zh: '编辑', ja: '編集', en: 'Edit' },
  '저장 중…': { zh: '保存中…', ja: '保存中…', en: 'Saving…' },
  '모자 모양': { zh: '帽子款式', ja: 'ハットの形', en: 'Hat shape' },
  '직원별 실제 AI': { zh: '每人真实 AI', ja: 'メンバーごとの実AI', en: 'Real AI per person' },
  '1. 외형 고르기': { zh: '1. 选择外观', ja: '1. 外観を選ぶ', en: '1. Pick a look' },
  '2. 모델 고르기': { zh: '2. 选择模型', ja: '2. モデルを選ぶ', en: '2. Pick a model' },
  '3. 후보 캐릭터 고르기': { zh: '3. 选择候选角色', ja: '3. 候補キャラクターを選ぶ', en: '3. Pick a candidate' },
  '4. 성격 · 일하는 스타일': { zh: '4. 性格 · 工作风格', ja: '4. 性格・働き方', en: '4. Personality and style' },

  // ── 팀 · 업무 유형 ──────────────────────────────────────────
  '과제 조사·분석 보고서': { zh: '课题调查·分析报告', ja: '課題の調査・分析報告', en: 'Research and analysis report' },
  '메일함 정리와 일정 등록': { zh: '整理收件箱并登记日程', ja: '受信トレイの整理と予定登録', en: 'Tidy the inbox and book meetings' },
  '월 AI 예산 배분안': { zh: '月度 AI 预算分配方案', ja: '月次AI予算の配分案', en: 'Monthly AI budget split' },
  '고객 문의 답변 초안': { zh: '客户咨询回复草稿', ja: 'お客様問い合わせの回答下書き', en: 'Reply draft for a customer question' },
  '휴식·문화생활 추천': { zh: '休息·文化生活推荐', ja: '休憩・カルチャーの提案', en: 'Break and culture picks' },
  '평균': { zh: '平均', ja: '平均', en: 'Average' },
  '실패': { zh: '失败', ja: '失敗', en: 'Failed' },
  '검수자가 매긴 점수': { zh: '审查者给的分数', ja: 'レビュー担当者の点数', en: 'Reviewer score' },
  '다시 쓰지 않고 바로 통과한 비율': {
    zh: '未经返工直接通过的比例',
    ja: 'やり直しなしで 바로合格した割合',
    en: 'Passed first time, no rework',
  },
  '통과시킨 결과를 사용자도 승인한 비율': {
    zh: '通过后用户也认可的比例',
    ja: '合格させた結果もユーザーが認めた割合',
    en: 'Results the user also approved',
  },
  '자율 개선': { zh: '自主改进', ja: '自律的改善', en: 'Self-improvement' },
  '자율 개선을 켰어요.': { zh: '已开启自主改进。', ja: '自律的改善をオンにしました。', en: 'Self-improvement is on.' },
  '자율 개선을 켰어요. 비용이 늘지 않는 제안은 바로, 그리고 업무가 끝날 때마다 반영해요.': {
    zh: '已开启自主改进。不增加成本的建议会立即应用，并在每个任务结束时应用。',
    ja: '自律的改善をオンにしました。コストが増えない提案はすぐ反映し、タスクが終わるたびに反映します。',
    en: 'Self-improvement is on. Cost-free suggestions go through right away, and again whenever a task finishes.',
  },
  '자율 개선을 껐어요.': { zh: '已关闭自主改进。', ja: '自律的改善をオフにしました。', en: 'Self-improvement is off.' },
  '성격 변경처럼 비용이 늘지 않는 제안을 알아서 반영해요. 모델 변경은 항상 직접 결정': {
    zh: '像改性格这样不增加成本的建议会自动应用。模型变更始终由你决定',
    ja: '性格変更のようにコストが増えない提案は自動で反映します。モデル変更は常に自分で決めます',
    en: 'Applies cost-free suggestions such as personality changes on its own. Model changes are always yours to decide',
  },
  '아직 반려된 적이 없어요.': { zh: '还没有被驳回过。', ja: 'まだ差戻しを受けたことがありません。', en: 'Nothing has been sent back yet.' },
  '같은 유형의 다음 업무에서 작성자에게 "같은 실수를 피할 것"으로 함께 전달돼요.': {
    zh: '在同类任务中，会把“不要重蹈覆辙”一并告知执行者。',
    ja: '同じ種類の次のタスクで、作成者に「同じミスを避けること」として一緒に伝わります。',
    en: 'The next task of the same kind carries a "do not repeat this" note to whoever writes it.',
  },
  '예: 서연': { zh: '例如：서연', ja: '例: 서연', en: 'e.g. 서연' },
  '대기 중인 업무에서 맡은 단계는 같은 역할의 다른 직원에게 넘어가요.': {
    zh: '排队任务中由他负责的步骤会转交给同职责的其他成员。',
    ja: '待機中のタスクで担当していたステップは、同じ役割の他のメンバーに引き継がれます。',
    en: 'Steps they owned on queued jobs move to someone else in the same role.',
  },
  '"직원별 실제 AI" 방식이면 직원마다 자기 모델 회사의 API로 호출해요. 시뮬레이션에서는 모델 가격으로 비용을 계산하고, 등급이 높을수록 검토 점수가 올라가요.': {
    zh: '采用“每人真实 AI”模式时，每位成员会调用各自模型公司的 API。模拟模式下按模型价格计算成本，等级越高审查分数越高。',
    ja: '「メンバーごとの実AI」方式なら、各メンバーが自分のモデルのAPIを呼び出します。シミュレーションではモデル価格でコストを計算し、ランクが高いほどレビュー点数が上がります。',
    en: 'In "real AI per person" mode each staff member calls its own vendor API. In the simulation, cost follows model price and a higher tier raises the review score.',
  },
  '모델·API 키 등록하러 가기 →': {
    zh: '去登记模型和 API 密钥 →',
    ja: 'モデル・APIキーを登録する →',
    en: 'Register a model and API key →',
  },
  // ── 공유 권한 ──────────────────────────────────────────────
  '보기': { zh: '查看', ja: '閲覧', en: 'View' },
  '업무 처리': { zh: '处理任务', ja: 'タスク対応', en: 'Operate' },
  '사무실 관리': { zh: '管理办公室', ja: 'オフィス管理', en: 'Manage' },
  '사무실, 업무 여정, 보고서를 볼 수만 있어요.': {
    zh: '只能查看办公室、任务流程和报告。',
    ja: 'オフィス・タスクフロー・レポートの閲覧のみできます。',
    en: 'Can only view offices, task journeys, and reports.',
  },
  '업무 등록·여정 설계, 도움 요청 응답, 승인과 수정 요청까지 할 수 있어요.': {
    zh: '可以登记任务、设计流程、回复求助，以及批准和提出修改要求。',
    ja: 'タスク登録・フロー設計、ヘルプへの回答、承認や修正依頼ができます。',
    en: 'Can register tasks, design journeys, answer help requests, approve, and request changes.',
  },
  '업무 처리에 더해 직원 규칙·모델·스킨, 자동 실행, 팀 자료까지 바꿀 수 있어요.': {
    zh: '除任务处理外，还能修改员工规则、模型、皮肤、自动运行和团队资料。',
    ja: 'タスク対応に加えて、员工ルール・モデル・スキン・自動実行・チーム資料を変更できます。',
    en: 'On top of operating tasks, can change staff rules, models, skins, automation, and team data.',
  },

  // ── 업무 여정 단계 ────────────────────────────────────────
  '과제 접수': { zh: '接收课题', ja: '課題受付', en: 'Intake' },
  '자료 수집': { zh: '收集资料', ja: '情報収集', en: 'Research' },
  '검토': { zh: '审查', ja: 'レビュー', en: 'Review' },
  '사용자 승인': { zh: '用户批准', ja: 'ユーザー承認', en: 'User approval' },
  '보고서함': { zh: '报告库', ja: 'レポート庫', en: 'Reports' },
  '메일함 확인': { zh: '查看收件箱', ja: '受信箱を確認', en: 'Check inbox' },
  '분류·요약': { zh: '分类·摘要', ja: '分類・要約', en: 'Sort & summarise' },
  '일정 정리': { zh: '整理日程', ja: '日程整理', en: 'Schedule' },
  '캘린더 등록': { zh: '登记日历', ja: 'カレンダーに登録', en: 'Add to calendar' },
  '요청 접수': { zh: '接收请求', ja: 'リクエスト受付', en: 'Request intake' },
  '비용·성과 수집': { zh: '收集成本·成果', ja: '費用・実績を収集', en: 'Collect cost & results' },
  '예산안 작성': { zh: '编写预算案', ja: '予算案を作成', en: 'Draft budget' },
  '감사 검토': { zh: '审计检查', ja: '監査レビュー', en: 'Audit review' },
  '예산 반영': { zh: '反映预算', ja: '予算反映', en: 'Budget applied' },
  '문의 접수': { zh: '接收咨询', ja: '問い合わせ受付', en: 'Inquiry intake' },
  '분류·긴급도': { zh: '分类·紧急度', ja: '分類・緊急度', en: 'Triage & urgency' },
  '답변 초안': { zh: '回复草稿', ja: '返信の下書き', en: 'Draft reply' },
  '발송 대기함': { zh: '待发送箱', ja: '送信待ち', en: 'Outbox' },
  '관심사 확인': { zh: '确认兴趣', ja: '興味を確認', en: 'Check interests' },
  '추천 탐색': { zh: '探索推荐', ja: 'おすすめを探す', en: 'Find things to do' },
  '추천 카드': { zh: '推荐卡片', ja: 'おすすめカード', en: 'Recommendation card' },
  '추천 보관함': { zh: '推荐收藏', ja: 'おすすめ保存', en: 'Saved picks' },
  '결과 보관': { zh: '结果保存', ja: '結果を保存', en: 'Results saved' },
  '반려': { zh: '驳回', ja: '差戻し', en: 'Rejected' },
  '조건': { zh: '条件', ja: '条件', en: 'condition' },
  '수정 요청': { zh: '修改要求', ja: '修正依頼', en: 'changes requested' },
};

/**
 * Sentences carrying `{placeholder}` holes. Translators may reorder or drop holes,
 * which a plain string lookup could not express.
 */
const TEMPLATES: Record<string, Partial<Record<Language, string>>> = {
  // ── 업무 생성·진행 ──────────────────────────────────────────
  '대기열에 업무 추가': { zh: '已加入队列：{title}', ja: '待機列に追加：{title}', en: 'Queued: {title}' },
  '칠판에 업무 등록': { zh: '已登记任务：{title}', ja: 'ボードに登録：{title}', en: 'Task created: {title}' },
  '업무 시작': { zh: '开始任务：{title}', ja: '開始：{title}', en: 'Started: {title}' },
  '대기 업무 취소': { zh: '已取消排队任务：{title}', ja: '待機タスクを取消：{title}', en: 'Queued task cancelled: {title}' },
  '{who}에게 업무 배정': { zh: '把任务指派给 {who}', ja: '{who}にタスクを割り当て', en: 'Assigned to {who}' },
  '{who} 작업 시작': { zh: '{who} 开始工作', ja: '{who} が作業を開始', en: '{who} started working' },
  '작업 시작 (재시도)': { zh: '{who} 开始工作（第 {attempt} 次）', ja: '{who} が作業を開始（{attempt}回目）', en: '{who} started working (attempt {attempt})' },
  '{who} 도구 시작': { zh: '{who} 启动 {tool}', ja: '{who} が {tool} を開始', en: '{who} started {tool}' },
  '{who} 도구 사용 완료': { zh: '{who} 完成工具调用', ja: '{who} がツール使用を完了', en: '{who} finished using a tool' },
  '업무 완료': { zh: '任务完成', ja: 'タスク完了', en: 'Task completed' },
  '업무 중단': { zh: '任务中止：{reason}', ja: 'タスク中止：{reason}', en: 'Task stopped: {reason}' },

  // ── 승인·도움말 ─────────────────────────────────────────────
  '사용자 승인 요청': { zh: '请求用户批准（预计价值 {value}）', ja: 'ユーザーの承認を要求（推定価値 {value}）', en: 'Asked for approval (estimated value {value})' },
  '사용자 승인': { zh: '用户已批准', ja: 'ユーザーが承認', en: 'User approved' },
  '사용자 수정 요청': { zh: '用户要求修改：{comment}', ja: 'ユーザーの修正要求：{comment}', en: 'Changes requested: {comment}' },
  '{who} 도움 요청': { zh: '{who} 请求帮助：{question}', ja: '{who} がヘルプ依頼：{question}', en: '{who} asked for help: {question}' },
  '사용자가 도움줌': { zh: '用户帮助了 {who}：{answer}', ja: 'ユーザーが {who} を支援：{answer}', en: 'User helped {who}: {answer}' },
  '응답 없이 진행': { zh: '没有回应，{who} 按假设继续：{assumption}', ja: '応答がないため {who} が仮定で進行：{assumption}', en: 'No reply, {who} continued on an assumption: {assumption}' },

  // ── 검수·산출물 ────────────────────────────────────────────
  '{who} 검수 시작': { zh: '{who} 开始审查', ja: '{who} がレビューを開始', en: '{who} started reviewing' },
  '{who} 반려': { zh: '{who} 驳回（{score} 分）：{reason}', ja: '{who} が差戻し（{score}点）：{reason}', en: '{who} rejected it ({score}): {reason}' },
  '{who} 검수 통과': { zh: '{who} 审查通过（{score} 分）', ja: '{who} がレビュー通過（{score}点）', en: '{who} approved it ({score})' },
  '{who} 산출물 생성': { zh: '{who} 生成交付物：{title}', ja: '{who} が成果物を作成：{title}', en: '{who} produced: {title}' },
  '{who} {kind} 디자인 완료': {
    zh: '{who} 完成{kind}设计（草稿 v{version}）',
    ja: '{who} が{kind}デザイン完了（下書き v{version}）',
    en: '{who} finished the {kind} design (draft v{version})',
  },
  '화면 검수 결과': { zh: '· 视觉审阅 {rounds} 次 {result}', ja: '· 画面レビュー {rounds}回 {result}', en: '· visual review {rounds}x {result}' },
  '근거 없는 숫자 제외': { zh: '· 排除无依据数字 {count} 处', ja: '· 根拠のない数値 {count} 件を除外', en: '· dropped {count} unsourced numbers' },
  '검수 통과': { zh: '通过', ja: '合格', en: 'passed' },
  '검수 지적': { zh: '仍有意见', ja: '指摘あり', en: 'changes asked' },

  // ── 업무 여정 ──────────────────────────────────────────────
  '{who} 업무 여정 설계': { zh: '{who} 设计了任务流程（{steps} 步）', ja: '{who} がタスクフローを設計（{steps}ステップ）', en: '{who} planned the journey ({steps} steps)' },
  '업무 여정 수정': { zh: '任务流程已修改（{steps} 步）', ja: 'タスクフローを修正（{steps}ステップ）', en: 'Journey updated ({steps} steps)' },
  '{who} 되돌아감': { zh: '{who} 🔁 {from} → {to}（{count}/{max}）：{reason}', ja: '{who} 🔁 {from} → {to}（{count}/{max}）：{reason}', en: '{who} 🔁 {from} → {to} ({count}/{max}): {reason}' },
  '{who} 일시정지': { zh: '{who} 已暂停', ja: '{who} を一時停止', en: '{who} paused' },
  '{who} 재개': { zh: '{who} 恢复工作', ja: '{who} を再開', en: '{who} resumed' },
  '{who} 개인 규칙 변경': { zh: '{who} 修改了个人规则', ja: '{who} の個人ルールを変更', en: '{who} updated their rules' },
  '{who} 입사': { zh: '{name} 入职', ja: '{name} が入社', en: '{name} joined' },
  '{who} 퇴사': { zh: '{name} 离职', ja: '{name} が退社', en: '{name} left' },
  '{who} 업무 전달': { zh: '{from} → {to}：{label}', ja: '{from} → {to}：{label}', en: '{from} → {to}: {label}' },
  '{who} 업무 맡음': { zh: '用户把任务交给 {who}：{label}', ja: 'ユーザーが {who} にタスクを委任：{label}', en: 'User handed {who} a task: {label}' },

  // ── 비용·예산 ──────────────────────────────────────────────
  '{who} AI 호출 비용': { zh: '{who} AI 调用费用 {amount}（输入 {inputTokens} / 输出 {outputTokens} tokens）', ja: '{who} のAI呼び出し費用 {amount}（入力 {inputTokens} / 出力 {outputTokens} tokens）', en: '{who} spent {amount} on AI calls (in {inputTokens} / out {outputTokens} tokens)' },
  '가치 인정': { zh: '确认价值 {value} / 业务利润 {profit}', ja: '価値認定 {value} / 業務利益 {profit}', en: 'Value {value} / profit {profit}' },
  '월 예산 80% 사용 경고': { zh: '月度预算已用 80% 警告', ja: '月予算80%使用警告', en: 'Monthly budget 80% warning' },
  '월 예산 초과': { zh: '月度预算超支，已停止运行', ja: '月予算超過のため実行停止', en: 'Monthly budget exceeded, stopped' },
  '팀 예산 상한 초과': { zh: '团队预算上限超支，已停止运行', ja: 'チーム上限超過のため実行停止', en: 'Team budget cap exceeded, stopped' },

  // ── 외부 도구 ──────────────────────────────────────────────
  '{who} 승인된 외부 작업 실행': { zh: '{who} {icon} {server} · {tool} 执行已批准的外部操作', ja: '{who} {icon} {server} · {tool} 承認済み外部操作を実行', en: '{who} {icon} {server} · {tool} ran an approved external action' },
  '{who} 도구 호출': { zh: '{who} {icon} {server} · {tool} 调用', ja: '{who} {icon} {server} · {tool} 呼び出し', en: '{who} {icon} {server} · {tool} call' },
  '{who} 결과 수신': { zh: '{who} 收到 {server} · {tool} 结果（{chars} 字）', ja: '{who} が {server} · {tool} の結果を受信（{chars}字）', en: '{who} got the {server} · {tool} result ({chars} chars)' },
  '{who} 실패': { zh: '{who} {server} · {tool} 失败：{reason}', ja: '{who} {server} · {tool} 失敗：{reason}', en: '{who} {server} · {tool} failed: {reason}' },
  '새 메일 도착': { zh: '收到新邮件：{subject}', ja: '新着メール：{subject}', en: 'New mail: {subject}' },
  '새 문의 도착': { zh: '收到新咨询：{subject}', ja: '新着問い合わせ：{subject}', en: 'New inquiry: {subject}' },

  // ── 사무실·공유 ────────────────────────────────────────────
  '사무실 설정 변경': { zh: '办公室设置已更改', ja: 'オフィス設定を変更', en: 'Office settings updated' },
  '사무실 개설': { zh: '办公室已开设', ja: 'オフィスを開設', en: 'Office opened' },
  '사무실 폐쇄': { zh: '办公室已关闭', ja: 'オフィスを閉鎖', en: 'Office closed' },
  '공유 링크 생성': { zh: '已创建共享链接：{name}', ja: '共有リンクを作成：{name}', en: 'Share link created: {name}' },
  '공유 링크 취소': { zh: '已取消共享链接：{name}', ja: '共有リンクを取消：{name}', en: 'Share link revoked: {name}' },
  '구성원 추가': { zh: '已添加成员：{name}', ja: 'メンバーを追加：{name}', en: 'Member added: {name}' },
  '구성원 정보 변경': { zh: '已修改成员信息：{name}', ja: 'メンバー情報を変更：{name}', en: 'Member updated: {name}' },
  '구성원 삭제': { zh: '已删除成员：{name}', ja: 'メンバーを削除：{name}', en: 'Member removed: {name}' },
  '담당자 지정': { zh: '已指定负责人：{name}', ja: '担当者を指定：{name}', en: 'Assignee set: {name}' },
  '담당자 지정 해제': { zh: '已取消负责人', ja: '担当者を解除', en: 'Assignee cleared' },

  // ── 결제 ──────────────────────────────────────────────────
  '플랜 변경': { zh: '套餐变更：{plan}', ja: 'プラン変更：{plan}', en: 'Plan changed: {plan}' },
  '결제 시작': { zh: '开始支付：{plan} {amount}', ja: '決済開始：{plan} {amount}', en: 'Checkout started: {plan} {amount}' },
  '구독 시작': { zh: '订阅开始：{plan} {amount}', ja: 'サブスク開始：{plan} {amount}', en: 'Subscribed: {plan} {amount}' },
  '구독 갱신': { zh: '订阅续期：{plan} {amount}', ja: 'サブスク更新：{plan} {amount}', en: 'Subscription renewed: {plan} {amount}' },
  '결제 실패': { zh: '支付失败', ja: '決済に失敗', en: 'Payment failed' },
  '결제 취소': { zh: '已取消支付', ja: '決済をキャンセル', en: 'Checkout cancelled' },
  '구독 해지 예약': { zh: '已预约取消订阅（{plan}）', ja: 'サブスク解約を予約（{plan}）', en: 'Cancellation scheduled ({plan})' },
  '구독 해지 예약 취소': { zh: '已取消退订预约（{plan}）', ja: '解約予約を取消（{plan}）', en: 'Cancellation undone ({plan})' },

  // ── 개선·보고 ──────────────────────────────────────────────
  '반영 완료': { zh: '已应用：{summary}', ja: '反映完了：{summary}', en: 'Applied: {summary}' },
  '자율 개선': { zh: '自主改进：{reason}', ja: '自律的改善：{reason}', en: 'self-improved: {reason}' },
  '개선 적용': { zh: '已应用改进：{reason}', ja: '改善を適用：{reason}', en: 'improvement applied: {reason}' },
  '플레이북 적용': { zh: '已应用手册「{name}」（{changes} 处变更）', ja: 'プレイブック「{name}」を適用（{changes}件変更）', en: 'Playbook "{name}" applied ({changes} changes)' },
  '모델 관리': { zh: '模型管理 · {summary}', ja: 'モデル管理 · {summary}', en: 'Models · {summary}' },
  '대화 전달': { zh: '💬 {by} 转发对话到 {label}：{author}：{text}', ja: '💬 {by}さんが {label} に会話を転送：{author}：{text}', en: '💬 {by} forwarded to {label}: {author}: {text}' },
  '{who}에게 반영했어요.': { zh: '已应用到 {who}。', ja: '{who} に反映しました。', en: 'Applied to {who}.' },
  '지금은 제안이 없어요. 같은 설정(모델·성격)으로 {n}번 이상 기록이 쌓이면 문제가 보일 때 제안해요.': {
    zh: '目前没有建议。同一设置（模型·性格）累积 {n} 次以上记录后，看出问题就会提出来。',
    ja: '今は提案がありません。同じ設定（モデル・性格）で {n}回以上記録がたまると、問題が見えたときに提案します。',
    en: 'No suggestions yet. Once {n}+ runs share the same setup (model and personality), suggestions appear when a problem shows up.',
  },
  '반려 {n}/{max}': { zh: '驳回 {n}/{max}', ja: '差戻し {n}/{max}', en: 'rejected {n}/{max}' },
  '조건 {n}/{max}': { zh: '条件 {n}/{max}', ja: '条件 {n}/{max}', en: 'condition {n}/{max}' },
  '수정 요청 {n}회': { zh: '修改要求 {n} 次', ja: '修正依頼 {n}回', en: 'changes requested {n}x' },
  '{n}초': { zh: '{n} 秒', ja: '{n}秒', en: '{n}s' },
  '{n}점': { zh: '{n} 分', ja: '{n}点', en: '{n} pts' },
  '현재 직원 {n}명': { zh: '当前成员 {n} 名', ja: '現在のメンバー {n}名', en: '{n} staff now' },
  '{n}건 완료': { zh: '完成 {n} 件', ja: '{n}件完了', en: '{n} done' },
  '{name} API 키': { zh: '{name} API 密钥', ja: '{name} のAPIキー', en: '{name} API key' },
  '{name} API 키를 저장했어요.': { zh: '已保存 {name} 的 API 密钥。', ja: '{name} のAPIキーを保存しました。', en: 'Saved the {name} API key.' },
  '{name} 연결 확인: 쓸 수 있는 모델 {n}개': {
    zh: '{name} 连接确认：可用模型 {n} 个',
    ja: '{name} 接続確認：使えるモデル {n}件',
    en: '{name} connection check: {n} models available',
  },
  '키는 저장했지만 연결 확인에 실패했어요: {msg}': {
    zh: '密钥已保存，但连接确认失败：{msg}',
    ja: 'キーは保存しましたが接続確認に失敗しました：{msg}',
    en: 'The key saved, but the connection check failed: {msg}',
  },
  '연결됐어요. 쓸 수 있는 모델 {n}개를 확인했어요.': {
    zh: '已连接。确认可用模型 {n} 个。',
    ja: '接続できました。使えるモデル {n}件を確認しました。',
    en: 'Connected. Confirmed {n} usable models.',
  },
  '확인된 모델 {n}개': { zh: '已确认的模型 {n} 个', ja: '確認できたモデル {n}件', en: '{n} models found' },
  '{name}에 등록한 API 키를 지울까요?': {
    zh: '要删除 {name} 上登记的 API 密钥吗？',
    ja: '{name}に登録したAPIキーを削除しますか？',
    en: 'Delete the API key registered on {name}?',
  },
  '{name} 정보를 저장했어요.': { zh: '已保存 {name} 的信息。', ja: '{name} の情報を保存しました。', en: 'Saved {name}.' },
  '{name} 회사를 등록했어요. 이제 모델을 등록해 주세요.': {
    zh: '已登记 {name} 公司。现在请登记模型。',
    ja: '{name} を登録しました。次にモデルを登録してください。',
    en: 'Registered {name}. Now add a model.',
  },
  ' 비워 두면 .env의 {env}를 써요.': {
    zh: '留空则使用 .env 中的 {env}。',
    ja: '空欄の場合は .env の {env} を使います。',
    en: ' Leave it blank to use {env} from .env.',
  },
  '모델 {n}개': { zh: '{n} 个模型', ja: 'モデル {n}件', en: '{n} models' },
  '{name}에 등급과 단가를 물어보는 중…': {
    zh: '正在向 {name} 询问等级和单价…',
    ja: '{name} にランクと単価を問い合わせ中…',
    en: 'Asking {name} for the tier and price…',
  },
  '내장 참고값은 ${in} / ${out}예요.': {
    zh: '内置参考值为 ${in} / ${out}。',
    ja: '内蔵の参考値は ${in} / ${out} です。',
    en: 'The built-in reference is ${in} / ${out}.',
  },
  '.env 설정 따르기 (AI_PROVIDER={provider})': {
    zh: '跟随 .env 设置（AI_PROVIDER={provider}）',
    ja: '.env の設定に従う (AI_PROVIDER={provider})',
    en: 'Follow .env (AI_PROVIDER={provider})',
  },
  '{names} 모델을 쓰는 직원이 있는데 API 키가 없어요. 아래에서 키를 등록해 주세요.': {
    zh: '有成员正在使用 {names} 的模型，但没有 API 密钥。请在下方登记密钥。',
    ja: '{names} のモデルを使うメンバーがいますがAPIキーがありません。下でキーを登録してください。',
    en: 'Some staff use {names} models but have no API key. Register the key below.',
  },
  '{name} 회사와 그 회사 모델을 모두 지울까요? 등록한 API 키도 함께 지워져요.': {
    zh: '要删除 {name} 公司及其全部模型吗？登记的 API 密钥也会一并删除。',
    ja: '{name} とその会社のモデルをすべて削除しますか？登録したAPIキーも削除されます。',
    en: 'Delete {name} and all of its models? The registered API key is deleted too.',
  },
  '{name}을(를) 지웠어요.': { zh: '已删除 {name}。', ja: '{name} を削除しました。', en: 'Deleted {name}.' },
  '{name} 모델을 지울까요?': { zh: '要删除 {name} 模型吗？', ja: '{name} モデルを削除しますか？', en: 'Delete the {name} model?' },
  '{name} 모델을 등록했어요. 직원 관리 탭에서 고를 수 있어요.': {
    zh: '已登记 {name} 模型。可以在员工管理标签页里选择。',
    ja: '{name} モデルを登録しました。従業員管理タブで選べます。',
    en: 'Registered the {name} model. Pick it on the Staff tab.',
  },
  '{name}에서 모델 {n}개를 불러왔어요. API 모델 ID 칸에서 고를 수 있어요.': {
    zh: '从 {name} 读取了 {n} 个模型。可以在 API 模型 ID 一栏中选择。',
    ja: '{name} から {n}件のモデルを読み込みました。APIモデルID欄で選べます。',
    en: 'Loaded {n} models from {name}. Choose one in the API model ID field.',
  },
  '{name}을 {role}(으)로 고용했어요. 아래에서 외형과 모델을 골라 주세요.': {
    zh: '已把 {name} 招为{role}。请在下方选择外观和模型。',
    ja: '{name}を{role}として雇用しました。下から外観とモデルを選んでください。',
    en: 'Hired {name} as {role}. Pick a look and a model below.',
  },
  '{name}을 내보낼까요?': { zh: '要让 {name} 离职吗？', ja: '{name}を退職させますか？', en: 'Let {name} go?' },
  '{name}이 퇴사했어요.': { zh: '{name} 已离职。', ja: '{name}が退社しました。', en: '{name} has left.' },
  '지금 일하는 직원을 고르면 외형·모델·이름·규칙을 바꿀 수 있어요. 새 직원을 고용하거나 내보낼 수도 있어요. (사무실당 최대 {n}명)': {
    zh: '选择当前在职的成员即可修改外观、模型、姓名和规则。也可以雇用或让成员离职。（每间办公室最多 {n} 人）',
    ja: '現在働いているメンバーを選ぶと、外観・モデル・名前・ルールを変更できます。新的メンバーを雇用したり退職させたりもできます（1事務所あたり最大{n}名）。',
    en: 'Pick who is working to change their look, model, name, and rules. You can also hire or let someone go. (Up to {n} per office)',
  },
};

function lookup(source: string, language: Language) {
  const direct = CATALOGUE[source]?.[language];
  if (direct !== undefined) return direct;
  // 이 문장에 {placeholder} 가 없으면 템플릿으로 저장돼 있어도 문장처럼 쓸 수 있다.
  // 빈 칸이 있으면 값을 채워야 하므로 t()로는 해석하지 않는다.
  return source.includes('{') ? undefined : TEMPLATES[source]?.[language];
}

function lookupTemplate(source: string, language: Language) {
  return TEMPLATES[source]?.[language];
}

/** Translates `ko` source text, falling back to the source itself when untranslated. */
export function translate(source: string, language: Language): string {
  return lookup(source, language) ?? source;
}

/**
 * Translates a sentence and fills its `{placeholders}`. Unknown placeholders are left
 * untouched so a missing variable is visible instead of silently blank.
 */
export function translateTemplate(source: string, language: Language, vars: Vars): string {
  const template = lookupTemplate(source, language) ?? source;
  return template.replace(PLACEHOLDER, (hole, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? hole : String(value);
  });
}

/**
 * Language for plain helper functions such as `eventLabel()`, which have no access to
 * React context. `LanguageProvider` sets this on every render.
 */
let active: Language = DEFAULT_LANGUAGE;

export const currentLanguage = () => active;

/** Idempotent: called during render, so repeated calls with the same value are harmless. */
export function setActiveLanguage(language: Language) {
  active = language;
}

/** Shorthand for `translate(src, active)`. */
export const t = (source: string) => translate(source, active);

/** Shorthand for `translateTemplate(src, active, vars)`. */
export const tpl = (source: string, vars: Vars) => translateTemplate(source, active, vars);

/** Formats a number in the active language's grouping conventions. */
export const num = (value: number) => value.toLocaleString(localeOf(active));