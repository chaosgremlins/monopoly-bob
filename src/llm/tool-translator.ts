import { AvailableAction, ParameterSchema } from '../engine/types';
import { ToolDefinition } from './types';

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
