import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadEnv } from './env.js';
import { requireBearer } from './auth.js';
import { buildMcpServer } from './mcp-server.js';

async function main(): Promise<void> {
  const env = loadEnv();

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    bodyLimit: 10 * 1024 * 1024,
  });

  // The MCP transport reads/writes the raw Node req/res; we don't want Fastify
  // to parse JSON bodies for the /mcp endpoint and consume the stream.
  app.addContentTypeParser(
    ['application/json', 'application/json-rpc'],
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // Auth on all routes except GET /healthz.
  app.addHook('onRequest', requireBearer(env.MCP_SECRET));

  app.get('/healthz', async () => ({ ok: true }));

  // The Streamable HTTP transport in stateless mode (sessionIdGenerator =
  // undefined) is *not* reusable across requests — its internal state binds
  // to the response stream of the request that created it. The MCP SDK
  // examples build a fresh server+transport pair per request and tear them
  // down on `res.close`. We do the same. The Server instance is cheap; the
  // tool handlers it dispatches to read shared singletons (Prisma) so this
  // doesn't multiply DB connections.
  const handleMcp = async (
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const raw = req.raw as IncomingMessage;
    const res = reply.raw as ServerResponse;
    const parsedBody =
      Buffer.isBuffer(req.body) && req.body.length > 0
        ? JSON.parse(req.body.toString('utf8'))
        : undefined;

    const mcp = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      transport.close().catch((err) => app.log.warn({ err }, 'transport close'));
      mcp.close().catch((err) => app.log.warn({ err }, 'server close'));
    });

    try {
      await mcp.connect(transport);
      await transport.handleRequest(raw, res, parsedBody);
    } catch (err) {
      app.log.error({ err }, 'MCP transport error');
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'mcp_transport_error' }));
      } else {
        res.end();
      }
    }
    // Tell Fastify we've handled the response ourselves.
    reply.hijack();
  };

  app.post('/mcp', handleMcp);
  app.get('/mcp', handleMcp);
  app.delete('/mcp', handleMcp);

  const close = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
    } catch (err) {
      app.log.warn({ err }, 'fastify close error');
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void close('SIGTERM'));
  process.on('SIGINT', () => void close('SIGINT'));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(`visualize-mcp listening on :${env.PORT}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
