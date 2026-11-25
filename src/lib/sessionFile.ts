import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  type ExportSession,
  type SavedFile,
  serializeSession,
  sessionFilename,
} from './sessionJson';

export async function pickSessionJson(): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json'] });
  if (picked.canceled) return null;
  if (picked.result.size > 10_000_000) throw new Error('10 MB 이하의 측정 JSON을 선택해 주세요.');
  return picked.result.text();
}

export async function saveSession(session: ExportSession): Promise<SavedFile> {
  const directory = new Directory(Paths.document, 'damping-sessions');
  directory.create({ idempotent: true, intermediates: true });
  const filename = sessionFilename(session);
  const file = new File(directory, filename);
  const pending = new File(directory, `${filename}.pending`);
  pending.create({ overwrite: true });
  await pending.write(serializeSession(session));
  await pending.move(file, { overwrite: true });
  return { uri: file.uri, filename };
}

export async function shareSession(file: SavedFile, _session: ExportSession) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      '이 기기에서 파일 공유를 사용할 수 없습니다. 기록은 앱 안에 저장되어 있습니다.',
    );
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: '진동 신호 감소율 기록 공유',
  });
}
