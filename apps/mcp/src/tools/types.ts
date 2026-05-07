import type { z } from 'zod';

export type McpTextContent = { type: 'text'; text: string };
export type McpImageContent = { type: 'image'; data: string; mimeType: string };
export type McpContent = McpTextContent | McpImageContent;

export type ToolResult = {
  content: McpContent[];
  isError?: boolean;
};

export type ToolHandler<S extends z.ZodTypeAny> = (
  input: z.infer<S>,
) => Promise<ToolResult>;

export type ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: S;
  handler: ToolHandler<S>;
};

/**
 * Type-erased tool definition for the aggregator. Each individual tool can
 * keep its strong Zod-inferred input type via `ToolDefinition<MySchema>`; we
 * lose that strength only at the boundary where heterogeneous tools live in
 * one array.
 */
export type AnyToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<ToolResult>;
};

/** Helper for tools that just want to return a JSON-serialized payload. */
export function jsonResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}
