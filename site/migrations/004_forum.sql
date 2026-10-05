-- Forum and Q&A, reports on posts and comments, and a log of what admins did.

CREATE TABLE posts (
  id                   TEXT PRIMARY KEY,
  category             TEXT NOT NULL CHECK (category IN ('notice', 'question', 'tip', 'idea', 'showcase')),
  author_id            TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  body                 TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'removed')),
  hidden_reason        TEXT,
  pinned               BOOLEAN NOT NULL DEFAULT false,
  -- A question's chosen answer.
  accepted_comment_id  TEXT,
  comment_count        INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at            TIMESTAMPTZ,
  last_activity_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX posts_list ON posts(status, category, last_activity_at DESC);
CREATE INDEX posts_author ON posts(author_id);

CREATE TABLE comments (
  id             TEXT PRIMARY KEY,
  post_id        TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'removed')),
  hidden_reason  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at      TIMESTAMPTZ
);
CREATE INDEX comments_post ON comments(post_id, created_at);
CREATE INDEX comments_author ON comments(author_id);

CREATE TABLE forum_reports (
  target_type  TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id    TEXT NOT NULL,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  PRIMARY KEY (target_type, target_id, account_id)
);

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target      TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_recent ON audit_log(created_at DESC);
