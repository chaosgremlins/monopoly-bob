import chalk from 'chalk';
import { ColorGroup } from '../engine/types';

export const COLOR_MAP: Record<ColorGroup, (text: string) => string> = {
  brown: chalk.rgb(139, 69, 19),
  light_blue: chalk.rgb(135, 206, 235),
  pink: chalk.rgb(255, 105, 180),
  orange: chalk.rgb(255, 165, 0),
  red: chalk.red,
  yellow: chalk.yellow,
  green: chalk.green,
  dark_blue: chalk.blue,
};

export const PLAYER_COLORS = [
  chalk.cyan,
  chalk.magenta,
  chalk.yellowBright,
  chalk.greenBright,
];

export const DIM = chalk.dim;
export const BOLD = chalk.bold;
export const MONEY = chalk.green;
export const DANGER = chalk.red;
export const HIGHLIGHT = chalk.bgYellow.black;
