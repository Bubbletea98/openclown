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
- An **LLM API key** — Anthropic, OpenAI, or any OpenAI-compatible provider (Groq, Together, Ollama, etc.)

### Step 1: Install the plugin

```bash
openclaw plugin install openclown
```

Or install manually from npm:

```bash
npm install openclown
```

### Step 2: Configure your LLM provider

OpenClown supports multiple LLM providers. By default it uses **Anthropic (Claude)**, but you can switch to **OpenAI** or any **OpenAI-compatible** service.

#### Anthropic (default)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or via plugin config:

```bash
openclaw config set plugins.entries.openclown.config.anthropicApiKey sk-ant-...
```

Anthropic also supports OpenClaw's built-in model auth — if you've already configured Anthropic as a provider in OpenClaw, it will be used automatically.

#### OpenAI

```bash
openclaw config set plugins.entries.openclown.config.provider openai
export OPENAI_API_KEY=sk-...
```

#### OpenAI-compatible services (Groq, Together, Ollama, LM Studio, etc.)

Any service that exposes an OpenAI-compatible Chat Completions endpoint works:

```bash
# Groq
openclaw config set plugins.entries.openclown.config.provider openai
openclaw config set plugins.entries.openclown.config.baseUrl https://api.groq.com/openai/v1
openclaw config set plugins.entries.openclown.config.openaiApiKey gsk_...
openclaw config set plugins.entries.openclown.config.model llama-3.3-70b-versatile

# Ollama (local — no API key needed)
openclaw config set plugins.entries.openclown.config.provider openai
openclaw config set plugins.entries.openclown.config.baseUrl http://localhost:11434/v1
openclaw config set plugins.entries.openclown.config.model llama3
```

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

The default model depends on your provider:

| Provider | Default Model |
|----------|--------------|
| `anthropic` | `claude-sonnet-4-6` |
| `openai` | `gpt-4o` |

Override with any model your provider supports:

```bash
# Anthropic — use a faster model
openclaw config set plugins.entries.openclown.config.model claude-haiku-4-5-20251001

# OpenAI — use a cheaper model
openclaw config set plugins.entries.openclown.config.model gpt-4o-mini
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

### WhatsApp example — full interaction

OpenClown works anywhere OpenClaw does, including WhatsApp. Here's what a typical session looks like:

```
┌─────────────────────────────────────┐
│            WhatsApp Chat            │
├─────────────────────────────────────┤
│                                     │
│  You:                          ◄──┐ │
│  Find me a good sushi place        │ │
│  near Shibuya for tonight          │ │
│                                     │
│  ┌─────────────────────────────┐   │ │
│  │ OpenClaw:                   │   │ │
│  │ Here are 3 top-rated sushi  │   │ │
│  │ restaurants near Shibuya:   │   │ │
│  │                             │   │ │
│  │ 1. Sushi Saito — omakase,  │   │ │
│  │    ¥15,000+, reservations  │   │ │
│  │    required 1 month ahead  │   │ │
│  │ 2. Genki Sushi — conveyor  │   │ │
│  │    belt, budget-friendly   │   │ │
│  │ 3. Sushi no Midori — long  │   │ │
│  │    queues but worth it     │   │ │
│  │                    [🎪 #1] │   │ │
│  └─────────────────────────────┘   │ │
│                                     │
│  You:                               │
│  /clown                             │
│                                     │
│  ┌─────────────────────────────┐   │ │
│  │ OpenClaw:                   │   │ │
│  │ 🎪 OpenClown Evaluation     │   │ │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━   │   │ │
│  │                             │   │ │
│  │ 📋 "Find me a good sushi   │   │ │
│  │    place near Shibuya..."   │   │ │
│  │                             │   │ │
│  │ 🎭 Philosopher              │   │ │
│  │ "Good" is doing heavy      │   │ │
│  │ lifting here — the list    │   │ │
│  │ mixes a ¥15k omakase with  │   │ │
│  │ a conveyor belt chain      │   │ │
│  │ without asking about       │   │ │
│  │ budget or occasion.        │   │ │
│  │ Severity: 💡 Insight       │   │ │
│  │                             │   │ │
│  │ 🔒 Security Expert          │   │ │
│  │ The search query likely     │   │ │
│  │ included precise GPS       │   │ │
│  │ coordinates. "Near         │   │ │
│  │ Shibuya" is enough —       │   │ │
│  │ exact lat/lng should not   │   │ │
│  │ be sent to a third-party   │   │ │
│  │ search API.                │   │ │
│  │ Severity: ⚠️ Warning       │   │ │
│  │                             │   │ │
│  │ 💻 Developer                │   │ │
│  │ Sushi Saito requires       │   │ │
│  │ reservations 1 month       │   │ │
│  │ ahead — recommending it    │   │ │
│  │ for "tonight" is a dead    │   │ │
│  │ end. Should filter by      │   │ │
│  │ same-day availability.     │   │ │
│  │ Severity: 🔴 Critical      │   │ │
│  │                             │   │ │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━   │   │ │
│  └─────────────────────────────┘   │ │
│                                     │
│  You:                               │
│  /clown encore                      │
│                                     │
│  ┌─────────────────────────────┐   │ │
│  │ OpenClaw:                   │   │ │
│  │ 🎪 Encore — Improved        │   │ │
│  │                             │   │ │
│  │ Since you said "tonight,"  │   │ │
│  │ here are places you can    │   │ │
│  │ actually walk into now:    │   │ │
│  │                             │   │ │
│  │ 1. Sushi no Midori         │   │ │
│  │    Walk-in OK, ~30min wait │   │ │
│  │    ¥3,000–5,000/person     │   │ │
│  │ 2. Genki Sushi             │   │ │
│  │    No wait, ¥1,000–2,000   │   │ │
│  │ 3. Katsu Midori            │   │ │
│  │    Walk-in OK, ¥4,000–6,000│   │ │
│  │                    [🎪 #2] │   │ │
│  └─────────────────────────────┘   │ │
│                                     │
└─────────────────────────────────────┘
```

This works on any messaging channel — WhatsApp, Telegram, Slack, Discord. On mobile, you can also **reply to a specific message** to target it:

```
You:     [Reply to 🎪 #1] /clown
         → evaluates exactly the message you replied to
```

### Keyword search

Can't remember the reference number? Search by keyword:

```
You:     /clown sushi
         → finds and evaluates the most recent exchange mentioning "sushi"
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

Your circus is the set of performers (evaluators) that critique each AI response. By default, three are active: Philosopher, Security Expert, and Developer. You can add, remove, toggle, or reset them at any time.

**View the current lineup:**

```
You:     /clown circus
OpenClaw: 🎪 Circus Performers
         ━━━━━━━━━━━━━━━━━━━━━━
         ✅ 1. 🎭 Philosopher  [philosopher]
         ✅ 2. 🔒 Security Expert  [security]
         ✅ 3. 💻 Developer  [developer]
         ⬜ 4. ⚖️ Ethicist  [ethicist]
         ⬜ 5. 🔍 Fact Checker  [factchecker]
         ⬜ 6. 🎨 UX Designer  [ux]
         ⬜ 7. 💰 VC Investor  [investor]
         ⬜ 8. 😂 Comedian  [comedian]
         ⬜ 9. 🎭 Shakespeare  [shakespeare]
         ⬜ 10. 🕵️ Conspiracy Theorist  [conspiracy]
         ⬜ 11. 👴 Grandparent  [grandparent]
         ⬜ 12. 🐱 Cat Expert  [cat]
```

**Add performers** — enable one or more by ID:

```
You:     /clown circus add comedian ethicist
OpenClaw: ✅ 😂 Comedian joined!
         ✅ ⚖️ Ethicist joined!
```

**Remove performers** — disable one or more by ID:

```
You:     /clown circus remove philosopher security
OpenClaw: ⬜ 🎭 Philosopher left the circus
         ⬜ 🔒 Security Expert left the circus
```

At least one performer must remain active. If you try to remove the last one, you'll get an error.

**Toggle by number** — flip performers on/off using the numbers from the list:

```
You:     /clown circus toggle 1,4,8
OpenClaw: 🎪 Toggled:
         ⬜ 🎭 Philosopher
         ✅ ⚖️ Ethicist
         ✅ 😂 Comedian
```

**Reset to defaults** — restore the original three performers:

```
You:     /clown circus reset
OpenClaw: 🎪 Circus reset to defaults: philosopher, security, developer.
         Config saved.
```

Your lineup is saved to `~/.openclaw/openclown/circus.json` and persists across restarts.

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

# LLM provider: "anthropic" (default) or "openai"
openclaw config set plugins.entries.openclown.config.provider openai

# Custom base URL for OpenAI-compatible services
openclaw config set plugins.entries.openclown.config.baseUrl https://api.groq.com/openai/v1

# Override the model used for evaluations
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
