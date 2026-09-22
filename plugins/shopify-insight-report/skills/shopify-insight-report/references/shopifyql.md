# ShopifyQL query pack

## Contents

- Official documentation (read these, not a paraphrase)
- Datasets used
- Baseline (step 3)
- Conversion rate claims (step 3)
- Locate the hour (step 4)
- Segment (step 5)
- Rule the suspect in or out (step 6)
- Observed behaviour the docs don't state
- Running queries (MCP, token path and its read-only guarantees, passing the token, manual export)

## Official documentation

Shopify documents every dataset, field, and clause. Read the official page for anything not covered by a query below; do not guess a field name. Append `.md` to any shopify.dev URL to get the page as plain markdown with the API version in its frontmatter.

| What | Official page |
|---|---|
| Syntax overview | https://shopify.dev/docs/api/shopifyql/latest/syntax.md |
| FROM and SHOW | https://shopify.dev/docs/api/shopifyql/latest/syntax/from-and-show.md |
| WHERE | https://shopify.dev/docs/api/shopifyql/latest/syntax/where.md |
| GROUP BY | https://shopify.dev/docs/api/shopifyql/latest/syntax/group-by.md |
| TIMESERIES | https://shopify.dev/docs/api/shopifyql/latest/syntax/timeseries.md |
| SINCE, UNTIL, DURING | https://shopify.dev/docs/api/shopifyql/latest/syntax/since-until-during.md |
| ORDER BY, LIMIT, HAVING | https://shopify.dev/docs/api/shopifyql/latest/syntax/order-by.md, .../limit.md, .../having.md |
| COMPARE TO, WITH | https://shopify.dev/docs/api/shopifyql/latest/syntax/compare-to.md, .../with.md |
| All datasets | https://shopify.dev/docs/api/shopifyql/latest/schemas.md |
| `sales` fields | https://shopify.dev/docs/api/shopifyql/latest/schemas/sales_revenue/sales.md |
| `discounts` fields | https://shopify.dev/docs/api/shopifyql/latest/schemas/sales_revenue/discounts.md |
| `sessions` fields | https://shopify.dev/docs/api/shopifyql/latest/schemas/sessions_and_behavior/sessions.md |
| `web_performance` fields | https://shopify.dev/docs/api/shopifyql/latest/schemas/sessions_and_behavior/web_performance.md |

Three ways to read them, pick whichever the client has: a web fetch tool on the URL above; a Shopify docs MCP tool (Shopify's own connector exposes `search_docs_chunks`); or `python3 scripts/fetch-docs.py`, which downloads all of the pages above into `references/shopifyql-docs/` for offline reading. That folder is not committed, since the pages are Shopify's; each user fetches their own copy.

The queries below ran cleanly on a real store; dates are placeholders from one report. If a query and the docs disagree, the docs win.

## Datasets used

| Dataset | What it answers | Grain that works |
|---|---|---|
| `sales` | Orders, revenue, AOV, first-time vs returning, by channel and product | day, hour |
| `sessions` | Traffic and the four-step funnel, by referrer, device, country, landing page | day, hour |
| `web_performance` | Real-visitor Core Web Vitals per page and device (lags about 2 days) | day |

## Baseline (step 3)

```
FROM sales
  SHOW total_sales, net_sales, orders, average_order_value, orders_first_time, orders_returning
  TIMESERIES day SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC
```

```
FROM sessions
  SHOW sessions, online_store_visitors, pageviews, bounce_rate,
       sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate
  WHERE human_or_bot_session = 'human'
  TIMESERIES day SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC
```

## Conversion rate claims (step 3)

Split the ratio before chasing it. Sessions and orders on one chart, then CVR with and without the bot filter, because the merchant's admin number may include what the filter removes.

```
FROM sessions
  SHOW sessions, sessions_that_completed_checkout, conversion_rate
  TIMESERIES day SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC
```

Traffic quality when sessions rose:

```
FROM sessions
  SHOW sessions, bounce_rate, sessions_with_cart_additions, sessions_that_completed_checkout
  WHERE human_or_bot_session = 'human'
  GROUP BY day, referrer_source SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC LIMIT 3000
```

```
FROM sessions
  SHOW sessions, bounce_rate, sessions_that_completed_checkout
  WHERE human_or_bot_session = 'human'
  GROUP BY landing_page_path SINCE 2026-08-18 UNTIL 2026-09-17 ORDER BY sessions DESC LIMIT 25
```

Discounts and promotions:

```
FROM sales
  SHOW orders, gross_sales, discounts, net_sales, average_order_value
  TIMESERIES day SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC
```

## Locate the hour (step 4)

Rows come back in UTC. Shift to store-local before binning.

```
FROM sessions
  SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout
  WHERE human_or_bot_session = 'human'
  TIMESERIES hour SINCE 2026-09-09 UNTIL 2026-09-13 ORDER BY hour ASC
```

## Segment (step 5)

Always add `LIMIT`; 3000 covers 60 days by a dimension with up to 50 values.

```
FROM sales
  SHOW total_sales, orders
  GROUP BY day, referring_channel SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC LIMIT 3000
```

```
FROM sales
  SHOW orders, total_sales, average_order_value
  GROUP BY day, sales_channel SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC LIMIT 3000
```

```
FROM sessions
  SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout
  WHERE human_or_bot_session = 'human'
  GROUP BY day, referrer_source SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC LIMIT 3000
```

Swap the dimension for `session_device_type`, `session_country`, `landing_page_path`, `utm_campaign`, or `referrer_name` as the question needs. `sessions` uses `referrer_*`; `sales` uses `referring_channel` and `order_referrer_*`. They are not the same taxonomy, so do not join them by value.

## Rule the suspect in or out (step 6)

Storewide:

```
FROM web_performance
  SHOW page_loads, lcp_p75_ms, fcp_p75_ms, ttfb_p75_ms, p75_cls, inp_p75_ms
  TIMESERIES day SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC
```

Touched page (a tested or edited page), by device:

```
FROM web_performance
  SHOW page_loads, lcp_p50_ms, lcp_p75_ms, lcp_p90_ms, fcp_p75_ms, ttfb_p75_ms, p75_cls
  WHERE page_path = '/products/<handle>'
  GROUP BY day, device_type SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC LIMIT 3000
```

Changed products (price change, price test, stockout, launch):

```
FROM sales
  SHOW orders, net_sales, average_order_value
  WHERE product_id = '<gid numeric id>'
  TIMESERIES day SINCE 2026-08-01 UNTIL 2026-09-17 ORDER BY day ASC
```

## Observed behaviour the docs don't state

Everything about what a field means is in the official pages above. These are things the pages don't say, seen on real stores:

- `TIMESERIES hour` rows come back in UTC through the API even though day rows are store-local. Shift before binning.
- The current day is a partial row. Keep it out of averages and label it.
- `web_performance` lags about two days; the last two days are missing rows, not zeros.
- `GROUP BY day, <dimension>` without an explicit `LIMIT` cuts the tail silently. 3000 covers 60 days by a dimension with up to 50 values.
- `web_performance` returns no row for a page on days with too few loads, rather than a row with nulls.
- `sessions_that_reached_checkout / sessions_with_cart_additions` can exceed 1 (saved carts, Buy it now, abandoned-checkout email links). Present it as a before-and-after signal, not a rate.
- `referrer_*` on `sessions` and `referring_channel` / `order_referrer_*` on `sales` are different taxonomies; do not join them by value.
- The report computes its own comparisons instead of using `COMPARE TO` or `WITH PERCENT_CHANGE`, so every chart can carry the event markers on one axis.

## Running queries

Three paths, in order of how little setup they need. All three read production analytics; get the user's go-ahead before the first query.

**1. A Shopify MCP is connected.** Use its analytics query tool with the query string (in Shopify's own MCP it is `run-analytics-query`; switch store first if several are connected). Copy the raw rows into `DATA` in the report; do not retype numbers.

**2. An access token** (a merchant-issued custom app with `read_reports` only): only through the bundled script, `scripts/shopifyql.py` (standard library) or `scripts/shopifyql.mjs` (Node 18+), which take the same flags. `--check` prints the scopes; `--shop` prints name, timezone, and currency; `--csv` prints CSV. Set `SHOPIFY_STORE` and `SHOPIFY_ACCESS_TOKEN` in the environment.

```
python3 scripts/shopifyql.py --check
python3 scripts/shopifyql.py "FROM sales SHOW orders, total_sales TIMESERIES day SINCE -60d UNTIL today ORDER BY day ASC"
```

**3. Manual export.** The merchant opens Shopify Analytics, Reports, New exploration, switches to ShopifyQL, pastes a query, and exports the CSV. Send the queries with dates filled in and in method order (baseline first, then funnel, then hourly around the break, then segments), and ask for one CSV per query. Tell them the file names to use so the rows land in the right `DATA` array.

### Read-only by construction (token path)

With a token, the skill only ever queries. It never runs a mutation, and that is enforced rather than promised:

- **The token cannot write.** Ask the merchant for a custom app with `read_reports` only (Settings, Apps and sales channels, Develop apps). Shopify rejects any mutation from a token without a `write_*` scope, whatever the caller sends.
- **The script cannot send one.** Both scripts send only three fixed GraphQL documents (access scopes, shop info, `shopifyqlQuery`) and pass the ShopifyQL string as a variable, so no input can become a mutation. Before the first query they read the token's scopes and exit if any `write_*` scope is present, because a token that can write is the wrong token for an analytics job. Run `--check` first and show the merchant the scope list.
- **No raw GraphQL from the shell.** Never write a `curl` or `fetch` against `/admin/api/` yourself; every query goes through a script. In Claude Code, the plugin also ships a hook that blocks any shell command carrying a mutation to an Admin API, as a backstop; other clients rely on the first two layers, which are the strong ones.

The token lives in the environment and is set by the merchant or the user, never pasted into chat, a file, or the report.

### Passing the token

The rule is that no command the agent writes and no output it reads ever contains the secret. In order of preference:

1. **Let the agency create the app.** If the merchant grants the agency's collaborator account "Develop apps", the agency creates the `read_reports`-only custom app in its own browser and the token never travels. Otherwise the merchant shares it through a password manager, never email or chat.
2. **A lookup command, not a value.** Set `SHOPIFY_ACCESS_TOKEN_CMD` to a command that prints the token and the script runs it itself: `op read 'op://Clients/Acme/shopify-token'` (1Password), `security find-generic-password -s shopify-token -w` (macOS Keychain), `pass show clients/acme/shopify`. The transcript shows the lookup, never the token.
3. **Export before starting the agent.** `export SHOPIFY_ACCESS_TOKEN=...` in your own terminal, then start `claude` or `codex` from that shell. Child processes inherit it; the agent never sees the value; it dies with the terminal.

Never paste the token into the conversation, a repo, a `.env` inside a repo, or Claude Code's settings file, and never `echo` or `printenv` it. The scripts never print it. ChatGPT has no shell and no outbound network, so the token path does not apply there; use the connector or the CSV path.


The ShopifyQL editor in Shopify Analytics accepts the same strings, which is what makes every query in the report reproducible by the merchant.
