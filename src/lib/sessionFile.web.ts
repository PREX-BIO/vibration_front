import {
  exportSessionId,
  type ExportSession,
  type SavedFile,
  serializeSession,
  sessionFilename,
} from './sessionJson';

export function pickSessionJson(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    const remove = () => input.remove();
    input.addEventListener(
      'cancel',
      () => {
        remove();
        resolve(null);
      },
      { once: true },
    );
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        remove();
        if (!file) {
          resolve(null);
          return;
        }
        if (file.size > 10_000_000) {
          reject(new Error('10 MB 이하의 측정 JSON을 선택해 주세요.'));
          return;
        }
        void file.text().then(resolve, reject);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

export async function saveSession(session: ExportSession): Promise<SavedFile> {
  const filename = sessionFilename(session);
  // Two continuous sensor streams exceed localStorage quotas after only a few records.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('vibration-records', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('sessions', 'readwrite');
      transaction.objectStore('sessions').put(serializeSession(session), exportSessionId(session));
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error ?? new Error('기록 저장이 취소되었습니다.'));
      };
    };
  });
  return { uri: `indexed-db:${exportSessionId(session)}`, filename };
}

export async function shareSession(file: SavedFile, session: ExportSession) {
  const blob = new Blob([serializeSession(session)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
