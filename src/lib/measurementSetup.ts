import type { DampingSetup, MeasurementEnvironment } from '../types/setup';

export const ORIENTATION_OPTIONS = [
  { value: 'screen_up_top_away', label: '화면이 위로', description: '휴대폰 뒷면이 닿아요' },
  { value: 'screen_down_top_away', label: '화면이 아래로', description: '화면이 받침에 닿아요' },
] as const;
export const CASE_OPTIONS = [
  { value: 'none', label: '케이스 없음' },
  { value: 'plastic', label: '플라스틱' },
  { value: 'rubber', label: '고무' },
] as const;
export const SURFACE_OPTIONS = [
  { value: 'desk', label: '책상' },
  { value: 'floor', label: '바닥' },
] as const;
export const MATERIAL_OPTIONS = [
  { value: 'wood', label: '목재' },
  { value: 'metal', label: '철재·금속' },
  { value: 'glass', label: '유리' },
  { value: 'stone', label: '석재' },
  { value: 'tile', label: '타일' },
  { value: 'vinyl', label: '장판' },
  { value: 'concrete', label: '콘크리트' },
  { value: 'other', label: '기타' },
] as const;

export const DEFAULT_MEASUREMENT_ENVIRONMENT: MeasurementEnvironment = {
  orientation: 'screen_up_top_away',
  case_material: 'none',
  surface_type: 'desk',
  surface_material: 'wood',
  note: '',
};

export function createMeasurementSetup(environment: MeasurementEnvironment): DampingSetup {
  return {
    ...environment,
    hand: 'right',
    pinch_type: 'thumb_index',
    table_material: environment.surface_type === 'desk' ? environment.surface_material : null,
    case_on: environment.case_material !== 'none',
    contact_points: 'right_thumb_left_index_midpoints',
  };
}

/** Validate new metadata without manufacturing missing fields in historical records. */
export function validSetupExtension(setup: Record<string, unknown>): boolean {
  const has = (options: readonly { value: string }[], value: unknown) =>
    options.some((option) => option.value === value);
  if (setup.orientation !== undefined && !has(ORIENTATION_OPTIONS, setup.orientation)) return false;
  if (
    setup.case_material !== undefined &&
    (!has(CASE_OPTIONS, setup.case_material) || setup.case_on !== (setup.case_material !== 'none'))
  )
    return false;
  if (setup.surface_type !== undefined || setup.surface_material !== undefined) {
    if (!has(SURFACE_OPTIONS, setup.surface_type) || !has(MATERIAL_OPTIONS, setup.surface_material))
      return false;
    if (setup.table_material !== (setup.surface_type === 'desk' ? setup.surface_material : null))
      return false;
  }
  return true;
}

export function describeMeasurementSetup(setup: DampingSetup): string {
  const orientation =
    ORIENTATION_OPTIONS.find((o) => o.value === setup.orientation)?.label ?? '방향 미기록';
  const caseLabel =
    CASE_OPTIONS.find((o) => o.value === setup.case_material)?.label ??
    (setup.case_on ? '케이스 있음 · 재질 미기록' : '케이스 없음');
  const material = setup.surface_material ?? setup.table_material;
  const materialLabel =
    MATERIAL_OPTIONS.find((o) => o.value === material)?.label ?? material ?? '재질 미기록';
  return `${orientation} · ${caseLabel} · ${setup.surface_type === 'floor' ? '바닥' : '책상'} / ${materialLabel}`;
}
