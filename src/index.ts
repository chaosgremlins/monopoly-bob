import { parseArgs } from './config';
import { GameLoop } from './game-loop';
import { AnthropicAdapter } from './llm/anthropic-adapter';

async function main() {
  const config = parseArgs(process.argv);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
    console.error('Set it in your .env file or environment.');
    process.exit(1);
  }

  console.log(`Starting Monopoly Eval with ${config.players} players using ${config.model}`);
  if (config.seed !== undefined) {
    console.log(`Using random seed: ${config.seed}`);
  }

  const gameLoop = new GameLoop(config, () => {
    return new AnthropicAdapter({
      model: config.model,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  });

  try {
    const finalState = await gameLoop.run();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
