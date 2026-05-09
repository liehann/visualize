import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from './json-schema.js';

describe('zodToJsonSchema', () => {
  it('converts a simple string field with a description', () => {
    const schema = z.object({ name: z.string().describe('the name') });
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('object');
    expect(json.properties?.name?.type).toBe('string');
    expect(json.properties?.name?.description).toBe('the name');
    expect(json.required).toEqual(['name']);
  });

  it('marks optional fields as not required', () => {
    const schema = z.object({
      slug: z.string(),
      after: z.string().optional(),
    });
    const json = zodToJsonSchema(schema);
    expect(json.required).toEqual(['slug']);
  });

  it('emits an enum for z.enum', () => {
    const schema = z.object({ status: z.enum(['passed', 'failed', 'flaky']) });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.status?.type).toBe('string');
    expect(json.properties?.status?.enum).toEqual(['passed', 'failed', 'flaky']);
  });

  it('emits min/max + default for number fields', () => {
    const schema = z.object({
      limit: z.number().int().min(1).max(100).default(20),
    });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.limit?.type).toBe('integer');
    expect(json.properties?.limit?.minimum).toBe(1);
    expect(json.properties?.limit?.maximum).toBe(100);
    expect(json.properties?.limit?.default).toBe(20);
  });

  it('handles nested arrays of strings', () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.tags?.type).toBe('array');
    expect(json.properties?.tags?.items?.type).toBe('string');
  });
});
