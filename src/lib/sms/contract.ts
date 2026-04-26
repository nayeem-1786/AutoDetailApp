// SMS template contract — Zod schema and validation helpers.
//
// A contract describes which chips are required vs optional for a given slug.
// The engine reads contracts from sms_templates.required_variables and
// sms_templates.optional_variables (added by the Phase 3 migration).
//
//   - required_variables: chips the engine must see non-empty values for.
//     Missing/empty required → engine hard-skips (returns isActive:false,
//     skipped:true). Caller skips the send.
//   - optional_variables: chips the engine substitutes if provided. Missing/empty
//     optional → REMOVE_LINE strips the line referencing the chip. The send
//     still fires.
//
// Validation rules enforced by validateContract():
//   - required_variables and optional_variables are string[]
//   - No overlap between the two arrays (a chip is either required or optional)
//   - No duplicates within either array
//   - Every key in either array exists in SMS_PALETTE
//
// Contracts that fail validation cause the engine to fail-safe (treat the
// template as is_active:false). This prevents a malformed migration from
// silently producing broken SMS bodies.
//
// Source-of-truth note (Session 2A.5): palette.ts is now auto-generated from
// src/lib/sms/sms-contracts.source.ts via scripts/regen-sms-contracts.ts.
// The membership check below is therefore validated against the same single
// source of truth that drives the codegen-generated typed render-vars contracts
// in generated-contracts.ts. Drift between palette and contracts is impossible
// once both generated files are committed in sync.

import { z } from 'zod';
import { SMS_PALETTE } from './palette';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const SmsTemplateContract = z.object({
  slug: z.string().min(1),
  required_variables: z.array(z.string()),
  optional_variables: z.array(z.string()),
});

/** Raw shape of a contract row, parsed by SmsTemplateContract. */
export type SmsTemplateContractRow = z.infer<typeof SmsTemplateContract>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class ContractValidationError extends Error {
  constructor(public readonly slug: string, message: string) {
    super(`[SmsContract] slug "${slug}": ${message}`);
    this.name = 'ContractValidationError';
  }
}

/**
 * Validate a parsed contract against business rules:
 *   1. Both arrays Zod-shape valid (already enforced by SmsTemplateContract.parse)
 *   2. No duplicates within required_variables
 *   3. No duplicates within optional_variables
 *   4. No overlap between required and optional
 *   5. Every key in either array exists in SMS_PALETTE
 *
 * Throws ContractValidationError on first violation. Engine cache loader
 * catches this and treats the template as inactive — fail-safe behavior.
 */
export function validateContract(contract: SmsTemplateContractRow): void {
  const { slug, required_variables: required, optional_variables: optional } = contract;

  // Duplicates within required
  const reqDups = findDuplicates(required);
  if (reqDups.length > 0) {
    throw new ContractValidationError(
      slug,
      `Duplicate keys in required_variables: ${reqDups.join(', ')}`,
    );
  }

  // Duplicates within optional
  const optDups = findDuplicates(optional);
  if (optDups.length > 0) {
    throw new ContractValidationError(
      slug,
      `Duplicate keys in optional_variables: ${optDups.join(', ')}`,
    );
  }

  // Overlap between required and optional
  const requiredSet = new Set(required);
  const overlap = optional.filter((k) => requiredSet.has(k));
  if (overlap.length > 0) {
    throw new ContractValidationError(
      slug,
      `Keys appear in both required_variables and optional_variables: ${overlap.join(', ')}`,
    );
  }

  // Every key exists in palette
  const unknownRequired = required.filter((k) => !(k in SMS_PALETTE));
  if (unknownRequired.length > 0) {
    throw new ContractValidationError(
      slug,
      `required_variables contains keys not in SMS_PALETTE: ${unknownRequired.join(', ')}`,
    );
  }
  const unknownOptional = optional.filter((k) => !(k in SMS_PALETTE));
  if (unknownOptional.length > 0) {
    throw new ContractValidationError(
      slug,
      `optional_variables contains keys not in SMS_PALETTE: ${unknownOptional.join(', ')}`,
    );
  }
}

/**
 * Parse + validate a raw row from sms_templates. Returns the validated contract
 * or throws. Used by the engine's cache loader (Phase 4 wiring).
 */
export function parseContractFromRow(row: {
  slug: string;
  required_variables: unknown;
  optional_variables: unknown;
}): SmsTemplateContractRow {
  const parsed = SmsTemplateContract.parse({
    slug: row.slug,
    required_variables: row.required_variables,
    optional_variables: row.optional_variables,
  });
  validateContract(parsed);
  return parsed;
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Whether a chip key is part of a slug's contract (required OR optional).
 * Used by the future admin UI warning system in Session 2E to flag chips
 * an operator inserts into a body that aren't valid for that slug.
 */
export function isChipValidForSlug(
  chipKey: string,
  contract: SmsTemplateContractRow,
): boolean {
  return contract.required_variables.includes(chipKey)
    || contract.optional_variables.includes(chipKey);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function findDuplicates(arr: readonly string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const item of arr) {
    if (seen.has(item)) {
      dups.add(item);
    } else {
      seen.add(item);
    }
  }
  return Array.from(dups);
}
