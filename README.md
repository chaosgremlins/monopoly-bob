# Monopoly Eval

A terminal-based Monopoly simulation where LLM agents play against each other using Anthropic Claude's tool-use API. Watch AI players buy properties, build houses, negotiate trades, and try to bankrupt each other — all rendered live in your terminal.

```
              VISIT   ST.CH  ELCT  STATES VRGNA  PNSLVA ST.JA  COM    TEN    NY     FREE
              JAIL    AVE    COMP  AVE    AVE    RAIL   AVE    CHEST  AVE    AVE    PARK
              ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
              │      │  A   │      │      │      │      │      │      │  B   │      │      │
              ├──────┼──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┼──────┤
              │      │                                                              │      │
              │CNNCT │                       M O N O P O L Y                        │KNTKY │
              ├──────┤                                                              ├──────┤
              │      │          Alice   $1,240  ████████████                        │      │
              │VERMNT│          Bob     $  890  ████████                            │ CHNC │
              ├──────┤          Charlie $  650  ██████                              ├──────┤
              │      │          Diana   $1,450  █████████████                       │      │
              │ CHNC │                                                              │ IND  │
              ├──────┤                                                              ├──────┤
              │  C   │                                                              │      │
              │ORNTL │                                                              │ ILL  │
              └──────┴──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┴──────┘
              START   MEDTRN COM    BALTIC TAX    READ   ORNTL  CHNC   VERMNT CNNCT
                      AVE    CHEST  AVE           RAIL   AVE           AVE    AVE
```

## Features

- **Full Monopoly rules** — property buying, auctions, rent, houses/hotels, trading, mortgages, jail, Chance/Community Chest cards, bankruptcy
- **2-4 AI players** with distinct strategic personalities (aggressive developer, railroad baron, shrewd trader, conservative)
- **Live terminal UI** built with [Ink](https://github.com/vadimdemedes/ink) — board ring, player panel, scrolling event log, real-time API stats
- **Prompt caching** — static tool definitions + cache breakpoints keep costs down (~35% cache hit rate)
- **Scenario seeding** — start games from custom mid-game states with pre-owned properties and balances
- **Reproducible games** — seeded PRNG for deterministic dice rolls
- **Game logging** — full game history as JSON for post-game analysis

## Prerequisites

- [Bun](https://bun.sh) runtime
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

```bash
git clone <repo-url>
cd monopoly-eval
bun install
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
# Quick 2-player game
bun src/index.ts

# 4-player game with Haiku (cheaper)
bun src/index.ts --players 4 --model claude-haiku-4-5-20251001

# Reproducible game with a fixed seed
bun src/index.ts --players 3 --seed 42

# Load a mid-game scenario
bun src/index.ts --players 2 --scenario-file scenarios/late-game.json

# Full options
bun src/index.ts --players 4 --model claude-sonnet-4-20250514 --max-turns 200 --turn-delay 300 --seed 42 --log-file game.json
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--players <n>` | `2` | Number of players (2-4) |
| `--model <model>` | `claude-sonnet-4-20250514` | Anthropic model ID |
| `--max-turns <n>` | `500` | Turn limit before the game ends |
| `--turn-delay <ms>` | `500` | Delay between actions (ms) |
| `--log-file <path>` | none | Write game log to JSON |
| `--seed <n>` | random | Random seed for dice |
| `--scenario-file <path>` | none | Load initial state from JSON |
| `--verbose` | `false` | Show detailed LLM interactions |

## Player Personalities

Each AI player has a distinct strategy baked into their system prompt:

| Player | Style | Approach |
|---|---|---|
| **Alice** | Aggressive Developer | Buys everything, builds immediately, targets orange/red, willing to go cash-poor |
| **Bob** | Railroad Baron | Prioritizes railroads/utilities, keeps cash reserves, plays the long game |
| **Charlie** | Shrewd Trader | Accumulates trading chips, proposes deals, targets cheap color groups, drives up auction prices |
| **Diana** | Conservative | Maintains large cash reserves, buys selectively, builds incrementally, rejects bad trades |

## Scenario Files

Seed a game with a custom starting state. Scenario JSON format:

```json
{
  "players": [
    {
      "name": "Alice",
      "balance": 800,
      "position": 0,
      "properties": [
        { "position": 6, "houses": 2 },
        { "position": 8, "houses": 2 },
        { "position": 9, "houses": 2 }
      ]
    },
    {
      "name": "Bob",
      "balance": 900,
      "position": 20,
      "properties": [
        { "position": 16, "houses": 0 },
        { "position": 18, "houses": 0 },
        { "position": 19, "houses": 0 }
      ]
    }
  ]
}
```

Player fields (all optional except properties need position):
- `name` — display name
- `balance` — starting cash
- `position` — board position (0-39)
- `properties` — array of `{ position, houses?, mortgaged? }`
- `inJail` — start in jail
- `getOutOfJailCards` — number of GOOJF cards

## Architecture

```
src/
  index.ts                  # Entry point — mounts Ink app, starts game loop
  config.ts                 # CLI argument parsing
  game-loop.ts              # Orchestrator: turn flow, LLM calls, history management
  logger.ts                 # JSON game log writer

  engine/                   # Pure game engine (no LLM dependency)
    types.ts                # GameState, Player, Property, Event types
    game-state.ts           # State creation, scenario application
    game-engine.ts          # Action validation, state transitions
    board-data.ts           # All 40 board spaces
    bank.ts                 # Banking operations (rent, transfers)
    rent-calculator.ts      # Rent computation (houses, hotels, monopolies)
    cards.ts                # Chance & Community Chest decks
    dice.ts                 # Seeded PRNG (mulberry32)
    actions/                # Individual action handlers

  llm/                      # LLM adapter layer
    types.ts                # Adapter interface, ChatMessage, ToolCall types
    anthropic-adapter.ts    # Anthropic SDK integration with prompt caching
    tool-translator.ts      # Static tool definitions, available action formatting
    prompt-builder.ts       # System prompts, turn messages, build hints

  display/                  # Terminal UI
    ink-app.tsx             # Root Ink component
    ink-board.tsx           # Board ring renderer
    ink-player-panel.tsx    # Player info bar
    ink-event-log.tsx       # Scrolling event ticker
    ink-stats-bar.tsx       # Live API usage stats
    ink-renderer.ts         # Bridge between imperative game loop and reactive UI
    renderer.ts             # Fallback plain-text renderer

scenarios/                  # Example scenario files
tests/                      # Test suite (bun:test)
```

The engine is fully decoupled from the LLM layer. The game loop drives a phase-based state machine (`pre_roll` -> `awaiting_roll` -> `post_roll_land` -> `purchase_decision`/`auction`/`paying_debt` -> `post_action` -> `turn_complete`) and translates between LLM tool calls and engine actions.

## Tests

```bash
bun test
```

149 tests covering the game engine, board data, rent calculations, banking, cards, dice, scenario seeding, and conversation history sanitization.

## Cost Notes

A typical 4-player, 100-turn game uses roughly:
- ~120k input tokens (~35% served from cache)
- ~600 output tokens
- ~100 API calls

Using `claude-haiku-4-5-20251001` is significantly cheaper for experimentation. Prompt caching is automatic — static tool definitions and the system prompt (with full board reference) form a stable cache prefix.

## License

MIT
