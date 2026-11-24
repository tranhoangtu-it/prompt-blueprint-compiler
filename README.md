# prompt-blueprint-compiler

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)
[![Live Workbench](https://img.shields.io/badge/Live%20Workbench-AgentOS%20Vault-8b5cf6)](https://agent-vault.tranhoangtu-it.workers.dev)

**Zero-dependency `{{variable}}` AI System Prompt Compiler, Token & Cost Estimator, and Multi-Agent JSON Schema Validator** for Node.js, Bun, Deno, Cloudflare Workers, and browser apps.

Stop shipping brittle template literals and unvalidated LLM JSON handoffs:

1. **Deterministic Prompt Blueprints** — `{{var}}`, `{{var | default: "fallback"}}`, `{{#if flag}}...{{else}}...{{/if}}`, `{{#each tools}}...{{/each}}`, and strict missing-variable checks before spending API tokens.
2. **Prompt-Injection Boundary Guards** — `wrapUntrustedInput("user_doc", rawText)` neutralizes closing-tag breakout attacks (`</user_doc>`).
3. **Token & Context-Window Cost Estimator** — Instant subword token & USD cost estimation across `gpt-4o`, `o3-mini`, `claude-sonnet-4`, `gemini-2.5-pro`, and `deepseek-v3`.
4. **Multi-Agent JSON Schema Validator** — Extracts fenced ```` ```json ```` or balanced JSON objects from noisy LLM responses and validates them against JSON Schema with exact JSONPointer error paths.

---

## Live Workbench & AgentOS Pro Vault

- **Try the Interactive Prompt Compiler & Token Workbench:** [https://agent-vault.tranhoangtu-it.workers.dev](https://agent-vault.tranhoangtu-it.workers.dev)

> ### Upgrade to **AgentOS Prompt & Multi-Agent Pro Vault**
> Want **50+ battle-tested production system prompt blueprints**, multi-agent router topologies (Planner → Researcher → Coder → Verifier), MCP tool schemas, adversarial red-team eval suites, and the full interactive **AgentOS Workbench** source code?
>
> - **Get the Pro Vault on Gumroad:** [https://tranhoangtu.gumroad.com/l/tzxqni](https://tranhoangtu.gumroad.com/l/tzxqni)
> - **Get the Pro Vault on Payhip:** [https://payhip.com/b/hZ1IP](https://payhip.com/b/hZ1IP)

---

## Quick Start

### Programmatic Usage (ESM / TypeScript)

```js
import {
  compileBlueprint,
  wrapUntrustedInput,
  validateAgentOutput,
} from "prompt-blueprint-compiler";

const systemBlueprint = `
You are {{agent.role | upper}} ({{mode | default: "autonomous"}}).
{{#if rules}}
Follow every constraint strictly:
{{#each rules}}- {{this}}
{{/each}}
{{/if}}

Analyze the untrusted payload below:
{{payload}}
`;

const { prompt, tokens, estimatedInputCostUsd } = compileBlueprint(
  systemBlueprint,
  {
    agent: { role: "Principal Security Reviewer" },
    rules: ["Cite exact line numbers", "Return valid JSON matching the schema"],
    payload: wrapUntrustedInput("diff_chunk", untrustedGitDiff),
  },
  { model: "claude-sonnet-4", strict: true },
);

// Validate raw LLM response (even when wrapped in markdown prose)
const handoffSchema = {
  type: "object",
  required: ["approved", "issues"],
  additionalProperties: false,
  properties: {
    approved: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "summary"],
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          summary: { type: "string", minLength: 5 },
        },
      },
    },
  },
};

const check = validateAgentOutput(rawLlmResponseText, handoffSchema);
if (!check.valid) {
  console.error("Invalid agent handoff:", check.errors);
}
```

### CLI Usage (`promptc`)

```bash
# List all variables required by a prompt blueprint
npx promptc vars ./prompts/code-reviewer.md

# Compile a blueprint with JSON variables
npx promptc compile ./prompts/code-reviewer.md --vars ./context.json

# Estimate token count & context window usage
npx promptc tokens ./prompts/code-reviewer.md --model gemini-2.5-pro

# Validate raw LLM output against a JSON Schema in CI pipelines
npx promptc validate ./llm-response.txt --schema ./handoff.schema.json
```

---

## Open-Core Comparison

| Feature | Open-Source (`prompt-blueprint-compiler`) | [AgentOS Pro Vault](https://tranhoangtu.gumroad.com/l/tzxqni) |
| :--- | :---: | :---: |
| `{{variable}}` compiler, conditionals, loops & filters | Included | Included |
| Token & API cost estimator + JSON Schema validator | Included | Included |
| 50+ production multi-agent blueprints (SWE, FinOps, Legal, Growth, QA) | 2 samples | Full 50+ Library |
| Multi-agent coordinator + evaluator-optimizer JSON schemas | — | Included |
| Full self-hosted Cloudflare Worker Workbench UI source | [Live Demo](https://agent-vault.tranhoangtu-it.workers.dev) | Full Source Code |

- **Gumroad Instant Download:** [https://tranhoangtu.gumroad.com/l/tzxqni](https://tranhoangtu.gumroad.com/l/tzxqni)
- **Payhip Instant Download:** [https://payhip.com/b/hZ1IP](https://payhip.com/b/hZ1IP)

---

## Running Tests

```bash
node --test
```

## License

MIT © Tran Hoang Tu
