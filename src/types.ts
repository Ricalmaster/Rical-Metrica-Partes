
export interface RawPart {
  id: string;
  material: string;
  color: string;
  description: string;
  notes: string;
  width: number; // in mm
  height: number; // in mm
  quantity: number;
}

export interface ProcessedPart extends RawPart {
  leatherLabel?: string; // e.g., "Cuero 1", "Cuero 2"
  finalDescription: string;
  area: number;
  areaUnit: 'dm²' | 'ft²' | 'N/A';
}
