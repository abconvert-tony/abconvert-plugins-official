# ABConvert Plugins Marketplace

Official Claude Code plugin marketplace by [ABConvert](https://github.com/ABConvert).

## Installation

### 1. Add the marketplace

**Using CLI:**
```bash
claude plugin marketplace add ABConvert/abconvert-plugins-official
```

**Using Claude Code directly:**
```
/plugin marketplace add ABConvert/abconvert-plugins-official
```

### 2. Install plugins

Plugins can be installed in different scopes:

| Scope | Description |
|-------|-------------|
| `user` | Available in all your Claude Code sessions (default) |
| `project` | Only available in the current project |

**Using CLI:**
```bash
# Install for user (default)
claude plugin install ralph-wiggum@abconvert-plugins

# Install for current project only
claude plugin install ralph-wiggum@abconvert-plugins --scope project

# Shopify insight report skill
claude plugin install shopify-insight-report@abconvert-plugins
```

**Using Claude Code directly:**
```
# Install for user (default)
/plugin install ralph-wiggum@abconvert-plugins

# Install for current project only
/plugin install ralph-wiggum@abconvert-plugins --scope project
```

---

## Available Plugins

### Ralph Wiggum

An iterative development loop that runs Claude with the same prompt repeatedly until task completion. Based on the [Ralph Wiggum technique](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) pioneered by Geoffrey Huntley.

**How it works:**
1. You provide a prompt and completion criteria
2. Claude works on the task and attempts to exit
3. A stop hook feeds the same prompt back
4. Claude sees its previous work in files/git history
5. Loop continues until the task is genuinely complete

**Best for:**
- Well-defined tasks with clear success criteria
- Tasks requiring iteration and refinement
- Greenfield projects you can walk away from
- Tasks with automatic verification (tests, linters)

**Not recommended for:**
- Tasks requiring human judgment
- One-shot operations
- Unclear success criteria

### Commands

| Command | Description |
|---------|-------------|
| `/ralph-wiggum:help` | Show help documentation |
| `/ralph-wiggum:ralph-loop` | Start a Ralph loop |
| `/ralph-wiggum:cancel-ralph` | Cancel an active loop |

### Usage Examples

```bash
# Basic loop with iteration limit
/ralph-wiggum:ralph-loop "Build a REST API for todos" --max-iterations 20

# Loop with completion promise
/ralph-wiggum:ralph-loop "Fix all TypeScript errors" --completion-promise "All tests passing"

# Combined options
/ralph-wiggum:ralph-loop "Refactor auth module" --max-iterations 50 --completion-promise "DONE"

# Cancel an active loop
/ralph-wiggum:cancel-ralph
```

### Autonomous Mode (No Approval Prompts)

For fully autonomous loops where you don't want to approve each action, start Claude Code with the `--dangerously-skip-permissions` flag:

```bash
# Start Claude Code in autonomous mode
claude --dangerously-skip-permissions

# Then run your ralph loop
/ralph-wiggum:ralph-loop "Build a REST API" --completion-promise "DONE" --max-iterations 50
```

**Use cases for autonomous mode:**
- Overnight/background tasks you can walk away from
- Well-defined tasks with automatic verification (tests, linters)
- Greenfield projects with clear completion criteria

**Warning:** This skips all permission prompts. Only use in trusted environments with well-defined tasks and iteration limits.

### Completion Promise

To exit the loop, Claude must output the exact promise text in XML tags:

```
<promise>YOUR_PROMISE_TEXT</promise>
```

The promise must be **genuinely true** - Claude cannot lie to escape the loop.

---

### Shopify Insight Report

A skill that answers one merchant question with the merchant's own Shopify data: what changed, when, and was it the thing they suspect? It works with a suspect ("sales dropped since the theme publish") or without one ("CVR dropped in the last 30 days and we can't figure out why").

**Requires:** either the Shopify MCP connected to the store, or a read-only Admin API access token (a custom app with `read_reports`) exported as `SHOPIFY_STORE` and `SHOPIFY_ACCESS_TOKEN`; and a Claude client that can publish HTML artifacts.

**Read-only by construction.** With a token, the skill never runs a mutation, and that is enforced in three places rather than promised in a prompt: the token should carry no `write_*` scope, so Shopify rejects writes; the bundled `scripts/shopifyql.mjs` sends only fixed query documents and exits before querying if the token has any write scope; and the plugin's PreToolUse hook blocks any shell command that carries a GraphQL mutation to a Shopify Admin API.

**How it works:**
1. Asks for the claim verbatim and any known changes, then builds an event timeline in store-local time
2. Loads the ShopifyQL docs for each dataset and test-runs every query before the full pull
3. Establishes a 4 to 8 week baseline as a range, and splits a conversion-rate claim into sessions and orders
4. Finds the funnel step that moved, the day, then the hour (4-hour bins)
5. Segments by channel, device, country, and landing page to tell storewide changes from targeted ones
6. Checks the suspect's own mechanism (page speed for a theme or app change, checkout completion for a shipping change)

**Output:** a verdict-first HTML report. Three conclusions at the top, a timeline, one exhibit per question with a chart, a Fact paragraph, an Interpretation paragraph, and the copyable ShopifyQL that produced it, so the merchant can re-run every number in the ShopifyQL editor in Shopify Analytics.

**Trigger it with prompts like:**

```
Our conversion rate dropped about 30% over the last month and nobody knows why. Can you look at the store and tell me what happened?
```

```
The merchant thinks the A/B test we launched on Sep 6 killed their sales. Check whether it did.
```

The skill triggers on its own when a conversation mentions a drop in conversion, sales, AOV, or traffic on a Shopify store. It contains no store data; the report template ships with placeholders only.

---

## Uninstall

**Using CLI:**
```bash
# Remove a plugin
claude plugin uninstall ralph-wiggum@abconvert-plugins

# Remove the marketplace
claude plugin marketplace remove abconvert-plugins
```

**Using Claude Code directly:**
```
# Remove a plugin
/plugin uninstall ralph-wiggum@abconvert-plugins

# Remove the marketplace
/plugin marketplace remove abconvert-plugins
```

---

## Bug Fixes

This version includes fixes from [PR #12642](https://github.com/anthropics/claude-code/pull/12642) addressing [issue #12170](https://github.com/anthropics/claude-code/issues/12170):

- Fixed multi-line bash command blocking by security check
- Fixed permission check bug with auto-execute syntax
- Added clearer completion promise instructions

---

## Contributing

Issues and pull requests welcome at [github.com/ABConvert/abconvert-plugins-official](https://github.com/ABConvert/abconvert-plugins-official).

## License

MIT

## Credits

- Original Ralph Wiggum technique by [Geoffrey Huntley](https://github.com/ghuntley)
- Original plugin by [Daisy Hollman](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) at Anthropic
- Bug fixes from [PR #12642](https://github.com/anthropics/claude-code/pull/12642)
