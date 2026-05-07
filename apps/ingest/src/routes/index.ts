import type { FastifyInstance } from 'fastify';
import { registerRunsRoute } from './runs.js';
import { registerBaselinesRoute } from './baselines.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerRunsRoute(app);
  await registerBaselinesRoute(app);
}
