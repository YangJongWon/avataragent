import { randomUUID } from 'node:crypto';
import type { Inquiry, Interests, Mail } from '../shared/types.ts';

const dateIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

type MailSeed = Omit<Mail, 'id' | 'receivedAt' | 'processed'>;
type InquirySeed = Omit<Inquiry, 'id' | 'receivedAt' | 'status'>;

const mailPool = (): MailSeed[] => [
  {
    from: '김민지 <minji@partner.example>',
    subject: '다음 주 협업 미팅 일정 제안드립니다',
    body: `안녕하세요. 지난번 말씀드린 협업 건으로 ${dateIn(2)} 오후 2시~3시에 회의실 A에서 미팅 가능하실까요? 어려우시면 편하신 시간 알려주세요.`,
    mockEvent: { title: '파트너 협업 미팅 (김민지)', date: dateIn(2), start: '14:00', end: '15:00', location: '회의실 A' },
  },
  {
    from: '채용팀 <recruit@company.example>',
    subject: '[면접] 백엔드 개발자 1차 면접 확정 안내',
    body: `지원자 박서준님 1차 면접이 ${dateIn(3)} 오전 10시 30분~11시 30분, 온라인(화상)으로 확정되었습니다. 면접관으로 참석 부탁드립니다.`,
    mockEvent: { title: '백엔드 1차 면접 (박서준)', date: dateIn(3), start: '10:30', end: '11:30', location: '온라인 화상' },
  },
  {
    from: '쇼핑몰 뉴스레터 <news@shop.example>',
    subject: '🔥 이번 주 단 3일! 최대 70% 할인',
    body: '회원님만을 위한 특별 할인 쿠폰이 도착했습니다. 지금 바로 확인하세요!',
  },
  {
    from: '이도현 <dohyun@company.example>',
    subject: '연차 사용 신청 (금요일)',
    body: `팀장님, ${dateIn(5)} 금요일 하루 연차 사용 신청드립니다. 인수인계는 목요일까지 마무리하겠습니다.`,
  },
  {
    from: '교육센터 <edu@company.example>',
    subject: '정보보안 의무 교육 안내',
    body: `전 직원 정보보안 의무 교육이 ${dateIn(6)} 오후 4시~5시 대강당에서 진행됩니다. 필참 부탁드립니다.`,
    mockEvent: { title: '정보보안 의무 교육', date: dateIn(6), start: '16:00', end: '17:00', location: '대강당' },
  },
  {
    from: '최유나 <yuna@client.example>',
    subject: '견적서 회신 요청',
    body: '지난주 보내주신 견적서 관련해서 수량 조정이 가능한지 이번 주 안에 회신 부탁드립니다.',
  },
  {
    from: '대표실 <ceo-office@company.example>',
    subject: '월간 전체 회의 공지',
    body: `${dateIn(4)} 오전 9시~10시 월간 전체 회의가 3층 라운지에서 열립니다.`,
    mockEvent: { title: '월간 전체 회의', date: dateIn(4), start: '09:00', end: '10:00', location: '3층 라운지' },
  },
];

const inquiryPool = (): InquirySeed[] => [
  {
    customer: '정하늘',
    subject: '주문한 상품이 아직 안 왔어요',
    body: '5일 전에 주문했는데 아직 배송 준비중으로 나와요. 언제 받을 수 있나요? 주문번호 A-10293입니다.',
    mockCategory: '배송',
  },
  {
    customer: '오세훈',
    subject: '환불 가능한가요?',
    body: '사이즈가 맞지 않아서 환불하고 싶어요. 포장은 뜯었는데 착용은 안 했습니다.',
    mockCategory: '환불',
  },
  {
    customer: '윤아름',
    subject: '앱에서 로그인이 안 됩니다',
    body: '어제 업데이트 이후로 로그인 버튼을 누르면 앱이 꺼져요. 급하게 써야 하는데 방법이 있을까요?',
    mockCategory: '오류',
  },
  {
    customer: '한지민',
    subject: '직원분 너무 친절했어요',
    body: '지난번 상담해주신 분 덕분에 문제를 잘 해결했어요. 감사 인사 전해주세요!',
    mockCategory: '칭찬',
  },
  {
    customer: '서민호',
    subject: '기능 사용법 문의',
    body: '여러 개 파일을 한 번에 올리는 방법이 있나요? 하나씩 올리려니 너무 오래 걸려요.',
    mockCategory: '사용법',
  },
];

export function initialMails(): Mail[] {
  return mailPool()
    .slice(0, 5)
    .map((m, i) => ({ ...m, id: `mail_${randomUUID().slice(0, 8)}`, receivedAt: minutesAgo(90 - i * 15), processed: false }));
}

export function initialInquiries(): Inquiry[] {
  return inquiryPool()
    .slice(0, 3)
    .map((q, i) => ({ ...q, id: `inq_${randomUUID().slice(0, 8)}`, receivedAt: minutesAgo(60 - i * 12), status: 'new' }));
}

export function nextMail(existing: Mail[]): Mail {
  const pool = mailPool();
  const unused = pool.filter((m) => !existing.some((e) => e.subject === m.subject));
  const pick = unused[0] ?? pool[Math.floor(Math.random() * pool.length)];
  return { ...pick, id: `mail_${randomUUID().slice(0, 8)}`, receivedAt: new Date().toISOString(), processed: false };
}

export function nextInquiry(existing: Inquiry[]): Inquiry {
  const pool = inquiryPool();
  const unused = pool.filter((q) => !existing.some((e) => e.subject === q.subject));
  const pick = unused[0] ?? pool[Math.floor(Math.random() * pool.length)];
  return { ...pick, id: `inq_${randomUUID().slice(0, 8)}`, receivedAt: new Date().toISOString(), status: 'new' };
}

export const defaultInterests = (): Interests => ({
  keywords: ['재즈', '캠핑', '일본 여행'],
  region: '서울',
  note: '주말 오후에 여유가 있고, 혼자 가볍게 즐길 수 있는 것을 좋아함',
});
