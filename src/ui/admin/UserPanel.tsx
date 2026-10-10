import { useEffect, useState } from 'react';
import type { AdminUser, AdminUserPatch } from '../../shared/api';
import { PLAN_LABELS, PLANS, type Role } from '../../shared/plans';
import { Button, Field, inputClass, Modal, Segmented } from '../controls';
import { errorText } from '../sync/request';
import { useToast } from '../toast';
import { deleteUser, patchUser } from './adminStore';
import { Meter, PlanPill, SubHeading, UserTags } from './parts';
import { ago, dayOf, ITEM_LABEL, overLimit, timeOf, totalItems, usage } from './users';

const ROLES: Role[] = ['user', 'editor', 'admin'];

/**
 * One user, in the inspector (a sheet on a phone): plan and role, their items against the plan's
 * limits, the admin's note, and deleting them with everything they saved.
 */
export function UserPanel({ user, self, fresh, now, onClose }: { user: AdminUser; self: boolean; fresh: boolean; now: number; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(user.note ?? '');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setNote(user.note ?? ''), [user.email, user.note]);

  /** Saves a change; the toast says what changed and can take it back. */
  const save = async (patch: AdminUserPatch, text: string, undo?: AdminUserPatch) => {
    setBusy(true);
    try {
      await patchUser(user.email, patch);
      toast({ text, ...(undo ? { undo: () => void patchUser(user.email, undo).catch((e: unknown) => toast({ text: `Could not undo: ${errorText(e)}` })) } : {}) });
    } catch (e) {
      toast({ text: `Not saved: ${errorText(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const items = usage(user);
  const over = overLimit(user);
  const total = totalItems(user);
  const noteChanged = note.trim() !== (user.note ?? '');
  const deletable = !self && user.role !== 'admin';

  return (
    <Modal title={user.email} onClose={onClose}>
      <div className="space-y-6 text-sm">
        {/* who */}
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-bold text-accent uppercase">{user.email[0]}</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold break-all">{user.email}</div>
            {user.note && <div className="text-muted">{user.note}</div>}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <PlanPill plan={user.plan} />
              <UserTags user={user} fresh={fresh} />
              {self && <span className="text-xs text-faint">that’s you</span>}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-surface-2 px-3 py-2">
            <dt className="text-xs text-muted">Joined</dt>
            <dd className="font-medium">{dayOf(user.createdAt)}</dd>
            <dd className="text-xs text-faint">{ago(user.createdAt, now)}</dd>
          </div>
          <div className="rounded-md bg-surface-2 px-3 py-2">
            <dt className="text-xs text-muted">Last seen</dt>
            <dd className="font-medium">{ago(user.seenAt, now)}</dd>
            <dd className="text-xs text-faint">{timeOf(user.seenAt)}</dd>
          </div>
        </dl>

        {user.premiumRequest && (
          <div className="rounded-md border border-warn bg-warn/10 px-3 py-3">
            <p className="text-ink">
              Asked for Premium {ago(user.premiumRequest, now)} <span className="text-muted">({dayOf(user.premiumRequest)})</span>.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy} onClick={() => void save({ plan: 'premium', premiumRequest: null }, `${user.email} is on Premium now`)}>
                Approve
              </Button>
              <Button disabled={busy} onClick={() => void save({ premiumRequest: null }, `Declined: ${user.email} stays on ${PLAN_LABELS[user.plan]} and can ask again`)}>
                Decline
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Plan" hint={user.role === 'user' ? 'Saved at once.' : `As ${user.role === 'admin' ? 'an admin' : 'an editor'} they get everything, whatever the plan.`}>
            <Segmented
              value={user.plan}
              options={PLANS.map((p) => ({ value: p, label: PLAN_LABELS[p] }))}
              onChange={(p) => p !== user.plan && !busy && void save({ plan: p }, `${user.email} is on ${PLAN_LABELS[p]} now`, { plan: user.plan })}
            />
          </Field>
          <Field label="Role" hint={self ? 'Your own role stays admin.' : 'Editors and admins get every feature; admins also see this dashboard.'}>
            {self ? (
              <div className="py-1.5 text-ink">admin</div>
            ) : (
              <Segmented
                value={user.role}
                options={ROLES.map((r) => ({ value: r, label: r }))}
                onChange={(r) => r !== user.role && !busy && void save({ role: r }, `${user.email} is ${r === 'user' ? 'a user' : `an ${r}`} now`, { role: user.role })}
              />
            )}
          </Field>
        </div>

        <div>
          <SubHeading aside={<span className="text-xs text-faint">{total} in all</span>}>Saved on the server</SubHeading>
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {items.map((x) => (
              <li key={x.kind}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted">{ITEM_LABEL[x.kind]}</span>
                  <span className="text-ink tabular-nums">
                    {x.count}
                    <span className="text-faint"> / {x.max === null ? '∞' : x.max}</span>
                  </span>
                </div>
                <Meter count={x.count} max={x.max} />
              </li>
            ))}
          </ul>
          {over.length > 0 && (
            <p className="mt-3 text-xs text-danger">
              Over the {PLAN_LABELS[user.plan]} limits ({over.map((x) => ITEM_LABEL[x.kind].toLowerCase()).join(', ')}): what they have stays, new ones stay on their device.
            </p>
          )}
        </div>

        <Field label="Note" hint="Only you see it: who they are, where you play.">
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={note}
              placeholder="Gabi, Thursday game"
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && noteChanged && void save({ note: note.trim() || null }, 'Note saved')}
            />
            <Button variant={noteChanged ? 'primary' : 'secondary'} disabled={!noteChanged || busy} onClick={() => void save({ note: note.trim() || null }, 'Note saved')} className="shrink-0">
              Save
            </Button>
          </div>
        </Field>

        <div className="border-t border-line pt-5">
          <Button variant="danger" disabled={!deletable || busy} onClick={() => setConfirm(true)}>
            Delete user and data…
          </Button>
          <p className="mt-1.5 text-xs text-faint">{deletable ? 'Everything they saved goes; you confirm first.' : 'An admin can’t be deleted: make them a user first.'}</p>
        </div>
      </div>

      {confirm && (
        <Modal
          kind="dialog"
          title="Delete this user?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                className="!border-danger font-semibold"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await deleteUser(user.email);
                    setConfirm(false);
                    onClose();
                    toast({ text: `${user.email} and their data are deleted` });
                  } catch (e) {
                    toast({ text: `Not deleted: ${errorText(e)}` });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete for good
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <p>
              <b className="break-all">{user.email}</b> and everything they saved on the server
              {total > 0 &&
                ` (${items
                  .filter((x) => x.count > 0)
                  .map((x) => `${x.count} ${ITEM_LABEL[x.kind].toLowerCase()}`)
                  .join(', ')})`}{' '}
              are deleted for good. This can’t be undone.
            </p>
            <p className="text-muted">
              Their Cloudflare seat is not part of this: remove it in Cloudflare One under <b className="text-ink">Team &amp; Resources → Users</b>.
            </p>
            <p className="text-muted">They can still log in again (as long as Cloudflare lets their email in) and start fresh on Free.</p>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
