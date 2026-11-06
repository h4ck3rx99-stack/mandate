import type { Scope, Violation } from "./types";

const WILDCARD = "*";

/**
 * Returns EVERY way `child` is broader than `parent` (empty = child narrows or equals parent).
 * Assumes both scopes passed schema validation (sorted/deduped, no mixed wildcard).
 */
export function narrows(parent: Scope, child: Scope): Violation[] {
  const out: Violation[] = [];

  const extraActions = child.actions.filter((a) => !parent.actions.includes(a));
  if (extraActions.length > 0) {
    out.push({
      dimension: "actions",
      reason: `child adds action(s) not granted by parent: ${extraActions.join(", ")}`,
      parentValue: parent.actions.join(","),
      childValue: child.actions.join(","),
    });
  }

  if (child.maxAmount > parent.maxAmount) {
    out.push({
      dimension: "maxAmount",
      reason: "child per-request ceiling exceeds parent's",
      parentValue: parent.maxAmount.toString(),
      childValue: child.maxAmount.toString(),
    });
  }

  if (child.expiry > parent.expiry) {
    out.push({
      dimension: "expiry",
      reason: "child expires after parent",
      parentValue: parent.expiry.toString(),
      childValue: child.expiry.toString(),
    });
  }

  if (!parent.targets.includes(WILDCARD)) {
    const extraTargets = child.targets.filter((t) => t === WILDCARD || !parent.targets.includes(t));
    if (extraTargets.length > 0) {
      out.push({
        dimension: "targets",
        reason: `child adds target(s) not granted by parent: ${extraTargets.join(", ")}`,
        parentValue: parent.targets.join(","),
        childValue: child.targets.join(","),
      });
    }
  }

  return out;
}

/** narrows() over every edge of a root-first chain of scopes, tagging each violation with its edge index. */
export function narrowsChain(scopes: Scope[]): Violation[] {
  const out: Violation[] = [];
  for (let i = 0; i + 1 < scopes.length; i++) {
    for (const v of narrows(scopes[i]!, scopes[i + 1]!)) out.push({ ...v, edgeIndex: i });
  }
  return out;
}
