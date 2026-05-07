import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { tools } from './tools/index.js';
import { zodToJsonSchema } from './json-schema.js';
import type { ToolDefinition } from './tools/index.js';

const SERVER_NAME = 'visualize';
const SERVER_VERSION = '0.1.0';

function findTool(name: string): ToolDefinition<z.ZodTypeAny> | undefined {
  return tools.find((t) => t.name === name);
}

export function buildMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params;
    const tool = findTool(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      return {
        content: [
          { type: 'text', text: `Invalid input for ${name}: ${issues}` },
        ],
        isError: true,
      };
    }
    try {
      const result = await tool.handler(parsed.data);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error in ${name}: ${msg}` }],
        isError: true,
      };
    }
  });

  return server;
}
