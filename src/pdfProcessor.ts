import * as pdfjsLib from 'pdfjs-dist';
import { RawPart } from './types';

// Set worker source
// Use a fixed version if dynamic version fails, or fallback to a known working CDN
const pdfjsVersion = pdfjsLib.version || '3.11.174';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;

console.log('PDF.js version:', pdfjsVersion);

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function extractDataFromPdf(file: File): Promise<RawPart[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const parts: RawPart[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Extract items with position
    const items: TextItem[] = textContent.items.map((item: any) => {
      // transform is [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const tx = item.transform;
      return {
        str: item.str,
        x: tx[4],
        y: tx[5],
        width: item.width,
        height: item.height
      };
    }).filter(item => item.str.trim().length > 0);

    // Group by rows (using Y coordinate)
    const rows = groupItemsByRows(items);

    // Process rows
    for (const row of rows) {
      const part = parseRowToPart(row);
      if (part) {
        parts.push(part);
      }
    }
  }

  return parts;
}

function groupItemsByRows(items: TextItem[]): TextItem[][] {
  // Sort by Y descending (top to bottom), then X ascending (left to right)
  items.sort((a, b) => {
    if (Math.abs(a.y - b.y) < 5) { // Tolerance of 5 units for same row
      return a.x - b.x;
    }
    return b.y - a.y; // PDF Y coordinates start from bottom
  });

  const rows: TextItem[][] = [];
  if (items.length === 0) return rows;

  let currentRow: TextItem[] = [items[0]];
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const prevItem = currentRow[0];
    
    // Check if same row (within tolerance)
    if (Math.abs(item.y - prevItem.y) < 5) {
      currentRow.push(item);
    } else {
      // Sort items in the finished row by X
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
      currentRow = [item];
    }
  }
  // Push last row
  currentRow.sort((a, b) => a.x - b.x);
  rows.push(currentRow);

  return rows;
}

function parseRowToPart(row: TextItem[]): RawPart | null {
  let material = '';
  let color = '';
  let width = 0;
  let height = 0;
  let quantity = 0;
  let descriptionParts: string[] = [];
  const numbers: number[] = [];

  // Regex patterns
  const materialStartRegex = /^(1cap|1vaq)/i;
  const dimensionRegex = /(\d+)\s*[xX*]\s*(\d+)/;
  const quantityRegex = /^\d+$/;

  let materialFound = false;
  let dimensionsFound = false;

  for (const item of row) {
    const text = item.str.trim();
    if (!text) continue;

    // 1. Check for Material (contains '/' or starts with known prefix)
    // We prioritize explicit material codes
    if (!materialFound && (text.includes('/') || materialStartRegex.test(text))) {
      // It looks like a material code
      if (text.includes('/')) {
        const parts = text.split('/');
        material = parts[0].trim();
        color = parts.slice(1).join('/').trim();
      } else {
        material = text;
      }
      materialFound = true;
      continue;
    }

    // 2. Check for Dimensions in "WxH" format
    const dimMatch = text.match(dimensionRegex);
    if (!dimensionsFound && dimMatch) {
      width = parseInt(dimMatch[1]);
      height = parseInt(dimMatch[2]);
      dimensionsFound = true;
      continue;
    }

    // 3. Collect standalone numbers
    if (quantityRegex.test(text)) {
      numbers.push(parseInt(text));
      continue;
    }

    // 4. Description
    // Ignore very short strings that might be garbage unless they are part of description
    if (text.length > 1 || /[a-zA-Z]/.test(text)) {
        descriptionParts.push(text);
    }
  }

  // Logic to assign standalone numbers to Width/Height/Quantity
  if (!dimensionsFound) {
     if (numbers.length >= 2) {
        // Assume first two are W x H
        width = numbers[0];
        height = numbers[1];
        if (numbers.length >= 3) {
           // Third is Quantity
           quantity = numbers[2];
        }
     } else if (numbers.length === 1) {
        // Only one number? Ambiguous. Could be quantity if material is present.
        quantity = numbers[0];
     }
  } else {
     // Dimensions already found (e.g. "300x400")
     // Remaining numbers are likely quantity
     if (numbers.length > 0) {
        quantity = numbers[0];
     }
  }

  // Default quantity
  if (quantity === 0) quantity = 1;

  // Validation: A row is a "part" if it has at least a material OR dimensions.
  if (materialFound || (width > 0 && height > 0)) {
    return {
      id: crypto.randomUUID(),
      material: material,
      color: color,
      description: descriptionParts.join(' '),
      notes: '',
      width: width,
      height: height,
      quantity: quantity,
    };
  }

  return null;
}
