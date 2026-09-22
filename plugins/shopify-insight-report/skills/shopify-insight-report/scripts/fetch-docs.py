#!/usr/bin/env python3
"""Download Shopify's official ShopifyQL documentation for local reading.

shopify.dev serves every page as markdown when `.md` is appended to the URL.
This pulls the syntax pages and the schema pages this skill uses into
references/shopifyql-docs/ so the agent reads Shopify's own field definitions
instead of a paraphrase. The folder is not committed: Shopify's API terms treat
the documentation as Shopify property, so each user fetches their own copy.

Usage:
  python3 scripts/fetch-docs.py             # fetch or refresh everything
  python3 scripts/fetch-docs.py sales       # one page by name
  python3 scripts/fetch-docs.py --list      # show what would be fetched

Standard library only. Set SHOPIFYQL_DOCS_VERSION (default "latest") to pin
an API version such as 2026-07.
"""
import datetime as dt
import os
import ssl
import sys
import urllib.error
import urllib.request

VERSION = os.environ.get("SHOPIFYQL_DOCS_VERSION", "latest")
BASE = f"https://shopify.dev/docs/api/shopifyql/{VERSION}"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "references", "shopifyql-docs"))

# name -> path under BASE. Schemas are the datasets the report uses; syntax is
# every clause page. Add a dataset here if the method starts using it.
PAGES = {
    "index": "",
    "syntax": "/syntax",
    "from-and-show": "/syntax/from-and-show",
    "where": "/syntax/where",
    "group-by": "/syntax/group-by",
    "timeseries": "/syntax/timeseries",
    "since-until-during": "/syntax/since-until-during",
    "order-by": "/syntax/order-by",
    "limit": "/syntax/limit",
    "having": "/syntax/having",
    "compare-to": "/syntax/compare-to",
    "with": "/syntax/with",
    "annotate": "/syntax/annotate",
    "comments": "/syntax/comments",
    "schemas": "/schemas",
    "sales": "/schemas/sales_revenue/sales",
    "discounts": "/schemas/sales_revenue/discounts",
    "sessions": "/schemas/sessions_and_behavior/sessions",
    "web_performance": "/schemas/sessions_and_behavior/web_performance",
}


def ssl_context():
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "shopify-insight-report fetch-docs"})
    try:
        with urllib.request.urlopen(req, timeout=60, context=ssl_context()) as res:
            return res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"fetch-docs: HTTP {e.code} for {url}")
    except urllib.error.URLError as e:
        if "CERTIFICATE_VERIFY_FAILED" in str(e.reason):
            raise SystemExit(
                "fetch-docs: this Python has no CA certificates. Fix with `pip3 install certifi`, "
                "or run `Install Certificates.command` from the Python folder in /Applications, "
                "or fetch with curl: curl -sL " + url + " -o <file>"
            )
        raise SystemExit(f"fetch-docs: cannot reach shopify.dev: {e.reason}")


def main():
    args = [a for a in sys.argv[1:]]
    if "--list" in args:
        for name, path in PAGES.items():
            print(f"{name:22s} {BASE}{path}.md")
        return
    wanted = [a for a in args if not a.startswith("--")] or list(PAGES)
    unknown = [w for w in wanted if w not in PAGES]
    if unknown:
        raise SystemExit(f"fetch-docs: unknown page(s) {', '.join(unknown)}; run --list")

    os.makedirs(OUT, exist_ok=True)
    index_lines = [
        "# Official ShopifyQL docs, local copy",
        "",
        f"Fetched {dt.date.today().isoformat()} from shopify.dev (`{VERSION}`). Not committed; run "
        "`python3 scripts/fetch-docs.py` to refresh. Each file keeps Shopify's frontmatter with "
        "`api_version` and `source_url`.",
        "",
        "| Page | File | Source |",
        "|---|---|---|",
    ]
    for name in wanted:
        url = f"{BASE}{PAGES[name]}.md"
        text = fetch(url)
        path = os.path.join(OUT, f"{name}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"{name:22s} {len(text):>7,d} bytes  -> references/shopifyql-docs/{name}.md")
    for name in PAGES:
        if os.path.exists(os.path.join(OUT, f"{name}.md")):
            index_lines.append(f"| {name} | `{name}.md` | {BASE}{PAGES[name]} |")
    with open(os.path.join(OUT, "INDEX.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(index_lines) + "\n")
    print(f"index                  -> references/shopifyql-docs/INDEX.md")


if __name__ == "__main__":
    main()
