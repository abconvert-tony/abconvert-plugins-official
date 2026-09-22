#!/usr/bin/env node
// Run one ShopifyQL query against a store with an Admin API access token.
//
// This is the only sanctioned way to use a token from this skill, and it is
// read-only by construction:
//   1. It sends only the fixed GraphQL documents below (scopes, shop info, and
//      `shopifyqlQuery`). The ShopifyQL string travels as a variable, so nothing
//      in it can become a mutation.
//   2. Before the first query it reads the token's access scopes and exits if
//      any `write_*` scope is present. A token that can write is the wrong
//      token for an analytics job, whoever holds it.
//
// Usage:
//   SHOPIFY_STORE=example.myshopify.com SHOPIFY_ACCESS_TOKEN=shpat_... \
//     node scripts/shopifyql.mjs "FROM sales SHOW orders TIMESERIES day SINCE -7d UNTIL today"
//   node scripts/shopifyql.mjs --check          # scope check only
//   node scripts/shopifyql.mjs --shop           # store name, timezone, currency
//   node scripts/shopifyql.mjs --csv "<query>"  # CSV instead of JSON
//
// The token comes from the environment, never from a chat message or a file
// in the report. Set SHOPIFY_API_VERSION to override the default version.

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const shopOnly = args.includes('--shop');
const csv = args.includes('--csv');
const query = args.filter((a) => !a.startsWith('--')).join(' ').trim();

// Read-only scopes this skill ever needs. Anything else is a reason to stop.
const ALLOWED_SCOPES = new Set(['read_reports', 'read_orders', 'read_products', 'read_customers', 'read_analytics']);

const SCOPES_QUERY = `query AccessScopes { currentAppInstallation { accessScopes { handle } } }`;
const SHOP_QUERY = `query ShopInfo { shop { name myshopifyDomain ianaTimezone currencyCode } }`;
const SHOPIFYQL_QUERY = `query ShopifyQL($query: String!) {
  shopifyqlQuery(query: $query) {
    parseErrors
    tableData { columns { name dataType displayName } rows }
  }
}`;

function fail(msg, code = 1) {
  process.stderr.write(`shopifyql: ${msg}\n`);
  process.exit(code);
}

if (!STORE || !TOKEN) fail('set SHOPIFY_STORE (xxx.myshopify.com) and SHOPIFY_ACCESS_TOKEN in the environment');
if (!checkOnly && !shopOnly && !query) fail('pass a ShopifyQL query string, --check, or --shop');

async function graphql(document, variables) {
  let res;
  try {
    res = await fetch(`https://${STORE}/admin/api/${VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query: document, variables }),
    });
  } catch (err) {
    fail(`cannot reach ${STORE}: ${err.cause?.code || err.cause?.message || err.message}. Check SHOPIFY_STORE (it should end in .myshopify.com).`);
  }
  if (res.status === 401 || res.status === 403) fail(`HTTP ${res.status} from ${STORE}: the token was rejected. Check SHOPIFY_ACCESS_TOKEN and that the custom app is installed on this store.`);
  if (!res.ok) fail(`HTTP ${res.status} from ${STORE}`);
  const body = await res.json();
  if (body.errors?.length) fail(body.errors.map((e) => e.message).join('; '));
  return body.data;
}

async function checkScopes() {
  const data = await graphql(SCOPES_QUERY);
  const handles = (data?.currentAppInstallation?.accessScopes ?? []).map((s) => s.handle).sort();
  const writes = handles.filter((h) => h.startsWith('write_'));
  const extras = handles.filter((h) => !h.startsWith('write_') && !ALLOWED_SCOPES.has(h));
  if (writes.length) {
    fail(
      `this token can write (${writes.join(', ')}). Use a custom app with read scopes only ` +
        `(read_reports is enough for ShopifyQL). Nothing was queried.`,
      2,
    );
  }
  if (!handles.includes('read_reports')) fail(`token lacks read_reports, which ShopifyQL needs. Scopes: ${handles.join(', ')}`);
  return { handles, extras };
}

const { handles, extras } = await checkScopes();
if (checkOnly) {
  process.stdout.write(JSON.stringify({ store: STORE, readOnly: true, scopes: handles, unexpectedReadScopes: extras }, null, 2) + '\n');
  process.exit(0);
}

if (shopOnly) {
  const shop = await graphql(SHOP_QUERY);
  process.stdout.write(JSON.stringify(shop.shop, null, 2) + '\n');
  process.exit(0);
}

const data = await graphql(SHOPIFYQL_QUERY, { query });
const node = data?.shopifyqlQuery;
if (node?.parseErrors?.length) fail(`parse error: ${node.parseErrors.join('; ')}`);
const columns = (node?.tableData?.columns ?? []).map((c) => c.name);
const rows = node?.tableData?.rows ?? [];

if (csv) {
  const esc = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  process.stdout.write([columns.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n');
} else {
  process.stdout.write(JSON.stringify({ query, columns, rows }, null, 2) + '\n');
}
