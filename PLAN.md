# OpenClown - AI Task Evaluation Circus

> A plugin for OpenClaw that provides multi-perspective evaluation of AI-completed tasks through a "circus" of specialized agent personas.

## Vision

Users of AI assistants often accept outputs at face value. OpenClown acts as a post-task review layer — a "circus" of diverse expert agents that critique, question, and improve AI task outputs from different angles. The goal is safer, more thoughtful, and higher-quality AI-assisted workflows.

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **Circus** | A configured team of evaluator agents, each with a distinct persona and expertise |
| **Performer** | An individual evaluator agent within the circus (e.g., philosopher, security expert) |
| **Act** | A single evaluation run against a completed task |
| **Encore** | A re-run of the original task with evaluation feedback injected |

---

## Architecture Overview

```
User completes task via OpenClaw
        │
        ▼
   /clown triggered
   ├─ Option A: reply/quote a specific message → evaluate THAT exchange
   ├─ Option B: /clown <keyword> → fuzzy match recent task
   └─ Option C: /clown (no args) → evaluate last completed task
        │
        ▼
┌───────────────────────────┐
│   OpenClown Extension     │
│                           │
│  1. Identify target scope (reply context or last task)
│  2. Extract: user request + tool calls + response
│  3. Build evaluation context (truncate if needed)
│                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐
│  │Performer│ │Performer│ │Performer│
│  │  (哲学)  │ │ (安全)  │ │ (开发)  │
│  └────┬────┘ └────┬────┘ └────┬────┘
│       │           │           │
│       ▼           ▼           ▼
│  Evaluation  Evaluation  Evaluation
│                           │
└───────────┬───────────────┘
            ▼
   Formatted output to user
            │
            ▼
   User chooses:
     a) Accept & done
     b) Encore (re-run with feedback)
     c) Follow-up with specific performer
```

---

## Evaluation Scope — How /clown Targets What to Evaluate

One of the key design decisions. Evaluating "the entire conversation" is token-wasteful and unfocused. Instead, OpenClown supports **scoped targeting**:

### Trigger Methods (Priority Order)

| Method | How | Scope | Best For |
|--------|-----|-------|----------|
| **Reply + /clown** | Reply to a specific OpenClaw message, type `/clown` | That message + its originating user request + tool calls in between | Most precise; natural UX on WhatsApp/Telegram/Discord/Slack |
| **Keyword** | `/clown find restaurants` | Fuzzy match against recent user requests in session | When you can't reply (e.g., CLI) |
| **Last task** | `/clown` (no args) | The most recent user→assistant exchange (request + tools + response) | Quick evaluation of what just happened |

### Reply Targeting — Architecture (No SDK PR Required)

**Key insight:** `PluginCommandContext` doesn't expose reply context, but we can solve this entirely within the plugin using two hooks + a reference number system that's invisible to the user.

**The mechanism:**

```
Step 1: message_sending hook — tag outbound messages
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  OpenClaw response → message_sending hook fires
    → assign reference number (per-conversation counter)
    → cache: { ref #7 → response content + originating request + tool calls }
    → append subtle tag to message: [🎪 #7]
    → deliver to user

  User sees on WhatsApp:
    "这是Top 3餐厅：1. 鼎泰丰 (4.8⭐) ... [🎪 #7]"


Step 2: User replies to that message with /clown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  WhatsApp wraps the quoted message into the reply context.


Step 3: inbound_claim hook — extract reference from quoted text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  inbound_claim hook fires with:
    body: "[Replying to OpenClaw]\n这是Top 3餐厅：... [🎪 #7]\n[/Replying]\n/clown"
    bodyForAgent: "/clown"

  → regex parse body for [🎪 #N] → extract refNum = 7
  → store in temp cache: { senderId+channel → targetRef: 7 }


Step 4: /clown command handler — resolve target
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /clown handler fires
    → check temp cache for this sender+channel → finds targetRef: 7
    → look up ref #7 in message cache → get full evaluation scope
    → run circus evaluation
```

**Verified:** `inbound_claim.body` field DOES include the quoted message text on WhatsApp (via `[Replying to ...] ... [/Replying]` format). This is confirmed in:
- `extensions/whatsapp/src/auto-reply/monitor/message-line.ts:9-33` — reply context formatting
- `extensions/whatsapp/src/auto-reply/monitor/process-message.ts:300-335` — Body includes reply block
- `src/hooks/message-hook-mappers.ts:239-280` — body passed through to hook event

**User experience:** User just replies + `/clown`. They never need to type `#7`. The reference number is a backend mechanism.

**Tag visibility options:**
- Subtle: `[🎪 #7]` at end of message (small, non-intrusive)
- Minimal: `·7` (nearly invisible dot + number)
- Hidden: zero-width characters encoding the number (fully invisible, but fragile)
- Configurable: let user choose via `openclown.tagStyle` config

### Channel Compatibility

| Channel | Reply + /clown | /clown (last task) | /clown \<keyword\> |
|---------|---------------|--------------------|--------------------|
| **WhatsApp** | ✅ via inbound_claim.body + ref tag | ✅ | ✅ |
| **Telegram** | ✅ same mechanism | ✅ | ✅ |
| **Discord** | ✅ same mechanism | ✅ | ✅ |
| **Slack** | ✅ same mechanism | ✅ | ✅ |
| **CLI** | N/A (no reply concept) | ✅ | ✅ |
| **iMessage** | ✅ if reply context flows through | ✅ | ✅ |

### Scope Extraction Logic

```
Given a target reference number (from reply or explicit #N):
  1. Look up ref #N in message cache → get the assistant response
  2. From cache, retrieve the associated user request → "original request"
  3. From cache, retrieve tool calls between request and response → "execution trace"
  4. Evaluation context = { originalRequest, executionTrace, finalResponse }

Given no reference (bare /clown):
  1. Take the most recent cached message for this conversation
  2. Same extraction as above

Given keyword (/clown 餐厅):
  1. Fuzzy search cached messages by content match
  2. Take best match, same extraction as above
```

---

## Technical Integration with OpenClaw

### Plugin Type
- **Standalone npm package** (independent repo), installable via `openclaw plugin install openclown`
- Uses `openclaw/plugin-sdk/*` public API surface only
- Later optionally merged as a bundled extension

### Key Integration Points

| OpenClaw Surface | Usage in OpenClown |
|------------------|--------------------|
| `definePluginEntry()` | Register the plugin |
| `api.registerCommand("clown")` | `/clown` slash command |
| `agent_end` hook | Cache session messages + optional auto-trigger |
| `runtime.subagent.run()` | Run performer evaluations (Phase 3) |
| `before_prompt_build` hook | Inject evaluation feedback for encore re-runs |
| `configSchema` | User-customizable circus configuration |

### SDK Gap: Transcript Access (CONFIRMED)

**Problem:** `PluginCommandContext` (passed to command handlers) does **NOT** include `sessionKey`, `sessionId`, or any transcript access. The `runtime.subagent.getSessionMessages()` API exists but requires a `sessionKey` which is not available in command context.

**Solution — Hybrid Hook + Command Architecture:**

```
agent_end hook fires
    → receives event.messages (full message list)
    → cache in memory: Map<sessionKey, CachedTranscript>
    → also cache: Map<channelKey, sessionKey> for lookup

/clown command fires
    → look up cached transcript via channel context (senderId + channelId)
    → if reply context: find target message in cache, extract scope
    → if no reply: use last task from cache
    → run evaluation on extracted scope
```

This avoids the SDK gap entirely. The `agent_end` hook gives us everything we need.

**Future improvement:** Submit a PR to OpenClaw adding `sessionKey` to `PluginCommandContext` for cleaner access.

### SDK Gap #2: Reply Context Not in PluginCommandContext — SOLVED VIA WORKAROUND

**Original problem:** `PluginCommandContext` doesn't expose `replyToId`/`replyToBody`. But reply context IS available in `inbound_claim.body` (the full message body including `[Replying to ...]` block).

**Solution:** Two-hook architecture (see "Reply Targeting — Architecture" above):
1. `message_sending` hook tags outbound messages with `[🎪 #N]`
2. `inbound_claim` hook extracts `#N` from quoted text in `body` field
3. Command handler reads from temp cache

**No OpenClaw PR required.** This works today with the existing SDK surface.

**Optional future PR:** Adding `replyToId`/`replyToBody` to `PluginCommandContext` would simplify the flow (no need for reference tags), but it's a nice-to-have, not a blocker.

### WhatsApp-Specific Notes

- WhatsApp reply context extraction: `extensions/whatsapp/src/inbound/extract.ts` → `describeReplyContext()`
- Parses `proto.IContextInfo.quotedMessage` from Baileys protobuf
- Reply context flows into `inbound_claim.body` via `[Replying to <sender>] ... [/Replying]` format
- Confirmed in: `extensions/whatsApp/src/auto-reply/monitor/message-line.ts:9-33`
- WhatsApp has no native `/` command UI — user types `/clown` as plain text, gateway recognizes it

### Model Selection

- **Default:** Use the same model as the user's OpenClaw agent config (inherit from environment)
- **Customizable:** Users can set `openclown.model` to override (e.g., use a cheaper model for evaluations)
- In `subagent.run()`, pass `provider` and `model` params if custom; omit to inherit defaults

---

## Data Flow — Input

### From `agent_end` Hook (Primary)

```typescript
api.on("agent_end", async (event) => {
  // event.messages: full message array from the completed agent run
  // event.success: whether the run completed successfully
  // Cache these for the /clown command to use later
});
```

### Cached Transcript Structure

```typescript
type CachedTranscript = {
  sessionKey: string;
  messages: AgentMessage[];     // Full message list from agent_end
  completedAt: number;          // Timestamp
  channelKey: string;           // For lookup from command handler
};

// In-memory cache, TTL ~30 minutes, max ~10 sessions
const transcriptCache = new Map<string, CachedTranscript>();
```

### Scope Extraction from Cache

Given a reply/quote targeting a specific message:
```typescript
type EvaluationScope = {
  originalRequest: string;       // The user's ask
  executionTrace: ToolCall[];    // All tool calls + results
  finalResponse: string;         // What OpenClaw delivered
  messageCount: number;          // For token estimation
  estimatedTokens: number;       // Rough count for cost display
};
```

---

## Data Flow — Output

Evaluation results are returned as a formatted message in the current session:

```
🎪 OpenClown Evaluation
━━━━━━━━━━━━━━━━━━━━━━

📋 Evaluating: "给我找top 3高分餐厅"

🎭 哲学家 (Philosopher)
Rating上的"top"是谁定义的？Google评分体系本身就有偏见...
Severity: 💡 Insight

🔒 安全专家 (Security)
抓取餐厅数据时暴露了用户精确位置坐标，建议模糊化处理...
Severity: ⚠️ Warning

💻 开发大拿 (Developer)
API调用没有错误处理，如果Google Maps API返回429会直接crash...
Severity: 🔴 Critical

━━━━━━━━━━━━━━━━━━━━━━
Reply: [1] Encore (re-run) | [2] Chat with a performer | [3] Done
```

---

## Configuration Schema

```yaml
openclown:
  enabled: true
  autoEvaluate: false              # Auto-trigger on agent_end
  model: null                      # null = inherit from user's openclaw config
  maxTranscriptTokens: 4000        # Truncate long transcripts to save tokens
  circus:
    - name: "哲学家"
      id: "philosopher"
      emoji: "🎭"
      prompt: |
        你是一个哲学家，从认识论、伦理和价值观角度审视AI的输出。
        关注：假设是否合理？定义是否清晰？是否存在隐含偏见？
        保持简洁，2-3句话。
      severity: "insight"           # default severity level

    - name: "安全专家"
      id: "security"
      emoji: "🔒"
      prompt: |
        你是一个安全专家，关注数据安全、隐私、系统稳定性。
        关注：是否暴露敏感信息？API调用是否安全？是否有注入风险？
        保持简洁，2-3句话。
      severity: "warning"

    - name: "开发大拿"
      id: "developer"
      emoji: "💻"
      prompt: |
        你是一个资深开发者，关注代码质量、性能、可维护性。
        关注：实现方式是否最优？是否有边界情况未处理？错误处理是否完善？
        保持简洁，2-3句话。
      severity: "critical"
```

Users can override this in their OpenClaw config to customize their circus.

---

## Phased Implementation Plan

### Phase 1 — MVP: Single-Agent Serial Evaluation (~3-5 days)

**Goal:** `/clown` command works, reads cached transcript, outputs multi-perspective evaluation.

**Tasks:**
- [ ] Initialize repo: `package.json`, TypeScript config, build setup
- [ ] Scaffold extension entry with `definePluginEntry()`
- [ ] Register `/clown` command via `api.registerCommand()`
- [ ] Implement `agent_end` hook to cache session messages in memory
- [ ] Implement scope extractor: given cached messages, extract evaluation context
- [ ] Support `/clown` (last task) targeting — simplest case first
- [ ] Implement evaluation engine (single LLM call, serial role-play for each performer)
- [ ] Build evaluation prompt template (inject scoped context + performer persona)
- [ ] Format and return evaluation output
- [ ] Default circus config with 3 performers (philosopher, security, developer)
- [ ] Basic error handling (no cached session, empty transcript, etc.)
- [ ] Manual testing with a real OpenClaw instance

**Technical notes:**
- Phase 1 uses a single agent that serially role-plays each performer (simplest approach)
- Transcript truncation: cap at `maxTranscriptTokens` config value
- Output via command handler return `{ text: "..." }`
- Reply/quote targeting deferred to Phase 1.5 (needs channel-specific reply context parsing)

**Not in scope:** re-run, follow-up chat, auto-trigger, custom config, reply targeting.

---

### Phase 1.5 — Reply Targeting + Keyword Search (~2-3 days)

**Goal:** Users can reply to a specific OpenClaw message to scope the evaluation. No OpenClaw PR needed.

**Tasks:**
- [ ] Implement `message_sending` hook: tag outbound messages with `[🎪 #N]`, cache message + context
- [ ] Implement `inbound_claim` hook: parse `[🎪 #N]` from `body` field (quoted text), store in temp lookup cache
- [ ] Wire command handler to read from temp lookup cache → resolve reply target to ref number
- [ ] `/clown <keyword>` fuzzy matching against cached messages by content
- [ ] Tag style config: `openclown.tagStyle` (subtle/minimal/hidden)
- [ ] Test reply + `/clown` on WhatsApp (primary test channel)
- [ ] Test on Telegram, Discord, Slack (verify `[Replying to ...]` format per channel)

**Technical notes:**
- `inbound_claim.body` contains `[Replying to <sender>]\n<quoted text>\n[/Replying]` on WhatsApp (confirmed)
- Regex to extract: `/\[🎪 #(\d+)\]/` from body
- Temp lookup cache TTL: ~5 seconds (only needs to survive between inbound_claim and command handler)
- Message cache TTL: ~30 minutes (needs to survive until user decides to /clown)
- Verify that Telegram/Discord/Slack format the reply context similarly in `inbound_claim.body`

---

### Phase 2 — Closed Loop: Encore & Follow-up (~3-5 days)

**Goal:** Users can re-run the original task with feedback, or chat with a specific performer.

**Tasks:**
- [ ] Implement encore (re-run): extract original request, inject circus feedback as system context
- [ ] `/clown encore` sub-command: triggers re-run via `runtime.subagent.run()`
- [ ] `/clown chat <performer_id>` sub-command: opens interactive follow-up with a specific performer
- [ ] State management: store last evaluation result for follow-up reference
- [ ] `agent_end` hook: optional auto-trigger with config flag `autoEvaluate`
- [ ] Safety warning before encore if original task had side effects (sent messages, wrote files)
- [ ] Handle edge cases: no previous evaluation for encore, invalid performer ID
- [ ] Test encore flow end-to-end

**Technical notes:**
- Encore injects feedback via `extraSystemPrompt` parameter in `subagent.run()`
- Follow-up chat creates a temporary session with the performer's system prompt
- State stored in-memory per session (no persistence needed yet)
- Side effect detection: check if tool calls include send/write/delete actions

---

### Phase 3 — True Circus: Parallel Subagents (~5-7 days)

**Goal:** Each performer runs as an independent subagent in parallel.

**Tasks:**
- [ ] Migrate from serial single-agent to parallel `subagent.run()` calls
- [ ] Each performer gets its own session with dedicated system prompt
- [ ] Implement result aggregation: wait for all performers, merge outputs
- [ ] Add `configSchema` for user-customizable circus via OpenClaw config
- [ ] Config validation: ensure circus has at least 1 performer, prompts are non-empty
- [ ] Debate mode: performers can see each other's evaluations and respond
- [ ] `/clown config` sub-command: view/edit circus from CLI
- [ ] Performance optimization: parallel execution, timeout handling

**Technical notes:**
- Use `Promise.all()` with `subagent.run()` + `subagent.waitForRun()` for parallel execution
- Debate mode: second round where each performer sees all first-round evaluations
- Timeout: 30s per performer, fail gracefully if one times out

---

### Phase 4 — Polish & Ecosystem (~3-5 days)

**Goal:** Production-ready quality, good DX, useful defaults.

**Tasks:**
- [ ] Severity tagging system (insight / warning / critical)
- [ ] Evaluation history: persist evaluations to disk for later review
- [ ] `/clown history` sub-command: view past evaluations
- [ ] Token cost estimation: show estimated cost before running evaluation
- [ ] Transcript summarization: smart truncation for long conversations
- [ ] CLI output polish: colors, tables, mobile-friendly formatting
- [ ] Preset circus templates (e.g., "security-focused", "code-review", "creative")
- [ ] README, docs, npm publish
- [ ] Integration with OpenClaw memory plugin: store learnings from evaluations

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Token cost** — transcript sent to N performers | High cost per evaluation | Scoped targeting (reply/quote); truncation; token budget config |
| **SDK gap** — no sessionKey in command context | Blocks direct transcript access | Hybrid hook+command architecture (already solved) |
| **Reply tag parsing** — `inbound_claim.body` format may vary across channels | Reply targeting breaks on untested channels | Verify `[Replying to ...]` format on each channel; fall back to last-task if parsing fails |
| **Re-run safety** — encore re-executes side effects | Duplicate messages, data corruption | Safety warning; dry-run mode; side-effect detection |
| **Prompt quality** — bad performer prompts = useless evals | Low value output | Iterate on prompts; let users customize; collect feedback |
| **Latency** — serial evaluation is slow | Bad UX on mobile | Move to parallel subagents in Phase 3 |
| **Mobile UX** — long output on small screens | Hard to read | Keep evaluations concise (2-3 sentences per performer) |
| **Cache staleness** — user triggers /clown long after task | Wrong context evaluated | TTL on cache (30min); clear message if no recent task found |

---

## Open Questions (Resolved & Remaining)

### Resolved
1. ~~**Transcript access**~~ → SDK does NOT expose sessionKey in command context. **Solution:** hybrid hook+command with in-memory cache.
2. ~~**Re-run scope**~~ → Evaluate scoped exchange (not entire conversation). Encore re-runs only the original request with feedback injected.
3. ~~**Performer model**~~ → Default inherits from user's openclaw config. Customizable via `openclown.model`.

### Resolved (cont.)
4. ~~**Reply context per channel**~~ → `PluginCommandContext` doesn't expose it, but `inbound_claim.body` contains quoted text with our `[🎪 #N]` tag. Fully solved via two-hook architecture, no SDK PR needed.

### Remaining
5. **Persistence format**: Where to store evaluation history (Phase 4)? Separate JSONL under `~/.openclaw/openclown/`? Or leverage session system?
6. **Auth/billing**: Evaluation subagent calls consume the user's existing API quota. Should we warn about cost?
7. **Plugin install UX**: What's the exact `openclaw plugin install` flow for third-party packages? Need to verify.

---

## Tech Stack

- **Language:** TypeScript (ESM)
- **Runtime:** Bun (dev) / Node 22+ (production)
- **Build:** tsup or unbuild
- **Test:** Vitest
- **Lint/Format:** oxlint + oxfmt (match openclaw conventions)
- **Package manager:** pnpm
- **Publish:** npm (`@openclown/plugin` or `openclaw-plugin-openclown`)

---

## File Structure (Planned)

```
openclown/
├── PLAN.md                  # This file
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts             # Plugin entry (definePluginEntry)
│   ├── commands/
│   │   ├── clown.ts         # /clown command handler (dispatch)
│   │   ├── encore.ts        # /clown encore sub-command
│   │   └── chat.ts          # /clown chat <performer> sub-command
│   ├── circus/
│   │   ├── types.ts         # Performer, Circus, Evaluation types
│   │   ├── defaults.ts      # Default circus configuration (3 performers)
│   │   ├── engine.ts        # Evaluation orchestration (serial → parallel)
│   │   └── prompt.ts        # Evaluation prompt templates
│   ├── transcript/
│   │   ├── cache.ts         # In-memory transcript cache (from agent_end hook)
│   │   ├── extractor.ts     # Extract scoped evaluation context from messages
│   │   └── summarizer.ts    # Truncate/summarize long transcripts
│   ├── hooks/
│   │   └── agent-end.ts     # agent_end hook: cache messages for /clown
│   ├── output/
│   │   └── formatter.ts     # Format evaluation results for display
│   └── config/
│       └── schema.ts        # Plugin config schema
├── test/
│   ├── circus/
│   │   └── engine.test.ts
│   ├── transcript/
│   │   ├── cache.test.ts
│   │   └── extractor.test.ts
│   └── fixtures/
│       └── sample-transcript.jsonl
└── .gitignore
```

---

## Timeline Summary

| Phase | Scope | Duration | Cumulative |
|-------|-------|----------|-----------|
| Phase 1 | MVP: `/clown` with serial evaluation | 3-5 days | Week 1 |
| Phase 1.5 | Reply/quote scoped targeting | 2-3 days | Week 1-2 |
| Phase 2 | Closed loop: encore + follow-up | 3-5 days | Week 2-3 |
| Phase 3 | Parallel subagents + custom circus | 5-7 days | Week 3-4 |
| Phase 4 | Polish, history, presets, publish | 3-5 days | Week 4-5 |

**Total estimated: 4-5 weeks to full feature set, ~1 week to usable MVP.**
