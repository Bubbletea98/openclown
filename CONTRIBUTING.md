# Contributing to OpenClown

Thanks for your interest in contributing! OpenClown is a community-driven project and we welcome contributions of all kinds — bug fixes, new performers, documentation improvements, and feature ideas.

## Getting started

### Prerequisites

- Node 22.16+ (Node 24 recommended)
- npm

### Setup

```bash
git clone https://github.com/Bubbletea98/openclown.git
cd openclown
npm install
npm run build
npm test
```

### Development workflow

```bash
npm run dev       # Watch mode — rebuilds on file changes
npm test          # Run all tests
npm run check     # TypeScript type checking (no emit)
npm run format    # Check formatting
npm run format:fix # Auto-fix formatting
```

## How to contribute

### Reporting bugs

Open an [issue](https://github.com/Bubbletea98/openclown/issues/new?template=bug_report.md) with:

- What you expected vs. what happened
- Steps to reproduce
- Your environment (Node version, OpenClaw version, channel)

### Suggesting features

Open an [issue](https://github.com/Bubbletea98/openclown/issues/new?template=feature_request.md) describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Submitting a pull request

1. **Fork** the repo and create a branch from `main`
2. **Make your changes** — keep them focused on one thing
3. **Add tests** if you're changing behavior
4. **Run `npm test`** and make sure all tests pass
5. **Run `npm run check`** to verify types
6. **Open a PR** with a clear title and description

### Adding a new performer

This is the easiest way to contribute! Each performer is a self-contained `SKILL.md` file.

1. Create a new directory under `skills/`:
   ```
   skills/your-performer/SKILL.md
   ```

2. Follow the frontmatter format:
   ```markdown
   ---
   id: yourperformer
   names:
     en: Your Performer
   emoji: "🔧"
   severity: insight
   category: serious
   ---

   # Your Performer

   You are a [role], evaluating an AI assistant's task execution.

   ## What to Examine
   - [criteria]

   ## Output Format
   2-3 sentences. Write in the same language as the original user request.
   ```

3. Guidelines for good performers:
   - **Be specific** — a clear evaluation lens is better than a vague one
   - **Keep output concise** — 2-3 sentences, not paragraphs
   - **Add multilingual names** if you can (`zh`, `ja`, `ko`, `fr`, `es`)
   - **Use gender-neutral language** in all translations
   - **Use object/symbol emoji** rather than gendered person emoji
   - **Choose the right severity**: `insight` (observations), `warning` (potential issues), `critical` (serious problems)
   - **Choose the right category**: `serious` (professional perspectives) or `fun` (entertaining but still useful)

4. Test it by running OpenClown with your new performer enabled.

## Code style

- TypeScript with ESM modules
- Formatting enforced by Prettier (`npm run format:fix`)
- No unnecessary dependencies — the project intentionally has zero runtime dependencies
- Keep things simple — don't abstract until you have to

## Project structure

```
src/
├── commands/        # /clown command handler
├── circus/          # Performer loading, evaluation engine, prompts
├── providers/       # LLM caller (via OpenClaw subagent runtime)
├── transcript/      # Exchange cache, message parsing
├── hooks/           # OpenClaw lifecycle hooks
├── output/          # Evaluation result formatting
└── config/          # Plugin config schema

skills/              # Built-in performer definitions (SKILL.md files)
test/                # Vitest tests
```

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
