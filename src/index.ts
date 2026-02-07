import React from 'react';
import { render } from 'ink';
import { parseArgs } from './config';
import { GameLoop } from './game-loop';
import { AnthropicAdapter } from './llm/anthropic-adapter';
import { InkRenderer } from './display/ink-renderer';
import { App } from './display/ink-app';

async function main() {
  const config = parseArgs(process.argv);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
    console.error('Set it in your .env file or environment.');
    process.exit(1);
  }

  const inkRenderer = new InkRenderer();

  // Mount the Ink app
  const { unmount, waitUntilExit } = render(
    React.createElement(App, { renderer: inkRenderer }),
  );

  const gameLoop = new GameLoop(
    config,
    () => new AnthropicAdapter({
      model: config.model,
      apiKey: process.env.ANTHROPIC_API_KEY,
    }),
    inkRenderer,
  );

  try {
    await gameLoop.run();
    // Keep the UI visible for a moment after game over
    await new Promise(resolve => setTimeout(resolve, 2000));
    unmount();
    process.exit(0);
  } catch (error) {
    unmount();
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
