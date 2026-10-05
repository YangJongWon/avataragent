-- Plan sales: a checkout becomes a subscription with one license bound to one install.

CREATE TABLE checkouts (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('plan', 'item')),
  plan         TEXT,
  item_id      TEXT,
  install_id   TEXT,
  -- The install's own checkout id, handed back so it can match the result.
  app_ref      TEXT,
  return_url   TEXT,
  amount_krw   INTEGER NOT NULL,
  provider     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'failed', 'canceled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checkouts_account ON checkouts(account_id);

CREATE TABLE subscriptions (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan                  TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled')),
  provider              TEXT NOT NULL,
  provider_ref          TEXT,
  period_end            TIMESTAMPTZ NOT NULL,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_account ON subscriptions(account_id);

CREATE TABLE licenses (
  id               TEXT PRIMARY KEY,
  subscription_id  TEXT NOT NULL UNIQUE REFERENCES subscriptions(id) ON DELETE CASCADE,
  account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  install_id       TEXT NOT NULL,
  bound_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX licenses_account ON licenses(account_id);

-- Every payment event once: providers retry, and a repeat must change nothing.
CREATE TABLE payments (
  id               TEXT PRIMARY KEY,
  provider         TEXT NOT NULL,
  event_id         TEXT NOT NULL,
  kind             TEXT NOT NULL,
  account_id       TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  subscription_id  TEXT,
  checkout_id      TEXT,
  amount_krw       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
CREATE INDEX payments_account ON payments(account_id);
