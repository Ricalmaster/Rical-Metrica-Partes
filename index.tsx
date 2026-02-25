import React, { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";
import { Upload, FileText, Download, Loader2, RefreshCw, Scissors, Layers, Box, Info, FileType, Save, Pencil, Table as TableIcon, LayoutList, Link, FileSpreadsheet, AlertCircle } from "lucide-react";
import "./src/index.css";

// --- Types ---

type Part = {
  name: string;
  code: string;
  color: string;
  material: string;
  category: string; // DC, FC, HC
  quantity: string;
  notes?: string;
};

type ProjectInfo = {
  reference: string;
  collection: string;
  date: string;
  totalMolds: string;
};

type AnalysisResult = {
  projectInfo: ProjectInfo;
  parts: Part[];
};

// --- API Helper ---

const analyzeSheet = async (base64Data: string, mimeType: string): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analiza esta ficha técnica de marroquinería (imagen o PDF) para generar una orden de producción estructurada.
    
    1. PROYECTO: Extrae Referencia, Colección, Fecha, Moldes.
    2. PIEZAS: Identifica cada molde/pieza individual mostrada.
    
    3. CONTEXTO DE TAMAÑO (DC/FC/HC):
       - Busca en la ficha los encabezados o secciones "DC" (Grande), "FC" (Mediano), "HC" (Pequeño).
       - Asigna a cada pieza su TAMAÑO correspondiente: "DC", "FC" o "HC". Si no aplica, déjalo vacío.
    
    4. REGLAS DE AGRUPACIÓN DE MATERIALES:
       - Agrupa los materiales por tipo: "CUERO 1", "CUERO 2", "FORRO 1", "FORRO 2", "EVA", "CARTON", "ODENA", "SALPA", "REATA", "CREMALLERA".
       - NO uses DC/FC/HC como nombre de material. Úsalos solo para el TAMAÑO.
    
    5. DATOS POR PIEZA:
       - Nombre (ej: "FRENTE", "VISTA").
       - Código y Color: Si el código aparece como "CODIGO/COLOR" (ej: "304/NEGRO"), SEPARA "304" en el campo 'code' y "NEGRO" en el campo 'color'.
       - Material (Usa las etiquetas del paso 4: "CUERO 1", "CUERO 2", etc.).
       - Tamaño (DC, FC, HC).
       - Cantidad (ej: "1", "2").
       - Notas: BUSCA LAS DIMENSIONES (Ancho x Alto) de la pieza.
         - IMPORTANTE: Conviértelas a MILÍMETROS (mm) si es necesario.
         - Escríbelas en este formato exacto: "DIM: 230x150".
         - Si hay otras notas, agrégalas después.
    
    Normaliza todo a mayúsculas.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectInfo: {
              type: Type.OBJECT,
              properties: {
                reference: { type: Type.STRING, description: "Código de referencia o nombre del artículo (ej: LK70311)" },
                collection: { type: Type.STRING, description: "Colección o cliente (ej: CROWN COLLECTION)" },
                date: { type: Type.STRING, description: "Fecha de la ficha" },
                totalMolds: { type: Type.STRING, description: "Total de moldes indicados" }
              }
            },
            parts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Nombre de la pieza" },
                  code: { type: Type.STRING, description: "Código del material (parte antes del /)" },
                  color: { type: Type.STRING, description: "Color del material (parte después del /)" },
                  material: { type: Type.STRING, description: "Tipo de material agrupado (Cuero 1, Cuero 2, Eva, etc)" },
                  category: { type: Type.STRING, description: "Tamaño: DC, FC, HC" },
                  quantity: { type: Type.STRING, description: "Cantidad numérica (ej: 1, 2)" },
                  notes: { type: Type.STRING, description: "Dimensiones (formato DIM: WxH) y otras notas" }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("NO_CONTENT");
    
    // Clean potential markdown wrapping
    const cleanText = text.replace(/```json|```/g, '').trim();

    return JSON.parse(cleanText) as AnalysisResult;
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    
    let title = "Error procesando el archivo";
    let suggestion = "Intente nuevamente con otro archivo o verifique su conexión.";
    const errStr = error.toString();

    if (error instanceof SyntaxError) {
        title = "Error de lectura de datos";
        suggestion = "La IA no pudo estructurar la información correctamente. Intente subir una imagen más clara, con mejor iluminación o recorte solo la tabla de materiales.";
    } else if (errStr.includes("400") || errStr.includes("INVALID_ARGUMENT")) {
        title = "Archivo no soportado";
        suggestion = "El formato del archivo parece estar dañado o no es válido. Asegúrese de subir un PDF o imagen (JPG/PNG) estándar.";
    } else if (errStr.includes("401") || errStr.includes("403") || errStr.includes("API key")) {
        title = "Error de autorización";
        suggestion = "Verifique que la API Key esté configurada correctamente en el entorno.";
    } else if (errStr.includes("429") || errStr.includes("exhausted")) {
        title = "Límite de solicitudes excedido";
        suggestion = "El servicio está ocupado momentáneamente. Por favor, espere un minuto antes de intentar de nuevo.";
    } else if (errStr.includes("500") || errStr.includes("503") || errStr.includes("Overloaded")) {
        title = "Servicio de IA no disponible";
        suggestion = "Google Gemini está experimentando alta demanda. Intente nuevamente en unos instantes.";
    } else if (error.message === "NO_CONTENT") {
        title = "Sin resultados";
        suggestion = "El modelo no pudo extraer texto del archivo. Verifique que la imagen contenga una ficha técnica legible.";
    }

    throw new Error(JSON.stringify({ title, suggestion }));
  }
};

// --- Helper Functions ---

const calculateConsumption = (part: Part): string => {
  // Combine fields to search for dimensions
  const textToSearch = `${part.notes || ""} ${part.quantity || ""}`;

  // Regex to find dimensions: Number + optional unit + x/X/* + Number + optional unit
  // Handles: "200x300", "200 x 300", "200mm x 300mm", "DIM: 200x300"
  const dimRegex = /(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m)?\s*[xX*]\s*(\d+(?:[.,]\d+)?)/;
  const match = textToSearch.match(dimRegex);

  if (!match) return "-";

  let width = parseFloat(match[1].replace(',', '.'));
  let height = parseFloat(match[2].replace(',', '.'));

  // Extract quantity
  // If quantity field looks like a dimension (e.g. "200x300"), assume qty 1
  // Otherwise look for a standalone number
  let qty = 1;
  const qtyStr = part.quantity || "1";
  
  if (!qtyStr.match(/\d+\s*[xX*]\s*\d+/)) {
      const qMatch = qtyStr.match(/(\d+)/);
      if (qMatch) qty = parseInt(qMatch[1]);
  }

  if (isNaN(width) || isNaN(height) || isNaN(qty)) return "-";

  // Area in square millimeters
  const areaMm2 = width * height * qty;

  // 3. Check code for unit selection
  // If code starts with "1VAQ" -> ft² (pies cuadrados)
  // Else -> dm² (decímetros cuadrados)
  const cleanCode = (part.code || "").trim().toUpperCase();
  const isFt2 = cleanCode.startsWith("1VAQ");

  if (isFt2) {
    // 1 ft² = 92903.04 mm²
    const areaFt2 = areaMm2 / 92903.04;
    return `${areaFt2.toFixed(2)} ft²`;
  } else {
    // 1 dm² = 10000 mm²
    const areaDm2 = areaMm2 / 10000;
    return `${areaDm2.toFixed(2)} dm²`;
  }
};

const sortMaterials = (a: string, b: string) => {
  const upperA = a.toUpperCase();
  const upperB = b.toUpperCase();
  
  // Custom priority: CUERO always first
  const isCueroA = upperA.includes("CUERO");
  const isCueroB = upperB.includes("CUERO");

  if (isCueroA && !isCueroB) return -1;
  if (!isCueroA && isCueroB) return 1;

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

const sortParts = (parts: Part[]) => {
  return [...parts].sort((a, b) => {
    // 1. Sort by Material Group
    const matComp = sortMaterials(a.material || "ZZZ", b.material || "ZZZ");
    if (matComp !== 0) return matComp;

    // 2. Sort by Category (DC > FC > HC)
    const getCatPriority = (cat: string = "") => {
      if (cat.includes("DC")) return 1;
      if (cat.includes("FC")) return 2;
      if (cat.includes("HC")) return 3;
      return 4;
    };
    const catA = getCatPriority(a.category);
    const catB = getCatPriority(b.category);
    if (catA !== catB) return catA - catB;

    // 3. Sort by Name
    return a.name.localeCompare(b.name);
  });
};

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

// --- Components ---

const App = () => {
  // ... (state declarations remain same)
  const [fileData, setFileData] = useState<{data: string, mime: string, name: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  
  const [error, setError] = useState<{title: string, suggestion: string} | null>(null);
  const [activeTab, setActiveTab] = useState<'materials' | 'table'>('table'); // Default to table for overview
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetApp = () => {
    setFileData(null);
    setProjectInfo(null);
    setParts([]);
    setError(null);
    setActiveTab('table');
    setProcessedCount(0);
    setTotalFiles(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);
    setProjectInfo(null);
    setParts([]);
    setProcessedCount(0);
    setTotalFiles(files.length);

    const allParts: Part[] = [];
    let firstProjectInfo: ProjectInfo | null = null;
    let lastFileData: {data: string, mime: string, name: string} | null = null;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await readFileAsBase64(file);
        const base64Data = base64.split(',')[1];
        const mimeType = file.type;

        // Keep reference to the first file for display preview
        if (i === 0) {
           lastFileData = { data: base64, mime: mimeType, name: `${files.length} archivo(s)` };
           setFileData(lastFileData);
        }

        const data = await analyzeSheet(base64Data, mimeType);
        
        if (!firstProjectInfo) {
            firstProjectInfo = data.projectInfo;
        }
        allParts.push(...data.parts);
        setProcessedCount(prev => prev + 1);
      }

      setProjectInfo(firstProjectInfo);
      setParts(allParts);

    } catch (err: any) {
      console.error(err);
      try {
        const parsedError = JSON.parse(err.message);
        setError(parsedError);
      } catch {
        setError({ 
          title: "Error inesperado", 
          suggestion: err.message || "Ocurrió un error desconocido al procesar el archivo." 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePartUpdate = (index: number, field: keyof Part, value: string, propagateToGroup: boolean = false) => {
    const newParts = [...parts];
    const targetPart = newParts[index];
    
    // Update the specific part
    newParts[index] = { ...targetPart, [field]: value };

    // If propagating code or color update (e.g. from first row of a group)
    if (propagateToGroup && (field === 'code' || field === 'color') && targetPart.material) {
      const targetMaterial = targetPart.material;
      // Update all other parts with same material
      for (let i = 0; i < newParts.length; i++) {
        if (newParts[i].material === targetMaterial) {
          newParts[i] = { ...newParts[i], [field]: value };
        }
      }
    }

    setParts(newParts);
  };

  const downloadExcel = () => {
    if (!projectInfo) return;
    
    // Sort parts for Excel export
    const sortedParts = sortParts(parts);
    
    // Construct HTML Table for Excel (Works with all Excel versions and separates columns reliably)
    const tableContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Orden de Producción</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th { background-color: #f3f4f6; color: #1f2937; border: 1px solid #9ca3af; padding: 8px; text-align: center; font-weight: bold; }
          td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; }
          .material { font-weight: bold; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              <th style="width: 150px">Grupo Material</th>
              <th style="width: 100px">Tamaño</th>
              <th style="width: 200px">Pieza</th>
              <th style="width: 200px">Notas</th>
              <th style="width: 120px">Código Material</th>
              <th style="width: 120px">Color</th>
              <th style="width: 100px">Cantidad</th>
              <th style="width: 120px">Consumo</th>
              <th style="width: 150px">Referencia Proyecto</th>
              <th style="width: 150px">Colección</th>
            </tr>
          </thead>
          <tbody>
            ${sortedParts.map(part => `
              <tr>
                <td class="material">${part.material?.toUpperCase() || ''}</td>
                <td>${part.category || ''}</td>
                <td>${part.name}</td>
                <td>${part.notes || ''}</td>
                <td style="mso-number-format:'\\@'">${part.code || ''}</td> <!-- Force text format for codes -->
                <td style="mso-number-format:'\\@'">${part.color || ''}</td> <!-- Force text format for colors (prevents 001 -> 1) -->
                <td>${part.quantity}</td>
                <td>${calculateConsumption(part)}</td>
                <td>${projectInfo.reference}</td>
                <td>${projectInfo.collection}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([tableContent], { type: 'application/vnd.ms-excel' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Orden_${projectInfo.reference || 'Produccion'}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to group data dynamically for rendering
  const getGroupedParts = () => {
    // First, sort the entire list so that when we group, the items inside are already sorted by Category
    const sortedList = sortParts(parts);
    
    const grouped: Record<string, { part: Part, index: number }[]> = {};
    // We need to map back to original indices for updates to work correctly
    // So we iterate the ORIGINAL list but we need to display them sorted.
    // Actually, it's easier to group first, then sort the groups.
    
    parts.forEach((part, index) => {
      const mat = part.material ? part.material.toUpperCase().trim() : "SIN DEFINIR";
      if (!grouped[mat]) grouped[mat] = [];
      grouped[mat].push({ part, index });
    });

    // Sort items within each group by Category (DC > FC > HC)
    Object.keys(grouped).forEach(key => {
        grouped[key].sort((a, b) => {
            const getCatPriority = (cat: string = "") => {
                if (cat.includes("DC")) return 1;
                if (cat.includes("FC")) return 2;
                if (cat.includes("HC")) return 3;
                return 4;
            };
            return getCatPriority(a.part.category) - getCatPriority(b.part.category);
        });
    });

    const sortedKeys = Object.keys(grouped).sort(sortMaterials);
    return { grouped, sortedKeys };
  };

  const renderMaterialCards = () => {
    if (!parts.length) return null;
    const { grouped, sortedKeys } = getGroupedParts();

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedKeys.map((material) => {
          const items = grouped[material];
          
          let headerColor = "bg-slate-800 border-slate-700";
          let iconColor = "text-blue-300";
          
          if (material.includes("CUERO 1")) { headerColor = "bg-amber-900 border-amber-800"; iconColor = "text-amber-300"; }
          else if (material.includes("CUERO 2")) { headerColor = "bg-amber-800 border-amber-700"; iconColor = "text-amber-200"; }
          else if (material.includes("CUERO")) { headerColor = "bg-amber-950 border-amber-900"; iconColor = "text-amber-400"; }
          else if (material.includes("FORRO")) { headerColor = "bg-indigo-900 border-indigo-800"; iconColor = "text-indigo-300"; }
          
          return (
            <div key={material} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full ring-1 ring-slate-100 transition-all hover:shadow-md">
              <div className={`${headerColor} px-4 py-3 border-b flex justify-between items-center`}>
                <h3 className="text-white font-medium flex items-center gap-2">
                  <Layers size={16} className={iconColor}/>
                  {material}
                </h3>
                <span className="bg-black/30 text-xs text-white px-2 py-1 rounded-full backdrop-blur-sm">
                  {items.length} pzs
                </span>
              </div>
              <div className="p-0 flex-grow">
                <table className="w-full text-sm text-left">
                  <tbody className="divide-y divide-gray-100">
                    {items.map(({ part, index }, groupIdx) => (
                      <tr key={index} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800 mb-1">{part.name}</div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-400 w-8">Cod:</span>
                            <div className="relative w-full">
                                <input 
                                type="text"
                                value={part.code}
                                onChange={(e) => handlePartUpdate(index, 'code', e.target.value, groupIdx === 0)}
                                placeholder="---"
                                className="w-full text-xs font-mono border-b border-gray-200 focus:border-blue-500 outline-none bg-transparent py-0.5 text-blue-700 placeholder-gray-300 focus:bg-white transition-all"
                                />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-8">Col:</span>
                            <div className="relative w-full">
                                <input 
                                type="text"
                                value={part.color}
                                onChange={(e) => handlePartUpdate(index, 'color', e.target.value, groupIdx === 0)}
                                placeholder="---"
                                className="w-full text-xs font-mono border-b border-gray-200 focus:border-purple-500 outline-none bg-transparent py-0.5 text-purple-700 placeholder-gray-300 focus:bg-white transition-all"
                                />
                                {groupIdx === 0 && (
                                    <div className="absolute right-0 top-0 text-[8px] text-blue-400 opacity-0 group-hover:opacity-100 pointer-events-none">
                                        (Actualiza todo el grupo)
                                    </div>
                                )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600 align-top pt-3">
                          {part.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderGroupedTable = () => {
    if (!parts.length) return null;
    const { grouped, sortedKeys } = getGroupedParts();

    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-white">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 w-1/6">Pieza</th>
              <th className="px-6 py-4 w-16">Tam.</th>
              <th className="px-6 py-4 w-1/6">Código</th>
              <th className="px-6 py-4 w-1/6">Color</th>
              <th className="px-6 py-4 w-1/6">Grupo Material</th>
              <th className="px-6 py-4 w-16">Cant.</th>
              <th className="px-6 py-4 w-24">Consumo</th>
              <th className="px-6 py-4">Notas (Dimensiones)</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {sortedKeys.map((material) => {
               const items = grouped[material];
               // Determine style for header row
               let bgClass = "bg-gray-100 text-gray-800";
               if (material.includes("CUERO")) bgClass = "bg-amber-50 text-amber-900 border-l-4 border-amber-600";
               else if (material.includes("FORRO")) bgClass = "bg-indigo-50 text-indigo-900 border-l-4 border-indigo-500";
               else if (material.includes("EVA") || material.includes("ODENA")) bgClass = "bg-slate-100 text-slate-700 border-l-4 border-slate-400";

               return (
                 <React.Fragment key={material}>
                   {/* Material Group Header */}
                   <tr className={`${bgClass} border-y border-gray-200`}>
                     <td colSpan={8} className="px-6 py-2 font-bold flex items-center gap-2">
                       <Layers size={16} />
                       {material} 
                       <span className="text-xs font-normal opacity-70 ml-2">({items.length} piezas)</span>
                     </td>
                   </tr>
                   {/* Items in this group */}
                   {items.map(({ part, index }, groupIdx) => (
                     <tr key={index} className="hover:bg-blue-50/50 border-b border-gray-50 last:border-b-0 group">
                       <td className="px-6 py-3 font-medium text-gray-900">{part.name}</td>
                       <td className="px-6 py-3">
                         <input 
                            type="text"
                            value={part.category}
                            onChange={(e) => handlePartUpdate(index, 'category', e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-gray-200 text-center text-xs font-bold text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="-"
                         />
                       </td>
                       <td className="px-6 py-3 relative">
                         <div className="relative">
                            <input 
                                type="text" 
                                value={part.code} 
                                onChange={(e) => handlePartUpdate(index, 'code', e.target.value, groupIdx === 0)}
                                placeholder={groupIdx === 0 ? "Código..." : "Igual..."}
                                className={`w-full px-3 py-1.5 rounded border text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all ${!part.code ? 'border-amber-300 bg-amber-50' : 'border-gray-200'} ${groupIdx === 0 ? 'ring-1 ring-blue-100' : ''}`}
                            />
                            {groupIdx === 0 && (
                                <div className="absolute -right-6 top-1/2 -translate-y-1/2 text-blue-400" title="Editar este código actualiza todo el grupo">
                                    <Link size={14} />
                                </div>
                            )}
                         </div>
                       </td>
                       <td className="px-6 py-3 relative">
                         <div className="relative">
                            <input 
                                type="text" 
                                value={part.color} 
                                onChange={(e) => handlePartUpdate(index, 'color', e.target.value, groupIdx === 0)}
                                placeholder={groupIdx === 0 ? "Color..." : "Igual..."}
                                className={`w-full px-3 py-1.5 rounded border text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none transition-all border-gray-200 ${groupIdx === 0 ? 'ring-1 ring-purple-100' : ''}`}
                            />
                         </div>
                       </td>
                       <td className="px-6 py-3">
                         <input 
                            type="text"
                            value={part.material}
                            onChange={(e) => handlePartUpdate(index, 'material', e.target.value)}
                            className="w-full px-3 py-1.5 rounded border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-500 focus:text-gray-900"
                         />
                       </td>
                       <td className="px-6 py-3 font-mono text-gray-600">
                          <input 
                            type="text"
                            value={part.quantity}
                            onChange={(e) => handlePartUpdate(index, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-gray-200 text-right focus:ring-2 focus:ring-blue-500 outline-none"
                         />
                       </td>
                       <td className="px-6 py-3 font-mono text-xs font-bold text-blue-600">
                          {calculateConsumption(part)}
                       </td>
                       <td className="px-6 py-3 text-gray-500 text-xs">{part.notes || "-"}</td>
                     </tr>
                   ))}
                 </React.Fragment>
               );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <header className="bg-slate-900 text-white pt-10 pb-24 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Scissors className="text-amber-400" />
            Gestor de Despiece
          </h1>
          <p className="text-slate-400 max-w-2xl">
            Sube tu ficha. El sistema organizará automáticamente por <strong>Cuero 1, Cuero 2, Forro, etc.</strong> 
            <br/>
            <span className="text-amber-300 text-sm mt-1 inline-block">
              ✨ Tip: Edita el primer código de un grupo para actualizar todos los materiales de ese tipo.
            </span>
          </p>
        </div>
        {/* Abstract shapes */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute top-0 right-40 w-64 h-64 bg-amber-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
      </header>

      <main className="max-w-7xl mx-auto px-6 -mt-16 relative z-20">
        
        {/* Upload Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
          {!fileData ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group"
            >
              <div className="bg-blue-100 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                <Upload className="text-blue-600" size={32} />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">Paso 1: Sube tu Ficha Técnica</h3>
              <p className="text-slate-500 text-sm mt-1">Soporta Imágenes (JPG, PNG) y PDF</p>
              <p className="text-slate-400 text-xs mt-2">Puedes seleccionar múltiples archivos</p>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*,application/pdf" 
                multiple
                className="hidden" 
                onChange={handleFileUpload} 
              />
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="w-full md:w-1/3">
                <div className="rounded-lg overflow-hidden border border-slate-200 shadow-sm relative group bg-gray-100 flex items-center justify-center min-h-[300px]">
                  {fileData.mime.startsWith('image/') ? (
                    <img src={fileData.data} alt="Uploaded sheet" className="w-full h-auto object-cover" />
                  ) : (
                    <div className="text-center p-8">
                      <FileText size={64} className="mx-auto text-red-500 mb-4" />
                      <p className="font-medium text-slate-700">{fileData.name}</p>
                      <p className="text-sm text-slate-500">Documento PDF</p>
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={resetApp}
                      className="bg-white text-slate-900 px-4 py-2 rounded-lg font-medium hover:bg-slate-100 transition-colors"
                    >
                      Cambiar Archivo
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-2/3 space-y-6">
                {loading && (
                  <div className="h-full flex flex-col items-center justify-center py-12 text-slate-500">
                    <Loader2 className="animate-spin mb-4 text-blue-600" size={48} />
                    <p className="font-medium">Analizando y unificando información...</p>
                    {totalFiles > 1 && (
                        <p className="text-sm text-slate-400 mt-1">Procesando archivo {processedCount + 1} de {totalFiles}...</p>
                    )}
                    <p className="text-sm text-center max-w-xs mt-2">Agrupando piezas por tipo de material (Cuero 1, Cuero 2, etc.)</p>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="mt-0.5 text-red-600 flex-shrink-0" size={20} />
                    <div className="flex-grow">
                      <h4 className="font-bold text-sm mb-1">{error.title}</h4>
                      <p className="text-sm text-red-700/90">{error.suggestion}</p>
                    </div>
                    <button onClick={() => setFileData(null)} className="ml-2 text-sm font-medium underline text-red-600 hover:text-red-800 whitespace-nowrap">
                      Reintentar
                    </button>
                  </div>
                )}

                {projectInfo && (
                  <div className="animate-fade-in">
                    {/* Project Metadata */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Referencia</p>
                        <p className="font-semibold text-slate-800">{projectInfo.reference || "N/A"}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Colección</p>
                        <p className="font-semibold text-slate-800">{projectInfo.collection || "N/A"}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Fecha</p>
                        <p className="font-semibold text-slate-800">{projectInfo.date || "N/A"}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Total Moldes</p>
                        <p className="font-semibold text-slate-800">{projectInfo.totalMolds || "N/A"}</p>
                      </div>
                    </div>

                    {/* Step 3 & 4 Call to Action */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                         <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                           <Pencil size={20} />
                         </div>
                         <div>
                           <h3 className="font-semibold text-amber-900">Validación de Códigos</h3>
                           <p className="text-sm text-amber-800">
                             Al actualizar la primera casilla de código de un grupo, el sistema autocompletará el resto del grupo automáticamente.
                           </p>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                            onClick={resetApp}
                            className="whitespace-nowrap flex items-center gap-2 bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 px-5 py-3 rounded-lg font-medium transition-colors shadow-sm"
                        >
                            <RefreshCw size={18} />
                            Nueva Ficha
                        </button>
                        <button 
                            onClick={downloadExcel}
                            className="whitespace-nowrap flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-lg font-medium transition-colors shadow-lg shadow-emerald-200"
                        >
                            <FileSpreadsheet size={18} />
                            Descargar Excel
                        </button>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-0 mb-6">
                        <button 
                          onClick={() => setActiveTab('table')}
                          className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium transition-all ${activeTab === 'table' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                          <TableIcon size={18} />
                          Tabla Agrupada
                        </button>
                        <button 
                          onClick={() => setActiveTab('materials')}
                          className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium transition-all ${activeTab === 'materials' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                          <Layers size={18} />
                          Tarjetas por Grupo
                        </button>
                    </div>

                    {/* Content Views */}
                    {activeTab === 'materials' ? renderMaterialCards() : renderGroupedTable()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
