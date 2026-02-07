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

    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: tools as any,
      tool_choice: { type: 'any' }, // Force tool use
    });

    return this.fromAnthropicResponse(response);
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

    return {
      toolCalls,
      textContent,
      rawMessage: {
        role: 'assistant',
        content: contentBlocks,
      },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
