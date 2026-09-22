---
name: shopify-insight-report
description: Builds a merchant-facing insight report from a store's own Shopify analytics (ShopifyQL), with the events that might explain a change marked on every chart, and delivers it as an HTML page the merchant can re-run query by query. Use whenever a merchant, prospect, or teammate says conversion, CVR, sales, AOV, orders, or traffic dropped or changed on a Shopify store and they can't say why; whenever someone asks if a specific change (a theme publish, app install, checkout, shipping, payment, price, discount, campaign, migration, or A/B test) hurt the store; and whenever someone wants a trend, anomaly, or "what happened to this store" report, even if they never say "report".
---

# Shopify Insight Report

Answer one merchant question with the merchant's own data: what changed, when, and was it the thing they suspect? Shopify's reports are the source the merchant already trusts, so every number in the report comes from a ShopifyQL query they can paste into the ShopifyQL editor in Shopify Analytics and re-run.

Two starting points, same method:

- **With a suspect.** "Sales dropped since the theme publish / the new app / the checkout change / the test." Check the claim and the suspect's mechanism against the data.
- **Without one.** "CVR dropped in the last 30 days and we can't figure out why." Find the day and hour the metric broke, which funnel step and segment moved, then ask what changed at that time.

Worked example. A merchant blamed a change made that week (an A/B test on one product page) for a sales drop. The week held the best sales day in six weeks and page speed was flat; the real break was cart-to-checkout halving at 10:00 am on day five, storewide, on a page the change never touched. Verdict: not that change; check the store's change history for that morning.

## Checklist

Copy this into the response and check items off. Steps are ordered because each later one reads the earlier one's output.

```
- [ ] Intake: claim verbatim, known events, activity log access, data path confirmed
- [ ] 1. Event timeline in store-local time
- [ ] 2. Field names checked against the official docs; every query test-run with LIMIT 5
- [ ] 3. Baseline range (4 to 8 weeks); CVR split into sessions and orders if the claim is a rate
- [ ] 4. Funnel step that moved; break day; break hour (4-hour bins)
- [ ] 5. Segments: storewide or one channel / device / country / landing page
- [ ] 6. Suspect's mechanism checked directly
- [ ] Report: three tiles, timeline, one exhibit per question, footer; pre-publish checks pass
```

## Intake

Ask these in one message and proceed with whatever comes back. Only the data path blocks.

1. **The claim, verbatim.** Which metric, and since when. "CVR dropped in the last 30 days" has three testable parts: the metric, the window, and the implied "it was fine before". The report checks all three rather than assuming them.
2. **Known events**, with dates and times. Offer the usual list so the merchant can recognise one: theme publish or edit, app installed or removed, checkout or payment settings, shipping rates, discount start or end, price change, product launch or stockout, ad campaign or spend change, domain or redirect change, Shopify plan or checkout upgrade, an A/B test started or paused. "Nothing changed" is an answer worth writing down, because the data usually disagrees.
3. **Activity log access.** Shopify's store activity log (in admin Settings) lists edits by time. The report's last action is usually "match this hour against that log", so ask whether they can open it.
4. **Data path**, one of three. Every path reads the store's production analytics, so get a clear yes before the first query.
   - **A Shopify MCP is connected** (Claude, Codex, ChatGPT, and others can connect one): use its analytics query tool. Switch to the right store first if several are connected.
   - **The merchant can issue an Admin API access token**: ask for a custom app with the `read_reports` scope only, then run queries through `scripts/shopifyql.py` (or `scripts/shopifyql.mjs`; same flags) and nothing else. The token lives in the environment, never in chat, a file, or the report. The read-only guarantees are in `references/shopifyql.md` under "Running queries".
   - **Neither**: the merchant runs each query in the ShopifyQL editor (Shopify Analytics, Reports, New exploration, ShopifyQL) and exports the CSV. Give them the queries from `references/shopifyql.md` with the dates filled in, in the order the method needs them.

Timezone comes from the shop info the MCP returns, from `--shop` on the script, or from the merchant. ShopifyQL day rows are store-local; hour rows from the API are UTC. Convert once and use store-local everywhere, including the merchant's own dates.

## Method

### 1. Event timeline before any metric

The report is "metric versus events", so the events come first. List every event from intake in store-local time with one line of context: what it touched and who saw it. "Only visitors from paid social" on a campaign, or "one product page" on a theme edit, is what later lets a storewide drop rule that event out. Include the merchant's own "since" date as an event; it is a hypothesis to test.

Without a suspect the timeline starts with only the merchant's date. Step 4 adds the break, and the intake question comes back as "what changed on Sep 11 between 10:00 am and 6:00 pm?"

### 2. Field names, then validate

ShopifyQL field names are not guessable and differ by dataset (`referring_channel` on `sales`, `referrer_source` on `sessions`). Start from the query pack in `references/shopifyql.md`; for any field a pack query doesn't already use, read Shopify's official page for that dataset. The pack lists the page links (append `.md` to any shopify.dev URL for plain markdown), and `python3 scripts/fetch-docs.py` downloads them all for offline reading. The docs win on any conflict. Run each query once with `LIMIT 5` before the full pull, because a parse error is cheap and a wrong field silently returning zeros is not. On the manual path, send the merchant the `LIMIT 5` version of a query first if you are unsure it parses.

### 3. Baseline

Pull daily `sales` and `sessions` for at least four weeks before the earliest event or claim, eight if the store has them, through today. The baseline is the **range**, not the mean: "Sep 11 to 15 ran 13 to 19 orders; August's lowest days were 17 to 19" is a finding, "Sep 12 was below the August average" is not. Check day-of-week before calling a dip a drop, and judge the suspect window against the baseline range, never against its own best day.

For a **conversion rate** claim, split the ratio first. CVR is completed checkouts over sessions, so it falls when orders fall or when sessions rise. Sessions up with orders flat is a traffic-quality problem (a new campaign, bots, a viral post), and the investigation moves to `sessions` by `referrer_source` and `landing_page_path`. Sessions flat with orders down is a funnel problem, and step 4 finds the step.

### 4. Funnel step, then day, then hour

`sessions` gives `sessions`, `sessions_with_cart_additions`, `sessions_that_reached_checkout`, `sessions_that_completed_checkout`. Plot each and the step-to-step ratio per day. The step that moves names the failure class:

| Step that fell | Points at |
|---|---|
| Sessions | Traffic: ads, campaigns, SEO, bot filter, redirects, a change on landing pages |
| Add to cart | Product page, price, stock, reviews or media apps, a change on the product page |
| Reached checkout | Cart page, cart drawer, cart or upsell apps, discount logic, checkout redirect |
| Completed checkout | Checkout settings, payments, shipping rates, taxes, a checkout or shipping change |

Once the day is known, run `TIMESERIES hour` over that day plus two on each side and bin into 4-hour blocks. The hour is what the merchant matches against the activity log, and it is what separates "3.5 days after the change" from "when the change was made". A metric that fades over a week instead of stepping on one hour is a different class of cause (seasonality, ad fatigue, a competitor, stock running down), and the report should say so.

### 5. Segments

Re-run the funnel `GROUP BY day, <dimension>` for `referrer_source` (`referring_channel` on sales), `session_device_type`, `session_country`, `landing_page_path`, and `sales_channel`. One question per cut: does the break appear in every segment, or in one?

- Every segment, same hour: a storewide change (theme, app, checkout settings, discounts, payments). A suspect is a cause only if it reaches everyone and touches that funnel step.
- One device: a layout or script problem on that device. Check `web_performance` by `device_type`.
- One channel or landing page: a campaign, a redirect, or a change on that page. Compare with each event's targeting from step 1.
- One country: shipping rates, payment methods, market pricing, or a geo block.

### 6. The suspect's mechanism

A change can only break what it touches. Check that surface directly and say so in the report; a flat line there, with the break elsewhere in the funnel, is the strongest exoneration the report can offer.

| Suspect | What it could plausibly move | Check |
|---|---|---|
| Theme publish or edit, app install, any injected script (including an A/B test) | Page speed, layout, add-to-cart | `web_performance` (`lcp_p75_ms`, `p75_cls`, `inp_p75_ms`) storewide and on the touched page by `device_type`; add-to-cart on touched pages |
| Checkout settings, payments, checkout upgrade | Checkout completion | `sessions_that_completed_checkout` by `session_device_type`; orders by `sales_channel` |
| Shipping rates | Checkout completion | `sessions_that_completed_checkout` by `session_country`; `shipping_charges` on sales |
| Price change | AOV, add-to-cart | `average_order_value`, `sessions_with_cart_additions`, sales on the changed products |
| Discount start or end | Reached and completed checkout, AOV | `discounts`, `orders`, `average_order_value` around the date |
| Ad campaign or spend change | Sessions, bounce, the CVR denominator | `sessions` by `referrer_source`, `utm_campaign`, `landing_page_path`; `bounce_rate` |
| Stockout or product launch | Add-to-cart on that product | `sales` and the funnel on the product's page path |
| Domain or redirect change | Sessions, landing pages | `sessions` by `landing_page_path`, `referrer_source` |

Without a suspect, this step runs on whatever the merchant names once they see the hour. Put the hour in front of them first.

## Report

Structure, tile rules, chart rules, and copy rules are in `references/report-shape.md`; read it before writing. Build from `assets/report-template.html`: it has the CSS, the chart helper, the timeline strip, and the three standard exhibits with placeholders, and it needs no build step or network. Deliver it the way the client allows: publish it as an artifact or page where the client has one, otherwise save it as `report.html` and hand the file over. It opens in any browser.

Before publishing, check:

- Every number in a tile appears in an exhibit's Fact paragraph, and every Fact number comes from a query shown next to it.
- Hourly rows were shifted to store-local and the footer says by how many hours.
- The current day is labelled partial and excluded from every average.
- The timeline and every daily chart carry the same event markers.
- No placeholder `{{...}}` remains in the page.

The report holds a merchant's sales figures. Share it with the merchant and the people they name, and never commit a finished report with real numbers into a repository.

## Traps that produced wrong numbers before

- **Hourly rows come back in UTC** even though day rows are store-local. Shift before binning and say so in the footer. On the manual path, confirm the export's hour rows against one hour in the admin's Sessions report before trusting either.
- **The current day is partial.** Label it and keep it out of averages.
- **`web_performance` lags about two days.** The last two days of that chart are missing, not zero.
- **`GROUP BY day, <dimension>` needs an explicit `LIMIT`** (3000 is safe for 60 days by channel); the default cuts the tail silently.
- **Filter `human_or_bot_session = 'human'`** on `sessions` for every funnel query, or bot spikes read as traffic changes. For a CVR claim, run it once without the filter too, since the merchant's admin number may include what the filter removes.
- **`reached_checkout / added_to_cart` can exceed 1.** Saved carts, Buy it now, and abandoned-checkout emails reach checkout without a same-session add. Present it as a before-and-after signal, not a conversion rate, and explain it in Definitions.
- **`sales` counts every sales channel.** Split by `sales_channel` before comparing with online-store sessions.
- **Sample size sets the resolution.** A store doing 20 orders a day has daily noise of about 5, so read runs of days against the baseline range, never a single low day. A store doing 1,000 orders a day can be read at the hour.
- **The merchant's date is a hypothesis.** One merchant said "since the change" (day one); the data said day five at 10:00 am. "The last 30 days" usually means "since the day I noticed".
