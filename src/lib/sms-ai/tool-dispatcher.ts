/**
 * SMS AI v2 — tool dispatcher (STUB).
 *
 * STUB IMPLEMENTATION — Layer 3a placeholder. Layer 3b replaces this file's
 * body with the real dispatcher that routes each tool_use to the
 * corresponding voice-agent endpoint (or in-process helper, in the case of
 * `notify_staff` → `notifyStaff()`). Until then every tool call resolves
 * to `is_error: true` so the agent runner loop and its tests can exercise
 * the round-trip mechanics without the real endpoints being wired up.
 *
 * The public signature of `dispatchTool(...)` is part of the Layer 3a/3b
 * contract and MUST NOT change when Layer 3b lands — only the body is
 * replaced.
 *
 * TODO(Layer 3b): replace stub body with real per-tool routing. See
 * `docs/dev/SMS_AI_V2_LAYER_3_DISCOVERY.md` §H for the tool-to-endpoint
 * mapping and latency classification.
 */

export interface DispatchToolInput {
  /** Tool name as declared in `SMS_AI_V2_TOOLS`. */
  name: string;
  /** Free-form tool input as emitted by the model. */
  input: Record<string, unknown>;
}

export interface DispatchToolResult {
  /** Stringified content the runner forwards as the `tool_result` block content. */
  content: string;
  /** True signals the model that the tool call failed. */
  isError: boolean;
}

const STUB_MESSAGE = 'Tool dispatch not yet implemented (Layer 3b)';

/**
 * Dispatch a single tool_use to its backing implementation.
 *
 * STUB: always resolves to `{ content: STUB_MESSAGE, isError: true }`
 * regardless of tool name or input. The agent runner forwards this back
 * into the next inference cycle as a `tool_result` with `is_error: true`,
 * so the model sees a clean failure signal and can decide to give up or
 * try a different tool.
 */
export async function dispatchTool(
  _input: DispatchToolInput,
): Promise<DispatchToolResult> {
  return { content: STUB_MESSAGE, isError: true };
}
