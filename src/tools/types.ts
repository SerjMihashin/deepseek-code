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

export type ApprovalRequirement = 'always' | 'auto' | 'never';

export interface ToolDefinition {
  tool: Tool;
  approval: ApprovalRequirement;
}
