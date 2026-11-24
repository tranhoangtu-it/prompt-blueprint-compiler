#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  compileBlueprint,
  estimateTokens,
  extractVariables,
  validateAgentOutput,
} from "../src/index.js";

function printHelp() {
  console.log(`promptc — Zero-dependency AI System Prompt Compiler, Token Estimator & JSON Schema Validator

Usage:
  promptc compile <blueprint.md> [--vars vars.json] [--model gpt-4o]
  promptc vars <blueprint.md>
  promptc tokens <file.md> [--model claude-sonnet-4]
  promptc validate <llm-output.txt> --schema <schema.json>
`);
}

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    printHelp();
    process.exit(0);
  }

  if (cmd === "vars") {
    const template = await readFile(args[1], "utf8");
    console.log(JSON.stringify(extractVariables(template), null, 2));
    return;
  }

  if (cmd === "compile") {
    const template = await readFile(args[1], "utf8");
    const varsPath = getFlagValue(args, "--vars");
    const model = getFlagValue(args, "--model") ?? "gpt-4o";
    const vars = varsPath ? JSON.parse(await readFile(varsPath, "utf8")) : {};
    const result = compileBlueprint(template, vars, { model });
    console.log(result.prompt);
    return;
  }

  if (cmd === "tokens") {
    const text = await readFile(args[1], "utf8");
    const model = getFlagValue(args, "--model") ?? "gpt-4o";
    console.log(JSON.stringify(estimateTokens(text, { model }), null, 2));
    return;
  }

  if (cmd === "validate") {
    const raw = await readFile(args[1], "utf8");
    const schemaPath = getFlagValue(args, "--schema");
    if (!schemaPath) throw new Error("--schema <schema.json> is required");
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const result = validateAgentOutput(raw, schema);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exit(1);
    return;
  }

  throw new Error(`Unknown subcommand: "${cmd}"`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
