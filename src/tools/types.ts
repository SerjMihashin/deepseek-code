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

const MAX_STRING_LENGTH = 1_000_000 // 1MB max per string arg
const MAX_ARRAY_LENGTH = 10_000 // 10K max per array arg

/**
 * Validate and sanitize tool arguments against their parameter definitions.
 * Returns the sanitized args or throws a descriptive error.
 */
export function sanitizeArgs (
  args: Record<string, unknown>,
  params: ToolParameter[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const param of params) {
    const value = args[param.name]

    // Check required
    if (value === undefined || value === null) {
      if (param.required) {
        throw new Error(`Missing required parameter: "${param.name}" (type: ${param.type})`)
      }
      continue
    }

    // Type check
    const actualType = typeof value
    switch (param.type) {
      case 'string':
        if (actualType !== 'string') {
          throw new Error(`Parameter "${param.name}" expected string, got ${actualType}`)
        }
        if ((value as string).length > MAX_STRING_LENGTH) {
          throw new Error(`Parameter "${param.name}" exceeds max length (${MAX_STRING_LENGTH}): ${(value as string).length} chars`)
        }
        break
      case 'number':
        if (actualType !== 'number') {
          throw new Error(`Parameter "${param.name}" expected number, got ${actualType}`)
        }
        if (!Number.isFinite(value as number)) {
          throw new Error(`Parameter "${param.name}" must be a finite number`)
        }
        break
      case 'boolean':
        if (actualType !== 'boolean') {
          throw new Error(`Parameter "${param.name}" expected boolean, got ${actualType}`)
        }
        break
      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Parameter "${param.name}" expected array, got ${actualType}`)
        }
        if ((value as unknown[]).length > MAX_ARRAY_LENGTH) {
          throw new Error(`Parameter "${param.name}" exceeds max array length (${MAX_ARRAY_LENGTH}): ${(value as unknown[]).length} items`)
        }
        break
      case 'object':
        if (actualType !== 'object' || value === null || Array.isArray(value)) {
          throw new Error(`Parameter "${param.name}" expected object, got ${actualType}`)
        }
        break
    }

    result[param.name] = value
  }

  return result
}
