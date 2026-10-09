/**
 * Ordered SQL migrations. Append only: never edit a migration that has shipped.
 *
 * Conventions: addresses are lowercase text, times are unix seconds (bigint),
 * token amounts are numeric(78,0) so any uint256 fits.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'init',
    sql: /* sql */ `
      CREATE TABLE launches (
        id                text PRIMARY KEY,
        token             text NOT NULL,
        creator           text NOT NULL,
        lane              text NOT NULL CHECK (lane IN ('meme','art','utility','rwa','vibecoded')),
        pair_class        text NOT NULL CHECK (pair_class IN ('eth','stock','other')),
        pair_token        text,
        tax_bps           integer NOT NULL DEFAULT 0,
        created_at        bigint NOT NULL,
        graduated_at      bigint,
        has_product_links boolean NOT NULL DEFAULT false,
        flagged_rug       boolean NOT NULL DEFAULT false
      );
      CREATE INDEX launches_creator_idx ON launches (creator);

      CREATE TABLE trades (
        tx_hash      text NOT NULL,
        log_index    integer NOT NULL,
        launch_id    text NOT NULL REFERENCES launches(id),
        wallet       text NOT NULL,
        side         text NOT NULL CHECK (side IN ('buy','sell')),
        token_amount numeric(78,0) NOT NULL,
        volume_usd   double precision NOT NULL DEFAULT 0,
        ts           bigint NOT NULL,
        PRIMARY KEY (tx_hash, log_index)
      );
      CREATE INDEX trades_wallet_ts_idx ON trades (wallet, ts);
      CREATE INDEX trades_launch_idx ON trades (launch_id);

      CREATE TABLE wallet_funding (
        wallet text PRIMARY KEY,
        funder text NOT NULL,
        ts     bigint NOT NULL
      );
      CREATE INDEX wallet_funding_funder_idx ON wallet_funding (funder, ts);

      CREATE TABLE scout_drops (
        launch_id   text NOT NULL REFERENCES launches(id),
        wallet      text NOT NULL,
        amount      numeric(78,0) NOT NULL,
        received_at bigint NOT NULL,
        PRIMARY KEY (launch_id, wallet)
      );
      CREATE INDEX scout_drops_wallet_idx ON scout_drops (wallet);

      CREATE TABLE drop_outcomes (
        launch_id text NOT NULL,
        wallet    text NOT NULL,
        "window"  text NOT NULL CHECK ("window" IN ('h1','h24','d7','d30')),
        sold_bps  integer NOT NULL CHECK (sold_bps BETWEEN 0 AND 10000),
        PRIMARY KEY (launch_id, wallet, "window"),
        FOREIGN KEY (launch_id, wallet) REFERENCES scout_drops (launch_id, wallet)
      );

      CREATE TABLE snapshots (
        id       text PRIMARY KEY,
        token    text NOT NULL,
        chain    text NOT NULL,
        block    numeric(78,0) NOT NULL,
        taken_at bigint NOT NULL
      );
      CREATE TABLE snapshot_balances (
        snapshot_id text NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
        wallet      text NOT NULL,
        balance     numeric(78,0) NOT NULL,
        PRIMARY KEY (snapshot_id, wallet)
      );

      CREATE TABLE vibers (
        token_id        text PRIMARY KEY,
        wallet          text NOT NULL,
        level           integer NOT NULL DEFAULT 0,
        last_charged_at bigint
      );
      CREATE INDEX vibers_wallet_idx ON vibers (wallet);

      CREATE TABLE guild_members (
        guild_id     text NOT NULL,
        wallet       text NOT NULL,
        good_standing boolean NOT NULL DEFAULT true,
        PRIMARY KEY (guild_id, wallet)
      );
      CREATE INDEX guild_members_wallet_idx ON guild_members (wallet);

      CREATE TABLE profiles (
        wallet      text PRIMARY KEY,
        opted_in_at bigint NOT NULL,
        message     text,
        signature   text
      );

      CREATE TABLE wallet_links (
        wallet         text PRIMARY KEY,
        primary_wallet text NOT NULL,
        linked_at      bigint NOT NULL,
        signature      text,
        CHECK (wallet <> primary_wallet)
      );

      CREATE TABLE sim_labels (
        wallet  text PRIMARY KEY,
        persona text NOT NULL,
        farm_id text
      );

      CREATE TABLE source_cursors (
        source     text PRIMARY KEY,
        cursor     jsonb NOT NULL,
        updated_at bigint NOT NULL
      );
    `,
  },
  {
    id: 2,
    name: 'web',
    sql: /* sql */ `
      CREATE TABLE auth_nonces (
        nonce      text PRIMARY KEY,
        created_at bigint NOT NULL,
        used_at    bigint
      );

      -- Both wallets sign a link. Existing rows (simulated) have no signatures.
      ALTER TABLE wallet_links ADD COLUMN primary_signature text;

      -- Content-addressed: the id is the policy hash.
      CREATE TABLE policies (
        hash       text PRIMARY KEY,
        policy     jsonb NOT NULL,
        created_at bigint NOT NULL
      );

      -- One locked policy per launch, signed by the launch creator.
      CREATE TABLE policy_locks (
        launch_id   text PRIMARY KEY REFERENCES launches(id),
        policy_hash text NOT NULL REFERENCES policies(hash),
        creator     text NOT NULL,
        message     text NOT NULL,
        signature   text NOT NULL,
        locked_at   bigint NOT NULL
      );
    `,
  },
  {
    id: 3,
    name: 'aftermath',
    sql: /* sql */ `
      -- Transfers of launched tokens. The aftermath job measures drops from these.
      CREATE TABLE transfers (
        token     text NOT NULL,
        tx_hash   text NOT NULL,
        log_index integer NOT NULL,
        "from"    text NOT NULL,
        "to"      text NOT NULL,
        amount    numeric(78,0) NOT NULL,
        ts        bigint NOT NULL,
        PRIMARY KEY (tx_hash, log_index)
      );
      CREATE INDEX transfers_token_from_idx ON transfers (token, "from", ts);
      CREATE INDEX transfers_token_to_idx ON transfers (token, "to", ts);
      CREATE INDEX transfers_ts_idx ON transfers (ts);

      -- Lockers / staking vaults: moving tokens there is not selling.
      CREATE TABLE hold_contracts (
        address text PRIMARY KEY,
        label   text NOT NULL
      );

      ALTER TABLE drop_outcomes ADD COLUMN measured_at bigint;
    `,
  },
  {
    id: 4,
    name: 'onchain_drops',
    sql: /* sql */ `
      -- ScoutDrop contract drops, as read from chain events.
      CREATE TABLE onchain_drops (
        contract    text NOT NULL,
        drop_id     numeric(78,0) NOT NULL,
        token       text NOT NULL,
        creator     text NOT NULL,
        launch_id   text REFERENCES launches(id),
        merkle_root text NOT NULL,
        policy_hash text NOT NULL,
        total       numeric(78,0) NOT NULL,
        deadline    bigint NOT NULL,
        sink        text NOT NULL,
        created_at  bigint NOT NULL,
        tx_hash     text NOT NULL,
        claimed     numeric(78,0) NOT NULL DEFAULT 0,
        swept_at    bigint,
        PRIMARY KEY (contract, drop_id)
      );
      CREATE INDEX onchain_drops_launch_idx ON onchain_drops (launch_id);
      CREATE INDEX onchain_drops_token_idx ON onchain_drops (token);
    `,
  },
  {
    id: 5,
    name: 'vibevibe_live',
    sql: `
      -- Real vibe/vibe launches read from Robinhood Chain testnet. Each also has a row in launches
      -- (id 'vv-<launch number>'), so scoring treats them like any other launch.
      CREATE TABLE vv_launches (
        launch_id  text PRIMARY KEY REFERENCES launches(id),
        number     bigint NOT NULL,
        pool       text NOT NULL UNIQUE,
        name       text NOT NULL,
        symbol     text NOT NULL,
        uri        text NOT NULL,
        block      bigint NOT NULL,
        tx_hash    text NOT NULL
      );
      CREATE INDEX vv_launches_number_idx ON vv_launches (number);
    `,
  },
];
