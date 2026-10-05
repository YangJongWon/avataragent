-- Community gallery: themes, flows and playbooks people share. Every version's file is kept as it passed the checks.

CREATE TABLE items (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('theme', 'flow', 'playbook')),
  -- A theme's own id (one owner per id); flows and playbooks get a random one.
  slug            TEXT NOT NULL,
  owner_id        TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL DEFAULT '',
  tags            JSONB NOT NULL DEFAULT '[]',
  license         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'removed')),
  -- Set when reports pile up, so an owner cannot simply publish it again.
  hidden_reason   TEXT,
  verified        BOOLEAN NOT NULL DEFAULT false,
  latest_version  INTEGER NOT NULL DEFAULT 1,
  downloads       INTEGER NOT NULL DEFAULT 0,
  likes           INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, slug)
);
CREATE INDEX items_owner ON items(owner_id);
CREATE INDEX items_list ON items(status, type, updated_at DESC);

CREATE TABLE item_versions (
  item_id      TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  -- What the creator called it (a theme's themeVersion); flows and playbooks use the number.
  label        TEXT NOT NULL,
  file_key     TEXT NOT NULL,
  preview_key  TEXT,
  size         INTEGER NOT NULL,
  sha256       TEXT NOT NULL,
  -- What the detail page shows: characters of a theme, steps of a flow, staff and stats of a playbook.
  details      JSONB NOT NULL DEFAULT '{}',
  warnings     JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, version)
);

CREATE TABLE item_likes (
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, account_id)
);
CREATE INDEX item_likes_recent ON item_likes(created_at);

-- Per item per day, for the total and for "popular lately" (and later the creator ranking).
CREATE TABLE item_downloads (
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, day)
);

CREATE TABLE item_reports (
  item_id      TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  PRIMARY KEY (item_id, account_id)
);
