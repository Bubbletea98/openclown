# Command Reference

Full reference for all OpenClown commands.

---

## `/clown` — Evaluate an AI response

Evaluate an AI response from multiple expert perspectives.

**Usage:**

```
/clown
```

**How to target a specific response:**

- **Reply + `/clown`** — On mobile, long-press the AI response → Reply → type `/clown`. OpenClown matches the quoted text to identify the response you replied to. Works on WhatsApp, Telegram, Slack, Discord.
- **`/clown`** (no reply) — Evaluates the most recent AI response in the conversation.
- **`/clown <keyword>`** — Searches recent exchanges and evaluates the most recent one matching the keyword. Example: `/clown weather`.

**What evaluators see:**

Each performer receives:
- The user's original question
- Up to 3 prior exchanges for conversation context (follow-up questions)
- The AI's thinking process
- All tool calls made (search queries, API calls, etc.) with result previews
- The AI's final response

**Output:**

```
📎 Matched reply: "Yes! Toronto pools are open on Sunday..."

🎪 OpenClown Evaluation
━━━━━━━━━━━━━━━━━━━━━━

📋 Evaluating: "Are there public pools open on Sunday in Toronto?"

🎭 Philosopher (philosopher)
The response assumes "open on Sunday" means...
Severity: 💡 Insight

🔒 Security Expert (security)
The web_search exposed the user's city...
Severity: ⚠️ Warning

💻 Senior Developer (developer)
The search results were used without verifying...
Severity: 🔴 Critical

━━━━━━━━━━━━━━━━━━━━━━
💡 Reply to this message with /clown encore to get an improved answer
📖 Use /clown help to see all available commands
```

The `📎 Matched reply` line appears only when you replied to a specific message (not the latest).

---

## `/clown encore` — Re-run with feedback

Takes the evaluation feedback from your last `/clown` run and asks the AI to re-answer the original question, addressing the issues raised.

**Usage:**

```
/clown encore
```

**Requirements:** You must run `/clown` first. The encore uses the feedback from the most recent evaluation.

**Output:**

```
🎪 Encore — Improved Response
━━━━━━━━━━━━━━━━━━━━━━

📋 Original question: "Are there public pools open on Sunday in Toronto?"

[Improved response addressing the evaluation feedback]

━━━━━━━━━━━━━━━━━━━━━━
💡 Reply to this message with /clown to evaluate this improved answer
🔄 Reply with /clown encore for another round of improvement
```

---

## `/clown circus` — Manage performers

View and manage the performers (evaluators) in your circus.

### View lineup

```
/clown circus
```

Shows all available performers with their enabled/disabled status:

```
🎪 Circus Performers
━━━━━━━━━━━━━━━━━━━━━━

✅ 1. 🎭 Philosopher  [philosopher]
✅ 2. 🔒 Security Expert  [security]
✅ 3. 💻 Developer  [developer]
⬜ 4. ⚖️ Ethicist  [ethicist]
⬜ 5. 🔍 Fact Checker  [factchecker]
...
```

### Enable performers

Use id or number. Separate multiple with commas:

```
/clown circus on comedian
/clown circus on 4,5,8
/clown circus on comedian,factchecker
```

### Disable performers

At least one performer must remain active:

```
/clown circus off philosopher
/clown circus off 1,2
```

### Toggle (enable & disable in one command)

Switches each performer's current state — on becomes off, off becomes on:

```
/clown circus toggle 1,3
/clown circus toggle comedian,philosopher
```

### Reset to defaults

Restore the default lineup (Philosopher, Security Expert, Developer):

```
/clown circus reset
```

---

## `/clown circus create` — Create a custom performer

Create a new performer through a guided conversational flow.

**Usage:**

```
/clown circus create <description of the performer you want>
```

**Example:**

```
/clown circus create A maritime law expert who evaluates responses for legal accuracy
```

**Flow:**

1. OpenClown asks follow-up questions about evaluation focus, style, and severity
2. You answer with `/clown circus create <your answers>`
3. OpenClown generates a draft and shows a summary
4. Review and confirm:
   - `/clown circus confirm` — save and enable the performer
   - `/clown circus preview` — see the full SKILL.md definition
   - `/clown circus create <changes>` — request changes to the draft
   - `/clown circus cancel` — discard

Custom performers are saved to `~/.openclaw/openclown/skills/` and work exactly like built-in ones.

---

## `/clown circus edit` — Edit a performer

Modify any performer's evaluation behavior.

**Usage:**

```
/clown circus edit <id> <what to change>
```

**Example:**

```
/clown circus edit philosopher Make it focus more on ethical assumptions
```

After editing, use `/clown circus confirm` to save or `/clown circus cancel` to discard. Editing a built-in performer saves a user-level copy — the original is never modified.

---

## `/clown circus delete` — Delete a custom performer

Permanently remove a custom performer from disk.

**Usage:**

```
/clown circus delete <id>
```

Only custom performers can be deleted. Built-in performers can only be disabled with `/clown circus off`.

---

## `/clown help` — Show help

Display a summary of all available commands.

```
/clown help
```

---

## Configuration

OpenClown works out of the box with zero configuration. These are optional overrides:

```bash
# Use a different model for evaluations
openclaw config set plugins.entries.openclown.config.model claude-haiku-4-5-20251001

# Use a different provider
openclaw config set plugins.entries.openclown.config.provider openai

# Auto-evaluate after every task (default: false)
openclaw config set plugins.entries.openclown.config.autoEvaluate true

# Max transcript tokens sent to evaluators (default: 4000)
openclaw config set plugins.entries.openclown.config.maxTranscriptTokens 4000
```
