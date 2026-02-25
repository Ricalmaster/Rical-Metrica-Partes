import { RawPart, ProcessedPart } from './types';

export function processParts(parts: RawPart[]): ProcessedPart[] {
  const leatherMap = new Map<string, string>();
  let leatherCounter = 1;

  return parts.map((part) => {
    const { material, color, description, notes, width, height, quantity } = part;

    // 2. Merge Notes
    const finalDescription = notes ? `${description} ${notes}`.trim() : description;

    // 3. Identify Leather and Label
    let leatherLabel: string | undefined;
    let area = 0;
    let areaUnit: 'dm²' | 'ft²' | 'N/A' = 'N/A';

    // Use material directly (trim just in case)
    const codePart1 = material.trim();
    
    const lowerMaterial = codePart1.toLowerCase();
    const isCaprino = lowerMaterial.startsWith('1cap');
    const isVacuno = lowerMaterial.startsWith('1vaq');

    if (isCaprino || isVacuno) {
      // Determine label based on unique code (Part 1 usually identifies the material base)
      const materialKey = codePart1.toLowerCase();
      
      if (!leatherMap.has(materialKey)) {
        leatherMap.set(materialKey, `Cuero ${leatherCounter}`);
        leatherCounter++;
      }
      leatherLabel = leatherMap.get(materialKey);

      // 4. Calculate Area
      // Input dimensions are in mm
      const totalAreaMm2 = width * height * quantity;

      if (isCaprino) {
        // dm² calculation (1 dm² = 100 cm² = 10000 mm²)
        area = totalAreaMm2 / 10000;
        areaUnit = 'dm²';
      } else if (isVacuno) {
        // ft² calculation (1 ft² ≈ 929.03 cm² = 92903 mm²)
        area = totalAreaMm2 / 92903.04;
        areaUnit = 'ft²';
      }
    }

    return {
      ...part,
      finalDescription,
      leatherLabel,
      area: Number(area.toFixed(2)),
      areaUnit,
    };
  });
}
