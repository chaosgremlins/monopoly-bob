import { describe, test, expect } from 'bun:test';
import { sanitizeHistory } from '../src/game-loop';
import { ChatMessage, ContentBlock } from '../src/llm/types';

describe('sanitizeHistory', () => {
  test('passes through clean history unchanged', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'roll_dice', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool_1', content: 'Rolled 7' },
        ],
      },
    ];

    const result = sanitizeHistory(history);
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
    expect(result[2].role).toBe('user');
  });

  test('inserts synthetic tool_result when assistant tool_use has no following tool_result', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Your turn' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'roll_dice', input: {} },
        ],
      },
      // Missing tool_result — next is a plain user message
      { role: 'user', content: 'Please try again' },
    ];

    const result = sanitizeHistory(history);
    expect(result).toHaveLength(4);
    // Should insert a synthetic tool_result after the assistant message
    expect(result[2].role).toBe('user');
    const blocks = result[2].content as ContentBlock[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('tool_result');
    expect((blocks[0] as any).tool_use_id).toBe('tool_1');
    // Original "Please try again" should follow
    expect(result[3].content).toBe('Please try again');
  });

  test('inserts synthetic tool_result when assistant tool_use is last message', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Your turn' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'roll_dice', input: {} },
        ],
      },
      // No following message at all
    ];

    const result = sanitizeHistory(history);
    expect(result).toHaveLength(3);
    expect(result[2].role).toBe('user');
    const blocks = result[2].content as ContentBlock[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('tool_result');
    expect((blocks[0] as any).tool_use_id).toBe('tool_1');
  });

  test('patches missing tool_results when assistant has multiple tool_use blocks', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Your turn' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'roll_dice', input: {} },
          { type: 'tool_use', id: 'tool_2', name: 'buy_property', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          // Only has tool_result for tool_1, missing tool_2
          { type: 'tool_result', tool_use_id: 'tool_1', content: 'Rolled 7' },
        ],
      },
    ];

    const result = sanitizeHistory(history);
    expect(result).toHaveLength(3);
    const blocks = result[2].content as ContentBlock[];
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as any).tool_use_id).toBe('tool_1');
    expect((blocks[1] as any).tool_use_id).toBe('tool_2');
    expect((blocks[1] as any).content).toBe('Acknowledged.');
  });

  test('handles multiple orphaned tool_use blocks in sequence', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Turn 1' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'roll_dice', input: {} },
        ],
      },
      // Missing tool_result for tool_1
      { role: 'user', content: 'Turn 2' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool_2', name: 'end_turn', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool_2', content: 'Turn ended' },
        ],
      },
    ];

    const result = sanitizeHistory(history);
    expect(result).toHaveLength(6);
    // Synthetic tool_result inserted after first assistant
    expect(result[2].role).toBe('user');
    const syntheticBlocks = result[2].content as ContentBlock[];
    expect(syntheticBlocks[0].type).toBe('tool_result');
    expect((syntheticBlocks[0] as any).tool_use_id).toBe('tool_1');
    // Original messages follow
    expect(result[3].content).toBe('Turn 2');
    expect(result[4].role).toBe('assistant');
    expect(result[5].role).toBe('user');
  });

  test('does not modify history with no tool_use blocks', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
      { role: 'user', content: 'What now?' },
    ];

    const result = sanitizeHistory(history);
    expect(result).toHaveLength(3);
    expect(result).toEqual(history);
  });

  test('handles assistant with text-only string content', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Just text, no tools' },
      { role: 'user', content: 'Ok' },
    ];

    const result = sanitizeHistory(history);
    expect(result).toHaveLength(3);
  });
});
