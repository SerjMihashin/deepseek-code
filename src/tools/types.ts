export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export type ApprovalRequirement = 'always' | 'auto' | 'never'

export interface ToolDefinition {
  tool: Tool;
  approval: ApprovalRequirement;
}

/**
 * OpenAI-compatible tool format for DeepSeek API function calling.
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

/**
 * Convert our internal ToolDefinition[] to OpenAI-compatible tool format.
 */
export function toOpenAITools (definitions: ToolDefinition[]): OpenAITool[] {
  return definitions.map(def => {
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const param of def.tool.parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      }
      if (param.required) {
        required.push(param.name)
      }
    }

    return {
      type: 'function',
      function: {
        name: def.tool.name,
        description: def.tool.description,
        parameters: {
          type: 'object',
          properties,
          required,
        },
      },
    }
  })
}
