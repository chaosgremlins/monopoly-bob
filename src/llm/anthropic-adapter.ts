import Anthropic from '@anthropic-ai/sdk';
import { LLMAdapter, ToolDefinition, ToolCall, ChatMessage, ContentBlock, LLMResponse } from './types';

export class AnthropicAdapter implements LLMAdapter {
  readonly providerId = 'anthropic';
  readonly modelId: string;
  private client: Anthropic;

  constructor(config: { model: string; apiKey?: string }) {
    this.modelId = config.model;
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async chat(
    systemPrompt: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    const anthropicMessages = messages.map(msg => this.toAnthropicMessage(msg));

    // Cache breakpoint strategy:
    //
    // 1. System prompt: static per player, contains full board reference (~1500 tokens).
    //    This is the primary cache anchor — it never changes between calls.
    //
    // 2. Conversation history: grows incrementally. We put a breakpoint on the
    //    second-to-last user message so everything up to that point is cached.
    //    The automatic 20-block lookback handles the rest.
    //
    // 3. Tools: STATIC — all possible tools are sent every call with identical
    //    definitions. Available actions are communicated in the turn message
    //    text instead. This keeps the tools cache stable.
    //
    // Minimum cacheable: 1024 tokens for Sonnet, 4096 for Haiku/Opus.
    // The system prompt with board reference is ~1500 tokens, so it caches on
    // Sonnet but needs conversation history to reach 4096 on Haiku.

    // System prompt with cache breakpoint
    const system: Anthropic.TextBlockParam[] = [{
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' },
    }];

    // Add cache breakpoint on the last user message in the stable prefix.
    // Everything before the final 2 messages is stable from the previous call.
    if (anthropicMessages.length > 2) {
      const breakpointIdx = anthropicMessages.length - 2;
      this.addCacheBreakpoint(anthropicMessages[breakpointIdx]);
    }

    // Mark last tool with cache_control (tools are static so this is stable)
    const cachedTools = tools.map((t, i) => {
      if (i === tools.length - 1) {
        return { ...t, cache_control: { type: 'ephemeral' as const } };
      }
      return t;
    });

    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 1024,
      system,
      messages: anthropicMessages,
      tools: cachedTools as any,
      tool_choice: { type: 'any' }, // Force tool use
    });

    return this.fromAnthropicResponse(response);
  }

  private addCacheBreakpoint(msg: Anthropic.MessageParam): void {
    if (typeof msg.content === 'string') {
      // Convert to block format so we can add cache_control
      msg.content = [{
        type: 'text',
        text: msg.content,
        cache_control: { type: 'ephemeral' },
      }];
    } else if (Array.isArray(msg.content) && msg.content.length > 0) {
      const lastBlock = msg.content[msg.content.length - 1] as any;
      lastBlock.cache_control = { type: 'ephemeral' };
    }
  }

  private toAnthropicMessage(msg: ChatMessage): Anthropic.MessageParam {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }

    // Convert content blocks
    const blocks: any[] = msg.content.map(block => {
      switch (block.type) {
        case 'text':
          return { type: 'text', text: block.text };
        case 'tool_use':
          return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
        case 'tool_result':
          return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content };
        default:
          return block;
      }
    });

    return { role: msg.role, content: blocks };
  }

  private fromAnthropicResponse(response: Anthropic.Message): LLMResponse {
    const toolCalls: ToolCall[] = [];
    let textContent = '';

    const contentBlocks: ContentBlock[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
        contentBlocks.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
        contentBlocks.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    const usage: any = response.usage;
    return {
      toolCalls,
      textContent,
      rawMessage: {
        role: 'assistant',
        content: contentBlocks,
      },
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
