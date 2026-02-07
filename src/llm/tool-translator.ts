import { AvailableAction, ParameterSchema } from '../engine/types';
import { ToolDefinition } from './types';

/**
 * Static tool definitions that NEVER change between calls.
 * This is critical for prompt caching — tools come first in the cache
 * hierarchy (tools → system → messages), so if tools change, the entire
 * cache is invalidated.
 *
 * Available actions are communicated via the turn message text instead.
 */
export const STATIC_TOOLS: ToolDefinition[] = [
  {
    name: 'roll_dice',
    description: 'Roll the dice to move.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'buy_property',
    description: 'Buy the property you landed on.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'auction_property',
    description: 'Decline to buy. The property goes to auction.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'build_house',
    description: 'Build a house on a property you own a monopoly of.',
    input_schema: {
      type: 'object',
      properties: {
        property_position: {
          type: 'number',
          description: 'Board position of the property to build on.',
        },
      },
      required: ['property_position'],
    },
  },
  {
    name: 'build_hotel',
    description: 'Upgrade a property from 4 houses to a hotel.',
    input_schema: {
      type: 'object',
      properties: {
        property_position: {
          type: 'number',
          description: 'Board position of the property to upgrade.',
        },
      },
      required: ['property_position'],
    },
  },
  {
    name: 'sell_house',
    description: 'Sell a house from a property to raise cash.',
    input_schema: {
      type: 'object',
      properties: {
        property_position: {
          type: 'number',
          description: 'Board position of the property to sell a house from.',
        },
      },
      required: ['property_position'],
    },
  },
  {
    name: 'mortgage_property',
    description: 'Mortgage a property to raise cash. No rent is collected while mortgaged.',
    input_schema: {
      type: 'object',
      properties: {
        property_position: {
          type: 'number',
          description: 'Board position of the property to mortgage.',
        },
      },
      required: ['property_position'],
    },
  },
  {
    name: 'unmortgage_property',
    description: 'Unmortgage a property to start collecting rent again.',
    input_schema: {
      type: 'object',
      properties: {
        property_position: {
          type: 'number',
          description: 'Board position of the property to unmortgage.',
        },
      },
      required: ['property_position'],
    },
  },
  {
    name: 'trade_offer',
    description: 'Propose a trade with another player.',
    input_schema: {
      type: 'object',
      properties: {
        target_player_id: {
          type: 'string',
          description: 'ID of the player to trade with.',
        },
        offered_properties: {
          type: 'array',
          items: { type: 'number' },
          description: 'Board positions of properties you are offering.',
        },
        offered_money: {
          type: 'number',
          description: 'Amount of money you are offering.',
        },
        requested_properties: {
          type: 'array',
          items: { type: 'number' },
          description: 'Board positions of properties you want.',
        },
        requested_money: {
          type: 'number',
          description: 'Amount of money you want.',
        },
      },
      required: ['target_player_id'],
    },
  },
  {
    name: 'accept_trade',
    description: 'Accept the pending trade offer.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'reject_trade',
    description: 'Reject the pending trade offer.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'end_turn',
    description: 'End your turn.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'declare_bankruptcy',
    description: 'Declare bankruptcy. You are eliminated from the game.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'use_get_out_of_jail_card',
    description: 'Use a Get Out of Jail Free card.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'pay_jail_fine',
    description: 'Pay $50 to get out of jail.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'submit_bid',
    description: 'Submit your bid in an auction. Bid 0 to pass.',
    input_schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Your bid amount (0 to pass).',
        },
      },
      required: ['amount'],
    },
  },
];

/**
 * Format available actions as text for the turn message.
 * This replaces the dynamic tool approach — the LLM sees which actions
 * are valid in the message, not in the tool definitions.
 */
export function formatAvailableActions(actions: AvailableAction[]): string {
  const lines: string[] = ['AVAILABLE ACTIONS (choose exactly one):'];
  for (const action of actions) {
    let line = `  - ${action.action}: ${action.description}`;
    if (action.parameters) {
      const params = Object.entries(action.parameters).map(([key, schema]) => {
        let desc = `${key} (${schema.type})`;
        if (schema.enum) desc += ` — valid values: ${schema.enum.join(', ')}`;
        return desc;
      });
      line += ` [params: ${params.join('; ')}]`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// Keep the old function for backwards compatibility but it's no longer used for caching
export function translateActionsToTools(actions: AvailableAction[]): ToolDefinition[] {
  return actions.map(action => ({
    name: action.action,
    description: action.description,
    input_schema: {
      type: 'object' as const,
      properties: action.parameters
        ? convertParameters(action.parameters)
        : {},
      required: action.required ?? [],
    },
  }));
}

function convertParameters(
  params: Record<string, ParameterSchema>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(params)) {
    result[key] = convertParameterSchema(schema);
  }

  return result;
}

function convertParameterSchema(schema: ParameterSchema): unknown {
  const result: Record<string, unknown> = {
    type: schema.type,
    description: schema.description,
  };

  if (schema.enum) {
    result.enum = schema.enum;
  }

  if (schema.type === 'object' && schema.properties) {
    result.properties = convertParameters(schema.properties);
    if (schema.required) {
      result.required = schema.required;
    }
  }

  if (schema.type === 'array' && schema.items) {
    result.items = convertParameterSchema(schema.items);
  }

  return result;
}
