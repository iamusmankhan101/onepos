"use client";

import { useSyncExternalStore } from "react";
import { ACCOUNT_REFRESHED_EVENT, getCurrentUser } from "./auth";
import { BUSINESS_TYPES, businessTypeFor, DEFAULT_BUSINESS_TYPE_ID, type BusinessTypeDefinition } from "./business-types";

/** The signed-in business's type (General when signed out). */
export function activeBusinessType(): BusinessTypeDefinition {
  return businessTypeFor(getCurrentUser());
}

function subscribe(onChange: () => void) {
  window.addEventListener(ACCOUNT_REFRESHED_EVENT, onChange);
  return () => window.removeEventListener(ACCOUNT_REFRESHED_EVENT, onChange);
}

/**
 * The business type, kept current when checkServerSession() pulls down a
 * changed account — an admin can switch a business's type while it's open.
 * The server render always sees General; the cached user is read on hydrate.
 */
export function useBusinessType(): BusinessTypeDefinition {
  const id = useSyncExternalStore(
    subscribe,
    () => activeBusinessType().id,
    () => DEFAULT_BUSINESS_TYPE_ID,
  );
  return BUSINESS_TYPES[id];
}
