# 🎪 OpenClown — Multi-Perspective AI Task Evaluation

<p align="center">
  <strong>Your AI did the work. Now let the circus review it.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

**OpenClown** is a plugin for [OpenClaw](https://github.com/openclaw/openclaw) that evaluates AI-completed tasks from multiple expert perspectives. A "circus" of specialized performers — a philosopher, a security expert, a developer, and more — independently critique what your AI assistant just did.

The goal: catch blind spots, surface risks, and improve AI output quality before you act on it.

## How it works

```
You ask OpenClaw to do something
        │
        ▼
  OpenClaw completes the task
        │
        ▼
  You type /clown
        │
        ▼
┌─────────────────────────────────────┐
│         OpenClown Circus            │
│                                     │
│  📝 Gather context                  │
│     (current exchange + up to 3     │
│      prior exchanges for follow-ups)│
│              │                      │
│  🎭 Philosopher  → questions assumptions
│  🔒 Security     → flags data exposure
│  💻 Developer    → spots better approaches
│  ... (12 performers available)      │
└──────────────┬──────────────────────┘
               │
               ▼
     Formatted evaluation with
     severity levels + actionable feedback
```

## Getting started

### Prerequisites

- **[OpenClaw](https://github.com/openclaw/openclaw)** installed and running (Gateway active)
- **Node 22.16+** (Node 24 recommended)
- An **Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com/)

### Step 1: Install the plugin

```bash
openclaw plugin install openclown
```

Or install manually from npm:

```bash
npm install openclown
```

### Step 2: Set your Anthropic API key

OpenClown calls the Anthropic API directly to run evaluations. Choose whichever method works best for your setup:

**Option A — Environment variable (simplest)**

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Then restart your shell or run `source ~/.zshrc`.

**Option B — Plugin config (per-install, no env needed)**

```bash
openclaw config set plugins.entries.openclown.config.anthropicApiKey sk-ant-...
```

This stores the key in your OpenClaw config file. Useful if you run multiple tools that each need different API keys, or if you prefer not to set global environment variables.

**Option C — OpenClaw model auth (automatic)**

If you've already configured Anthropic as a model provider in OpenClaw, OpenClown will attempt to use that auth automatically. No extra setup needed — but this may not work in all contexts (e.g., CLI command invocation).

OpenClown tries these in order: plugin config → environment variable → OpenClaw model auth. The first one that returns a valid key wins.

### Step 3: Verify the setup

Start (or restart) your OpenClaw gateway, then run:

```bash
/clown
```

If everything is configured correctly, you'll see an evaluation of your last AI task. If the API key is missing, you'll get a clear error message telling you which options to set.

### Step 4 (optional): Customize your circus

By default, three performers are enabled: **Philosopher**, **Security Expert**, and **Developer**. You can change this anytime:

```bash
/clown circus              # See current lineup + all available performers
/clown circus add comedian # Enable a performer
/clown circus rm developer # Disable a performer
/clown circus reset        # Reset to defaults
```

Your performer selection is persisted to `~/.openclaw/openclown/circus.json` and survives restarts.

### Step 5 (optional): Configure the evaluation model

By default, OpenClown uses `claude-sonnet-4-6` for evaluations. You can switch to a cheaper or more powerful model:

```bash
# Use a faster, cheaper model
openclaw config set plugins.entries.openclown.config.model claude-haiku-4-5-20251001

# Use the most capable model
openclaw config set plugins.entries.openclown.config.model claude-opus-4-6
```

## Quick start

```bash
# Evaluate the last AI task
/clown

# Evaluate a specific response by reference number
/clown #3

# Fuzzy search by keyword
/clown restaurant

# Manage your circus lineup
/clown circus

# Re-run the original task with evaluation feedback
/clown encore
```

## Usage examples

### Basic evaluation

Ask your AI assistant to complete a task, then evaluate it:

```
You:     Find me the best coffee shops in downtown Seattle
OpenClaw: Here are the top 5 coffee shops... [🎪 #1]

You:     /clown
```

> **Screenshot needed:** A screenshot of a `/clown` evaluation output showing all three default performers (Philosopher, Security Expert, Developer) critiquing a real task response.

### Evaluate a specific response

When you have multiple exchanges, target one by its reference number:

```
You:     What's the weather in Tokyo?
OpenClaw: Currently 18°C and partly cloudy... [🎪 #3]

You:     Translate this email to French
OpenClaw: Voici la traduction... [🎪 #4]

You:     /clown #3
         → evaluates the weather response, not the translation
```

### Reply targeting (messaging channels)

On WhatsApp, Telegram, Slack, or Discord — just reply to the message you want to evaluate:

```
You:     [Reply to 🎪 #3] /clown
         → evaluates exactly the message you replied to
```

> **Screenshot needed:** A WhatsApp or Telegram screenshot showing a user replying to a specific AI response with `/clown`, and the evaluation result appearing in the chat.

### Keyword search

Can't remember the reference number? Search by keyword:

```
You:     /clown coffee
         → finds and evaluates the most recent exchange mentioning "coffee"
```

### Follow-up questions — automatic conversation context

OpenClown automatically includes up to 3 prior exchanges when evaluating a follow-up question, so evaluators understand the full conversation:

```
You:     Which cities in Canada are best for startups?
OpenClaw: Vancouver and Toronto lead the pack... [🎪 #1]

You:     How about Ottawa?
OpenClaw: Ottawa has a growing tech scene... [🎪 #2]

You:     /clown
         → evaluates #2, but evaluators also see #1 as context
         → they understand "How about Ottawa?" means
            "Is Ottawa good for startups?" — not a vague question
```

This also works with `/clown encore` — the improved response is generated with full conversation context, so it knows what "How about Ottawa?" refers to.

> **Screenshot needed:** A `/clown` evaluation of a short follow-up question (like "How about Ottawa?" or "What about pricing?"), where the evaluation output shows the performers understood the full context from the prior exchange rather than treating it as a vague question.

### Encore — improve with feedback

After an evaluation reveals issues, let the AI try again with the feedback applied:

```
You:     /clown
OpenClaw: 🎪 OpenClown Evaluation
         🔒 Security Expert: GPS coordinates exposed...
         💻 Developer: No error handling for rate limits...

You:     /clown encore
OpenClaw: 🎪 Encore — Improved Response
         Here are the top 5 coffee shops (using neighborhood-level location)...
```

> **Screenshot needed:** A side-by-side or sequential screenshot showing the original response, the `/clown` evaluation, and the `/clown encore` improved response.

### Managing your circus

```
You:     /clown circus
OpenClaw: 🎪 Circus Performers
         ━━━━━━━━━━━━━━━━━━━━━━
         ✅ 1. 🎭 Philosopher  [philosopher]
         ✅ 2. 🔒 Security Expert  [security]
         ✅ 3. 💻 Developer  [developer]
         ⬜ 4. ⚖️ Ethicist  [ethicist]
         ⬜ 5. 🔍 Fact Checker  [factchecker]
         ...

You:     /clown circus add comedian ethicist
OpenClaw: ✅ 😂 Comedian joined!
         ✅ ⚖️ Ethicist joined!

You:     /clown circus toggle 1,4
OpenClaw: 🎪 Toggled:
         ⬜ 🎭 Philosopher
         ✅ ⚖️ Ethicist
```

> **Screenshot needed:** A screenshot of the `/clown circus` numbered list showing a mix of enabled/disabled performers.

## Performers

OpenClown ships with 12 performers. Three are enabled by default:

| Performer | Emoji | Focus |
|-----------|-------|-------|
| **Philosopher** | 🎭 | Assumptions, definitions, epistemic honesty |
| **Security Expert** | 🔒 | Data exposure, API security, privacy |
| **Developer** | 💻 | Implementation quality, error handling, efficiency |

Additional performers you can enable:

| Performer | Emoji | Focus |
|-----------|-------|-------|
| Ethicist | ⚖️ | Fairness, inclusivity, potential harm |
| Fact Checker | 🔍 | Accuracy, sources, hallucination detection |
| UX Designer | 🎨 | Information hierarchy, scannability, actionability |
| VC Investor | 💰 | Value proposition, scalability, ROI |
| Comedian | 😂 | Absurdity, overthinking, unintentional humor |
| Shakespeare | 🎭 | Narrative arc, emotional truth, prose quality |
| Conspiracy Theorist | 🕵️ | Data provenance, hidden agendas, algorithmic bias |
| Grandparent | 👴 | Practicality, common sense, well-being |
| Cat Expert | 🐱 | Efficiency, priorities, power dynamics |

Toggle performers with `/clown circus`:

```bash
/clown circus              # Show current lineup
/clown circus add comedian # Enable a performer
/clown circus rm investor  # Disable a performer
/clown circus reset        # Reset to defaults
```

## Creating custom performers

Add a new directory under `skills/` with a `SKILL.md` file. That's it — OpenClown auto-discovers it on next load.

```
skills/
├── your-custom-skill/
│   └── SKILL.md
```

### SKILL.md format

```markdown
---
id: mycustom
names:
  en: My Custom Expert
emoji: "🔧"
severity: warning
category: serious
---

# My Custom Expert

You are a [role description], evaluating an AI assistant's task execution.

## What to Examine

- [Evaluation criteria 1]
- [Evaluation criteria 2]

## Output Format

2-3 sentences. Write in the same language as the original user request.
```

**Frontmatter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (lowercase, no spaces) |
| `names` | Yes | Display names by locale (`en`, `zh`, `ja`, `ko`, `fr`, `es`) |
| `emoji` | Yes | Single emoji for display |
| `severity` | Yes | Default severity: `insight`, `warning`, or `critical` |
| `category` | No | `serious` (default) or `fun` |

## Configuration

```bash
# Enable/disable the plugin
openclaw config set plugins.entries.openclown.config.enabled true

# Auto-evaluate after every task (default: false)
openclaw config set plugins.entries.openclown.config.autoEvaluate true

# Override the model used for evaluations (default: claude-sonnet-4-6)
openclaw config set plugins.entries.openclown.config.model claude-haiku-4-5-20251001

# Max transcript tokens sent to evaluators (default: 4000)
openclaw config set plugins.entries.openclown.config.maxTranscriptTokens 4000

# Reference tag style: subtle (default), minimal, or hidden
openclaw config set plugins.entries.openclown.config.tagStyle subtle
```

## Reply targeting

On messaging channels (WhatsApp, Telegram, Slack, Discord), you can reply to a specific AI response and type `/clown` to evaluate just that exchange. OpenClown tags outbound messages with a subtle reference `[🎪 #N]` and uses it to resolve which task you're targeting.

| Channel | Reply + /clown | /clown (last task) | /clown \<keyword\> |
|---------|:-:|:-:|:-:|
| WhatsApp | ✅ | ✅ | ✅ |
| Telegram | ✅ | ✅ | ✅ |
| Discord | ✅ | ✅ | ✅ |
| Slack | ✅ | ✅ | ✅ |
| CLI | — | ✅ | ✅ |

## Output examples

### Standard evaluation

```
🎪 OpenClown Evaluation
━━━━━━━━━━━━━━━━━━━━━━

📋 Evaluating: "Find top 3 restaurants nearby"

🎭 Philosopher
Who defines "top"? Rating systems carry inherent biases toward
certain demographics and cuisines. The AI accepted the premise
without questioning the ranking methodology.
Severity: 💡 Insight

🔒 Security Expert
The web_search call included precise GPS coordinates in the query
string — this reveals exact location to the search provider.
Suggest using neighborhood-level precision instead.
Severity: ⚠️ Warning

💻 Developer
No error handling for the API call — a 429 rate limit would crash
the entire task. Should implement retry with backoff.
Severity: 🔴 Critical

━━━━━━━━━━━━━━━━━━━━━━
```

### Follow-up with conversation context

When evaluating a follow-up like "How about Ottawa?" after a question about Canadian startup cities, the evaluators see the prior conversation and evaluate accordingly:

```
🎪 OpenClown Evaluation
━━━━━━━━━━━━━━━━━━━━━━

📋 Evaluating: "How about Ottawa?"
📎 With context from 1 prior exchange

🎭 Philosopher
The response frames Ottawa purely through a tech-sector lens,
but the user's original question was about "startups" broadly —
manufacturing, social enterprise, and creative industries
in Ottawa were ignored.
Severity: 💡 Insight

🔒 Security Expert
No data exposure concerns in this exchange. The response used
publicly available statistics without transmitting user location.
Severity: 💡 Insight

💻 Developer
The comparison data between Ottawa and the previously mentioned
cities (Vancouver, Toronto) is inconsistent — different metrics
were used, making a fair comparison impossible for the user.
Severity: ⚠️ Warning

━━━━━━━━━━━━━━━━━━━━━━
```

## Multilingual support

OpenClown auto-detects the language of the user's request and evaluates in the same language. Supported locales for performer names: English, Chinese, Japanese, Korean, French, Spanish.

## Project structure

```
openclown/
├── src/
│   ├── index.ts              # Plugin entry + API key resolution
│   ├── commands/clown.ts     # /clown command handler
│   ├── circus/
│   │   ├── types.ts          # Core types (Performer, Circus, etc.)
│   │   ├── defaults.ts       # Performer state + language detection
│   │   ├── engine.ts         # Parallel evaluation engine
│   │   ├── prompt.ts         # Evaluation prompt builder
│   │   └── skill-loader.ts   # Auto-loads skills from SKILL.md files
│   ├── transcript/
│   │   ├── cache.ts          # In-memory exchange cache
│   │   ├── extractor.ts      # Parses messages into structured exchanges
│   │   └── reader.ts         # Session transcript reader
│   ├── hooks/
│   │   ├── agent-end.ts      # Caches exchanges on task completion
│   │   ├── message-sending.ts # Tags outbound messages with [🎪 #N]
│   │   └── inbound-claim.ts  # Extracts ref from reply context
│   ├── output/formatter.ts   # Formats evaluation results
│   └── config/schema.ts      # Plugin config schema
├── skills/                   # Performer definitions (drop-in)
│   ├── philosopher/SKILL.md
│   ├── security/SKILL.md
│   ├── developer/SKILL.md
│   └── ... (12 total)
├── test/
├── openclaw.plugin.json
├── package.json
└── tsconfig.json
```

## Development

```bash
git clone https://github.com/openclown/openclown.git
cd openclown

npm install
npm run build
npm test
```

## License

MIT
