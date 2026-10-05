-- Paid themes: a price on the item, purchases that unlock downloads, and the creator ledger.

ALTER TABLE items ADD COLUMN price_krw INTEGER NOT NULL DEFAULT 0 CHECK (price_krw >= 0);

CREATE TABLE purchases (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  creator_id    TEXT NOT NULL REFERENCES accounts(id),
  checkout_id   TEXT NOT NULL UNIQUE,
  provider      TEXT NOT NULL,
  provider_ref  TEXT,
  amount_krw    INTEGER NOT NULL,
  fee_krw       INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  refunded_at   TIMESTAMPTZ
);
CREATE INDEX purchases_account ON purchases(account_id);
CREATE INDEX purchases_item ON purchases(item_id);
-- One live purchase per person per item.
CREATE UNIQUE INDEX purchases_once ON purchases(account_id, item_id) WHERE status = 'paid';

-- Money owed to creators, one signed row per movement: + sale, - fee, - refund, + fee back, - payout.
-- A creator's balance is the sum of their rows.
CREATE TABLE ledger (
  id           BIGSERIAL PRIMARY KEY,
  creator_id   TEXT NOT NULL REFERENCES accounts(id),
  kind         TEXT NOT NULL CHECK (kind IN ('sale', 'fee', 'refund', 'fee_refund', 'payout')),
  amount_krw   INTEGER NOT NULL,
  purchase_id  TEXT REFERENCES purchases(id),
  note         TEXT NOT NULL DEFAULT '',
  actor_id     TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_creator ON ledger(creator_id, created_at DESC);
