/**
 * Zero-dependency AI System Prompt Blueprint Compiler, Token/Cost Estimator,
 * and Multi-Agent Structured Output JSON Schema Validator.
 */

const MODEL_PRICING_PER_1M = {
  "gpt-4o": { input: 2.5, output: 10.0, contextWindow: 128000 },
  "o3-mini": { input: 1.1, output: 4.4, contextWindow: 200000 },
  "claude-sonnet-4": { input: 3.0, output: 15.0, contextWindow: 200000 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0, contextWindow: 1048576 },
  "deepseek-v3": { input: 0.27, output: 1.1, contextWindow: 128000 },
};

function resolvePath(context, dottedPath) {
  if (!dottedPath) return undefined;
  if (dottedPath === "this") return context?.this ?? context;
  const parts = dottedPath.trim().split(".");
  let current = context;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function isTruthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function applyFilter(value, filterExpr) {
  const trimmed = filterExpr.trim();
  const defaultMatch = trimmed.match(/^default\s*:\s*(?:"([^"]*)"|'([^']*)'|(.+))$/);
  if (defaultMatch) {
    const fallback = defaultMatch[1] ?? defaultMatch[2] ?? defaultMatch[3]?.trim() ?? "";
    return value === undefined || value === null || value === "" ? fallback : value;
  }
  if (trimmed === "upper") return String(value ?? "").toUpperCase();
  if (trimmed === "lower") return String(value ?? "").toLowerCase();
  if (trimmed === "trim") return String(value ?? "").trim();
  if (trimmed === "json") return JSON.stringify(value ?? null, null, 2);
  throw new Error(`Unsupported blueprint filter: "${trimmed}"`);
}

/**
 * Extracts unique variable names referenced by `{{...}}`, `{{#if ...}}`, and `{{#each ...}}`.
 */
export function extractVariables(template) {
  if (typeof template !== "string") {
    throw new TypeError("Template must be a string");
  }
  const found = new Set();
  const tagRegex = /\{\{\s*(?:#if\s+|#each\s+)?(?![#/]|else\b)([a-zA-Z_][\w.]*)(?:\s*\|[^}]*)?\s*\}\}/g;
  for (const match of template.matchAll(tagRegex)) {
    const rootVar = match[1].split(".")[0];
    if (rootVar !== "this" && rootVar !== "index") {
      found.add(match[1]);
    }
  }
  return [...found];
}

function renderTemplate(template, context, options, missingSet) {
  // 1. Handle {{#each list}}...{{/each}} blocks
  let rendered = template.replace(
    /\{\{#each\s+([a-zA-Z_][\w.]*)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, listPath, innerBlock) => {
      const list = resolvePath(context, listPath);
      if (!Array.isArray(list) || list.length === 0) return "";
      return list
        .map((item, index) => {
          const childCtx =
            item !== null && typeof item === "object"
              ? { ...context, ...item, this: item, index }
              : { ...context, this: item, index };
          return renderTemplate(innerBlock, childCtx, options, missingSet);
        })
        .join("");
    },
  );

  // 2. Handle {{#if cond}}...{{else}}...{{/if}} blocks (innermost first for nested ifs)
  const ifPattern = /\{\{#if\s+([a-zA-Z_][\w.]*)\s*\}\}((?:(?!\{\{#if\b)[\s\S])*?)\{\{\/if\}\}/g;
  while (ifPattern.test(rendered)) {
    rendered = rendered.replace(ifPattern, (_, condPath, body) => {
      const condValue = resolvePath(context, condPath);
      const [trueBranch, falseBranch = ""] = body.split(/\{\{\s*else\s*\}\}/);
      return renderTemplate(
        isTruthy(condValue) ? trueBranch : falseBranch,
        context,
        options,
        missingSet,
      );
    });
  }

  // 3. Interpolate {{variable | filter1 | filter2}}
  rendered = rendered.replace(/\{\{\s*(?![#/])([^}]+?)\s*\}\}/g, (_, expr) => {
    const segments = expr.split("|");
    const varPath = segments[0].trim();
    const filters = segments.slice(1);
    let value = resolvePath(context, varPath);
    const hasDefaultFilter = filters.some((f) => f.trim().startsWith("default"));

    for (const filter of filters) {
      value = applyFilter(value, filter);
    }

    if (value === undefined || value === null) {
      if (!hasDefaultFilter) {
        missingSet.add(varPath);
      }
      return "";
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });

  return rendered;
}

/**
 * Compiles a prompt blueprint string with variables, conditionals, loops, and filters.
 */
export function compileBlueprint(template, variables = {}, options = {}) {
  if (typeof template !== "string") {
    throw new TypeError("Template must be a string");
  }
  const { strict = true, trimWhitespace = true } = options;
  const missingVariables = new Set();
  let prompt = renderTemplate(template, variables, options, missingVariables);

  if (strict && missingVariables.size > 0) {
    throw new Error(`Missing required prompt variables: ${[...missingVariables].join(", ")}`);
  }

  if (trimWhitespace) {
    prompt = prompt.replace(/\n{3,}/g, "\n\n").trim();
  }

  const tokenStats = estimateTokens(prompt, options);
  return {
    prompt,
    missingVariables: [...missingVariables],
    tokens: tokenStats.tokens,
    estimatedInputCostUsd: tokenStats.estimatedInputCostUsd,
  };
}

/**
 * Safely wraps untrusted user or external tool input inside XML boundary tags,
 * neutralizing closing-tag breakout attempts.
 */
export function wrapUntrustedInput(tagName, untrustedText) {
  if (!/^[a-zA-Z_][\w-]*$/.test(tagName)) {
    throw new Error(`Invalid XML boundary tag name: "${tagName}"`);
  }
  const safeBody = String(untrustedText ?? "").replace(
    new RegExp(`</\\s*${tagName}\\s*>`, "gi"),
    `<\\/${tagName}>`,
  );
  return `<${tagName}>\n${safeBody}\n</${tagName}>`;
}

function countTextTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  // Split into CJK/non-ASCII glyphs, words, numbers, and punctuation runs
  const segments = text.match(/[\u0080-\uffff]|[A-Za-z]+|\d+|[^\sA-Za-z0-9\u0080-\uffff]+|\s+/g) ?? [];
  for (const seg of segments) {
    const code = seg.codePointAt(0);
    if (code >= 0x2e80) {
      // CJK ideographs average ~1.2 tokens per character
      tokens += 1.2;
    } else if (code >= 0x0080) {
      // Accented Latin / Vietnamese characters
      tokens += 0.65;
    } else if (/^\s+$/.test(seg)) {
      tokens += Math.max(0, Math.floor(seg.length / 4));
    } else if (/^[A-Za-z]+$/.test(seg)) {
      tokens += Math.max(1, Math.ceil(seg.length / 4.2));
    } else if (/^\d+$/.test(seg)) {
      tokens += Math.max(1, Math.ceil(seg.length / 3));
    } else {
      tokens += Math.max(1, Math.ceil(seg.length / 2));
    }
  }
  return Math.max(1, Math.round(tokens));
}

/**
 * Estimates BPE token count and input/output API cost for a string or chat messages array.
 */
export function estimateTokens(input, options = {}) {
  const model = options.model ?? "gpt-4o";
  const expectedOutputTokens = options.expectedOutputTokens ?? 0;
  const pricing = MODEL_PRICING_PER_1M[model] ?? MODEL_PRICING_PER_1M["gpt-4o"];

  let tokens = 0;
  if (typeof input === "string") {
    tokens = input.length === 0 ? 0 : countTextTokens(input);
  } else if (Array.isArray(input)) {
    // ChatML message framing overhead (~4 tokens per message + 2 priming tokens)
    tokens = 2;
    for (const msg of input) {
      tokens += 4 + countTextTokens(typeof msg?.content === "string" ? msg.content : JSON.stringify(msg?.content ?? ""));
    }
  } else {
    throw new TypeError("Input must be a prompt string or an array of chat messages");
  }

  const estimatedInputCostUsd = Number(((tokens / 1_000_000) * pricing.input).toFixed(6));
  const estimatedOutputCostUsd = Number(((expectedOutputTokens / 1_000_000) * pricing.output).toFixed(6));

  return {
    model,
    tokens,
    contextWindow: pricing.contextWindow,
    contextUtilization: Number((tokens / pricing.contextWindow).toFixed(6)),
    estimatedInputCostUsd,
    estimatedOutputCostUsd,
    estimatedTotalCostUsd: Number((estimatedInputCostUsd + estimatedOutputCostUsd).toFixed(6)),
  };
}

/**
 * Extracts a JSON payload from raw LLM text (fenced ```json block or first balanced object/array).
 */
export function extractJsonBlock(rawText) {
  if (typeof rawText !== "string") {
    throw new TypeError("Expected raw LLM output string");
  }
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }

  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  // Locate first balanced { ... } or [ ... ]
  const firstBrace = rawText.search(/[{[]/);
  if (firstBrace !== -1) {
    const opener = rawText[firstBrace];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = firstBrace; i < rawText.length; i++) {
      const ch = rawText[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === opener) depth++;
        else if (ch === closer) {
          depth--;
          if (depth === 0) {
            return JSON.parse(rawText.slice(firstBrace, i + 1));
          }
        }
      }
    }
  }

  throw new SyntaxError("No valid JSON block found in LLM output");
}

function matchesSchemaType(value, expectedType) {
  if (expectedType === "array") return Array.isArray(value);
  if (expectedType === "null") return value === null;
  if (expectedType === "integer") return typeof value === "number" && Number.isInteger(value);
  if (expectedType === "number") return typeof value === "number" && Number.isFinite(value);
  if (expectedType === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === expectedType;
}

function validateNode(value, schema, pointer, errors) {
  if (!schema || typeof schema !== "object") return;

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowedTypes.some((t) => matchesSchemaType(value, t))) {
      errors.push(`${pointer || "/"}: expected type ${allowedTypes.join("|")}, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
      return;
    }
  }

  if ("const" in schema && value !== schema.const) {
    errors.push(`${pointer || "/"}: expected constant ${JSON.stringify(schema.const)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${pointer || "/"}: value ${JSON.stringify(value)} is not in enum [${schema.enum.join(", ")}]`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${pointer || "/"}: string length ${value.length} < minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${pointer || "/"}: string length ${value.length} > maxLength ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${pointer || "/"}: string does not match pattern /${schema.pattern}/`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${pointer || "/"}: ${value} < minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${pointer || "/"}: ${value} > maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${pointer || "/"}: array length ${value.length} < minItems ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${pointer || "/"}: array length ${value.length} > maxItems ${schema.maxItems}`);
    }
    if (schema.items) {
      value.forEach((item, idx) => validateNode(item, schema.items, `${pointer}/${idx}`, errors));
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (!(reqKey in value)) {
          errors.push(`${pointer}/${reqKey}: missing required property "${reqKey}"`);
        }
      }
    }
    const props = schema.properties ?? {};
    for (const [key, propVal] of Object.entries(value)) {
      if (key in props) {
        validateNode(propVal, props[key], `${pointer}/${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${pointer}/${key}: unexpected additional property "${key}"`);
      }
    }
  }
}

/**
 * Validates either a parsed JS value or a raw LLM text response against a JSON Schema.
 */
export function validateAgentOutput(dataOrRawText, schema) {
  let data = dataOrRawText;
  if (typeof dataOrRawText === "string") {
    try {
      data = extractJsonBlock(dataOrRawText);
    } catch (err) {
      return { valid: false, data: null, errors: [`/: ${err.message}`] };
    }
  }

  const errors = [];
  validateNode(data, schema, "", errors);
  return {
    valid: errors.length === 0,
    data,
    errors,
  };
}

export { MODEL_PRICING_PER_1M };
