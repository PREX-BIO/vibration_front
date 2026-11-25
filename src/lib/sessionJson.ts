import type { Session } from '../types/session';
import type { DampingSession } from '../types/damping';

export type ExportSession = Session | DampingSession;
export const exportSessionId = (session: ExportSession) =>
  'session' in session ? session.session.id : session.session_id;

export function sessionFilename(session: ExportSession) {
  if ('session' in session) {
    const date = session.session.started_at_utc.replace(/\.\d{3}Z$/, 'Z').replace(/[^0-9TZ]/g, '');
    const id = session.session.id.replace(/[^a-zA-Z0-9_-]/g, '');
    return `damping_${date}_${id}.json`;
  }
  const date = session.started_at_utc.replace(/[^0-9TZ]/g, '');
  const id = session.session_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-12);
  return `pinch_${date}_${id}.json`;
}

export function serializeSession(session: ExportSession) {
  return JSON.stringify(
    session,
    (_key, value: unknown) => (typeof value === 'number' && !Number.isFinite(value) ? null : value),
    2,
  );
}

export type SavedFile = { uri: string; filename: string };
