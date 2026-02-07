export interface GameConfig {
  players: number;
  model: string;
  maxTurns: number;
  turnDelay: number;
  logFile: string | null;
  seed: number | undefined;
  verbose: boolean;
}

export function parseArgs(argv: string[]): GameConfig {
  const config: GameConfig = {
    players: 2,
    model: 'claude-sonnet-4-20250514',
    maxTurns: 500,
    turnDelay: 500,
    logFile: null,
    seed: undefined,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--players':
        config.players = parseInt(argv[++i], 10);
        if (config.players < 2 || config.players > 4) {
          console.error('Players must be between 2 and 4');
          process.exit(1);
        }
        break;
      case '--model':
        config.model = argv[++i];
        break;
      case '--max-turns':
        config.maxTurns = parseInt(argv[++i], 10);
        break;
      case '--turn-delay':
        config.turnDelay = parseInt(argv[++i], 10);
        break;
      case '--log-file':
        config.logFile = argv[++i];
        break;
      case '--seed':
        config.seed = parseInt(argv[++i], 10);
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown option: ${argv[i]}`);
        printHelp();
        process.exit(1);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
Monopoly Eval — LLM vs LLM Monopoly Simulation

Usage: npx tsx src/index.ts [options]

Options:
  --players <n>        Number of players (2-4, default: 2)
  --model <model>      Anthropic model to use (default: claude-sonnet-4-20250514)
  --max-turns <n>      Maximum turns before game ends (default: 500)
  --turn-delay <ms>    Delay between actions in ms (default: 500)
  --log-file <path>    Write game log to JSON file
  --seed <n>           Random seed for reproducible games
  --verbose            Show detailed LLM interactions
  --help               Show this help message

Environment:
  ANTHROPIC_API_KEY    Required. Your Anthropic API key.

Example:
  npx tsx src/index.ts --players 3 --model claude-sonnet-4-20250514 --seed 42
`);
}
