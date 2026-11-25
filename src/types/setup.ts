export type ScreenOrientation = 'screen_up_top_away' | 'screen_down_top_away';
export type CaseMaterial = 'none' | 'plastic' | 'rubber';
export type SurfaceType = 'desk' | 'floor';
export type SurfaceMaterial =
  'wood' | 'metal' | 'glass' | 'stone' | 'tile' | 'vinyl' | 'concrete' | 'other';

export type MeasurementEnvironment = {
  orientation: ScreenOrientation;
  case_material: CaseMaterial;
  surface_type: SurfaceType;
  surface_material: SurfaceMaterial;
  note: string;
};

export type DampingSetup = {
  hand: 'right';
  pinch_type: 'thumb_index';
  /** Legacy desk field. Floor measurements have no table material. */
  table_material: string | null;
  case_on: boolean;
  orientation: ScreenOrientation;
  /** Absent in older records; never infer a case material from case_on alone. */
  case_material?: CaseMaterial;
  surface_type?: SurfaceType;
  surface_material?: SurfaceMaterial;
  contact_points: 'right_thumb_left_index_midpoints';
  note: string;
};
