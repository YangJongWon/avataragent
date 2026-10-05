-- Accounts and sign-in. Everything else on the site hangs off accounts.

CREATE TABLE accounts (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT '',
  avatar_url  TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per way of signing in: a verified email, a Google account, a GitHub account.
CREATE TABLE auth_identities (
  provider    TEXT NOT NULL CHECK (provider IN ('email', 'google', 'github')),
  subject     TEXT NOT NULL,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX auth_identities_account ON auth_identities(account_id);

-- Only hashes are stored: a leaked table cannot be replayed as cookies or links.
CREATE TABLE sessions (
  id_hash     TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_account ON sessions(account_id);

CREATE TABLE magic_links (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  next_path   TEXT NOT NULL DEFAULT '/',
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX magic_links_email ON magic_links(email);

-- Public face of an account in the community: a unique handle for /u/<handle>.
CREATE TABLE profiles (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  handle      TEXT NOT NULL UNIQUE,
  bio         TEXT NOT NULL DEFAULT '',
  links       JSONB NOT NULL DEFAULT '[]'
);
