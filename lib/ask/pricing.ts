// What a call to the model costs, so each question can be charged against
// the daily cap. Dollars per million tokens. A model that is not listed here
// cannot be used: an unpriced model would make the cap meaningless.

type Price = { input: number; output: number; longInput?: number; longOutput?: number; longOver?: number };

const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longInput: 0.5, longOutput: 2.5, longOver: 100_000 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export const DEFAULT_MODEL = "claude-haiku-5-5";

export function isPricedModel(model: string) {
  return Object.hasOwn(PRICES, model);
}

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** Cost of one response in dollars. Cache writes bill at 1.25x input, reads at 0.1x. */
export function costUsd(model: string, usage: Usage): number {
  const p = PRICES[model];
  if (!p) throw new Error(`No price is recorded for model "${model}"`);
  const written = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const prompt = usage.input_tokens + written + read;
  const long = p.longOver !== undefined && prompt > p.longOver;
  const input = long ? (p.longInput ?? p.input) : p.input;
  const output = long ? (p.longOutput ?? p.output) : p.output;
  return ((usage.input_tokens + written * 1.25 + read * 0.1) * input + usage.output_tokens * output) / 1_000_000;
}
