# 프로젝트 사이트

AI 에이전트 오피스의 공개 사이트입니다. 소개·가격·설치·문서와 커뮤니티(테마·플로우·플레이북 공유), 플랜 판매(라이선스 발급)를 맡습니다. 각 회사가 설치해 쓰는 앱(`server/`, `web/`)과는 따로 실행되고, 검증 코드 같은 공용 코드는 루트 `shared/`를 함께 씁니다.

## 실행

```bash
npm install
npm run site:dev     # 사이트 서버(:8800) + 화면(:5180)
```

브라우저에서 http://localhost:5180 을 엽니다. DB를 따로 준비하지 않으면 `site-data/` 폴더에 내장 PostgreSQL(PGlite)이 만들어지고, 처음 켤 때 `site/migrations`가 적용됩니다. 로그인 메일은 서버 콘솔에 링크로 찍힙니다.

배포용 빌드와 실행:

```bash
npm run site:build   # dist/site 에 화면을 만든다
npm run site:start   # 서버가 dist/site 를 함께 서빙한다
```

## 설정 (`site/.env` 또는 환경 변수)

| 변수 | 설명 |
| --- | --- |
| `SITE_PORT` | 서버 포트. 기본 8800 |
| `SITE_PUBLIC_URL` | 사람들이 접속하는 주소. 메일 링크와 OAuth 돌아올 주소에 쓰입니다. 기본 `http://localhost:5180` |
| `SITE_DATABASE_URL` | PostgreSQL 주소(예: Neon). 비우면 PGlite |
| `SITE_DATA_DIR` | PGlite 폴더. 기본 `site-data` |
| `SITE_SECRET` | 로그인 중 쓰는 짧은 쿠키 서명 키. 운영에서는 꼭 정하세요(없으면 켤 때마다 바뀜) |
| `SITE_ADMIN_EMAILS` | 관리자로 둘 메일 주소(쉼표로 구분) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 구글 로그인. 승인된 리디렉션 URI: `<SITE_PUBLIC_URL>/api/auth/google/callback` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub 로그인. Callback URL: `<SITE_PUBLIC_URL>/api/auth/github/callback` |
| `SITE_MAIL` | `console`(기본) 또는 `resend` |
| `RESEND_API_KEY`, `SITE_MAIL_FROM` | `SITE_MAIL=resend`일 때 |

| `SITE_LICENSE_KID`, `SITE_LICENSE_PRIVATE_KEY` | 플랜 라이선스 서명 키. `node --experimental-strip-types scripts/license-keygen.ts`로 만듭니다. 비우면 개발용 키를 `SITE_DATA_DIR/license-key.json`에 만들어 씁니다 |

이 저장소는 공개(AGPL)이므로 비밀값은 코드나 커밋에 넣지 말고 환경 변수로만 넣습니다.

## 플랜 판매 (라이선스)

1. 앱(`BILLING_PROVIDER=site`, `SITE_URL=<사이트 주소>`)의 플랜·구성원 화면에서 플랜을 고르면 사이트 `/checkout`으로 옵니다. 주소에 플랜, 설치 ID, 돌아갈 앱 주소가 담겨 있습니다.
2. 로그인하고 결제하면 구독과 라이선스(설치 하나에 묶임)가 생기고, 브라우저가 앱의 `/billing/return?license=…`로 돌아가 바로 적용됩니다. 앱에 다시 닿지 못하면 내 계정에서 키를 복사해 앱에 붙여 넣습니다.
3. 앱은 결제 기간이 끝나기 3일 전부터 `POST /v1/licenses/refresh`로 새 라이선스를 받아 갱신합니다. 사이트가 앱을 부르지 않으므로 앱에 공개 주소가 없어도 됩니다.
4. 해지·재개·다른 설치로 옮기기는 사이트의 내 계정에서 합니다.

결제사는 `site/server/payments.ts`의 `PaymentProvider` 뒤에 있습니다. 지금은 모의 결제(돈이 나가지 않는 시험 화면)이고, 실결제사(토스페이먼츠, Paddle 등)는 같은 인터페이스로 붙입니다.

정식 운영 전에 `scripts/license-keygen.ts`로 키를 만들어 개인키는 사이트 비밀값에, 공개키는 앱의 `server/license-keys.ts`에 넣습니다. 로컬에서 시험할 때는 사이트 시작 로그에 찍히는 `LICENSE_PUBLIC_KEYS=…` 줄을 앱 `.env`에 넣으면 됩니다.

## 구조

```
site/
  migrations/   SQL 마이그레이션(이름 순서로 한 번씩 적용)
  server/       Express API: 로그인(매직링크·구글·GitHub), 플랜 판매·라이선스, 문서
  web/          React 화면(소개·가격·설치·문서·로그인·결제·내 계정)
```

전체 설계와 다음 단계(라이선스·커뮤니티·게시판·유료 테마)는 `docs/ARCHITECTURE_DECISIONS.md`와 개발 현황 문서를 참고하세요.
