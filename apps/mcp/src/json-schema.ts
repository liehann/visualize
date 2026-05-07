import { z } from 'zod';

/**
 * Minimal Zod-to-JSON-Schema converter sufficient for the small set of input
 * schemas used by our MCP tools. Supports: object, string, number, integer,
 * boolean, enum, optional, default, min/max constraints.
 *
 * We hand-roll this rather than pulling another dependency.
 */
export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  enum?: readonly (string | number | boolean)[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
  oneOf?: JsonSchema[];
  [k: string]: unknown;
};

function unwrap(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  optional: boolean;
  defaultValue?: unknown;
  description?: string;
} {
  let inner: z.ZodTypeAny = schema;
  let optional = false;
  let defaultValue: unknown;
  let description: string | undefined = inner._def.description;

  // Peel optional / default / nullable / describe wrappers.
  // Loop in case of nested wrappers (e.g. .optional().default()).
  // Zod represents these via _def.typeName.
  for (let i = 0; i < 8; i++) {
    const tn = inner._def.typeName as string | undefined;
    if (tn === 'ZodOptional' || tn === 'ZodNullable') {
      optional = true;
      inner = inner._def.innerType;
    } else if (tn === 'ZodDefault') {
      optional = true;
      defaultValue = inner._def.defaultValue();
      inner = inner._def.innerType;
    } else if (tn === 'ZodEffects') {
      inner = inner._def.schema;
    } else {
      break;
    }
    if (inner._def.description && !description) {
      description = inner._def.description;
    }
  }
  return { inner, optional, defaultValue, description };
}

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const { inner, defaultValue, description } = unwrap(schema);
  const tn = inner._def.typeName as string | undefined;
  const out: JsonSchema = {};
  if (description) out.description = description;
  if (defaultValue !== undefined) out.default = defaultValue;

  switch (tn) {
    case 'ZodString': {
      out.type = 'string';
      const checks = (inner._def.checks ?? []) as Array<{
        kind: string;
        value?: number;
      }>;
      for (const c of checks) {
        if (c.kind === 'min' && typeof c.value === 'number') {
          out['minLength'] = c.value;
        } else if (c.kind === 'max' && typeof c.value === 'number') {
          out['maxLength'] = c.value;
        }
      }
      return out;
    }
    case 'ZodNumber': {
      const checks = (inner._def.checks ?? []) as Array<{
        kind: string;
        value?: number;
      }>;
      out.type = checks.some((c) => c.kind === 'int') ? 'integer' : 'number';
      for (const c of checks) {
        if (c.kind === 'min' && typeof c.value === 'number') out.minimum = c.value;
        if (c.kind === 'max' && typeof c.value === 'number') out.maximum = c.value;
      }
      return out;
    }
    case 'ZodBoolean':
      out.type = 'boolean';
      return out;
    case 'ZodEnum': {
      out.type = 'string';
      out.enum = inner._def.values as readonly string[];
      return out;
    }
    case 'ZodLiteral': {
      const v = inner._def.value;
      out.type = typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
      out.enum = [v as string | number | boolean];
      return out;
    }
    case 'ZodArray':
      out.type = 'array';
      out.items = zodToJsonSchema(inner._def.type);
      return out;
    case 'ZodObject': {
      out.type = 'object';
      const shape = inner._def.shape() as Record<string, z.ZodTypeAny>;
      const props: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        const { optional } = unwrap(v);
        props[k] = zodToJsonSchema(v);
        if (!optional) required.push(k);
      }
      out.properties = props;
      if (required.length > 0) out.required = required;
      out.additionalProperties = false;
      return out;
    }
    case 'ZodDiscriminatedUnion':
    case 'ZodUnion': {
      const opts = (inner._def.options ?? []) as z.ZodTypeAny[];
      out.oneOf = opts.map((o) => zodToJsonSchema(o));
      return out;
    }
    case 'ZodAny':
    case 'ZodUnknown':
      return out;
    default:
      // Fallback: empty schema accepts anything.
      return out;
  }
}
