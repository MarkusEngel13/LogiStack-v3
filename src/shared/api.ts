/**
 * The API beyond syncing items (worker/index.ts): the admin dashboard, Premium requests and
 * "Consider this" (advice for users from the playbook the admin uploaded). The app and the Worker
 * both use these types, so the two can't drift apart.
 *
 *   GET    /api/me                          + premiumRequest (Me)
 *   POST   /api/premium-request             ask for Premium              -> { premiumRequest: string }
 *   DELETE /api/premium-request             take the request back        -> { premiumRequest: null }
 *   POST   /api/advice          AdviceQuery                             -> AdviceAnswer
 *   GET    /api/admin/users                                             -> { users: AdminUser[] }
 *   PUT    /api/admin/users/:email  AdminUserPatch                      -> { ok: true }
 *   DELETE /api/admin/users/:email          the user and all their data (never an admin) -> { ok: true }
 *   GET    /api/admin/advice                                            -> { books: AdviceBook[] }
 *   PUT    /api/admin/advice    AdviceUpload  one part of a book (part 0 replaces the whole book)
 *   DELETE /api/admin/advice/:book
 *
 * Errors keep the existing shape: { error, message } with an HTTP status.
 */

import type { ServerAdvice } from '../core/advice/playbook';
import type { SpotTags } from '../core/advice/spot';
import type { Kind, Plan, Role } from './plans';

export type { ServerAdvice };

/** /api/me adds this to the account. */
export interface Me {
  /** When the user asked for Premium (ISO time); null = no open request. */
  premiumRequest: string | null;
}

/** One user in the admin dashboard. */
export interface AdminUser {
  email: string;
  plan: Plan;
  role: Role;
  /** First login (ISO time). */
  createdAt: string;
  /** Last request to the server (ISO time). */
  seenAt: string;
  /** Saved items per kind (deleted ones not counted; kinds without items left out). */
  items: Partial<Record<Kind, number>>;
  /** The admin's note on them ("Gabi, Thursday game"). */
  note: string | null;
  /** An open request for Premium (ISO time), or null. */
  premiumRequest: string | null;
}

/** What the admin changes on a user. Approving a request = { plan: 'premium', premiumRequest: null }; declining = { premiumRequest: null }. */
export interface AdminUserPatch {
  plan?: Plan;
  role?: Role;
  note?: string | null;
  premiumRequest?: null;
}

/** One playbook ("book") on the server, for the admin. */
export interface AdviceBook {
  book: string;
  entries: number;
  /** ISO time of the last upload. */
  updatedAt: string;
}

/** A part of a book; part 0 deletes the book's old entries first. Each part stays well under the 512 KB body limit. */
export interface AdviceUpload {
  book: string;
  part: number;
  parts: number;
  entries: ServerAdvice[];
}

/** "Consider this" for a moment of a hand: the moment in the playbook's words (core/advice/spot.ts). */
export interface AdviceQuery {
  tags: SpotTags;
}

export interface AdviceAnswer {
  /** The best fitting pieces, at most `perSpot` (the plan's `advicePerSpot`). */
  entries: { id: string; title: string; advice: string }[];
  perSpot: number;
}
