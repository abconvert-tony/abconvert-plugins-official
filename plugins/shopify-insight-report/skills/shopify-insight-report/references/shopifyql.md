# ShopifyQL query pack

## Contents

- Datasets used
- Baseline (step 3)
- Conversion rate claims (step 3)
- Locate the hour (step 4)
- Segment (step 5)
- Rule the suspect in or out (step 6)
- Field notes
- Running queries

Queries that ran cleanly in past reports. Dates are placeholders from one report; replace them. Field names are the ones the docs listed on 2026-09-16; re-check against `search_docs_chunks` (dataset name + fields) before use, because datasets gain and rename fields between API versions. Docs win over this file.

Syntax reminders: `FROM <dataset> SHOW <metrics> [WHERE ...] [GROUP BY <dims> | TIMESERIES <grain>] SINCE <date> UNTIL <date> [ORDER BY ...] [LIMIT n]`. `TIMESERIES` fills empty periods with zero rows; `GROUP BY day` does not. `UNTIL` is exclusive of the day named. `COMPARE TO previous_period` and `WITH PERCENT_CHANGE` exist but the report computes comparisons itself so the chart can carry the event markers.

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

## Field notes

- `sessions_with_cart_additions`, `sessions_that_reached_checkout`, `sessions_that_completed_checkout` are session counts, not event counts. A session counts once per step no matter how many times it repeats the action.
- `conversion_rate` on `sessions` is completed checkouts over sessions, as a percentage.
- `online_store_visitors` is unique visitors; `sessions` can be higher.
- `total_sales` includes shipping and taxes and subtracts returns; `net_sales` excludes shipping and taxes. Say which one the chart shows.
- `orders` on `sales` includes POS, Shop app, and draft orders; `sales_channel` separates them.
- `web_performance` metrics are p75 of real visitors (CrUX-style), not lab scores. `page_path` is the path without query string. Days with too few loads return no row for that page.
- `human_or_bot_session` exists only on `sessions`; `sales` has no bot dimension.

## Running queries

**Shopify MCP** (preferred when the store is connected): `run-analytics-query` with the query string; `switch-shop` if several stores are connected. Returns a table and a chart preview. Copy the raw rows into `DATA` in the report; do not retype numbers.

**Access token** (a merchant-provided custom app, or any Admin API token): only through `scripts/shopifyql.mjs`. It sends the fixed `shopifyqlQuery` document and nothing else, and it exits before querying if the token has any `write_*` scope. `--check` prints the scopes; `--csv` prints CSV. Set `SHOPIFY_STORE` and `SHOPIFY_ACCESS_TOKEN` in the environment. Reads production data; get the user's go-ahead first.

```
node scripts/shopifyql.mjs --check
node scripts/shopifyql.mjs "FROM sales SHOW orders, total_sales TIMESERIES day SINCE -60d UNTIL today ORDER BY day ASC"
```

The ShopifyQL editor in Shopify Analytics accepts the same strings, which is what makes every query in the report reproducible by the merchant.
