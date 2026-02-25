import React, { useState, useRef } from 'react';
import { Plus, Trash2, Calculator, FileText, Download, X, Upload } from 'lucide-react';
import { RawPart, ProcessedPart } from './types';
import { processParts } from './leatherProcessor';
import { extractDataFromPdf } from './pdfProcessor';

function App() {
  const [parts, setParts] = useState<RawPart[]>([
    { id: '1', material: '1cap-Negro', color: 'Liso', description: 'Frente Bolso', notes: 'Refilar bordes', width: 300, height: 400, quantity: 2 },
    { id: '2', material: '1vaq-Cafe', color: 'Grano', description: 'Correa', notes: '', width: 1000, height: 50, quantity: 1 },
  ]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const addRow = () => {
    const newPart: RawPart = {
      id: crypto.randomUUID(),
      material: '',
      color: '',
      description: '',
      notes: '',
      width: 0,
      height: 0,
      quantity: 1,
    };
    setParts([...parts, newPart]);
  };

  const updatePart = (id: string, field: keyof RawPart, value: string | number) => {
    setParts((prevParts) => prevParts.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const updatePartFields = (id: string, updates: Partial<RawPart>) => {
    setParts((prevParts) => prevParts.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removePart = (id: string) => {
    setParts(parts.filter((p) => p.id !== id));
  };

  const handleMaterialChange = (id: string, value: string) => {
    if (value.includes('/')) {
      const [material, ...rest] = value.split('/');
      const color = rest.join('/');
      updatePartFields(id, { material, color });
    } else {
      updatePartFields(id, { material: value, color: '' });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingPdf(true);
    try {
      const allNewParts: RawPart[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const extractedParts = await extractDataFromPdf(file);
        allNewParts.push(...extractedParts);
      }
      setParts((prevParts) => [...prevParts, ...allNewParts]);
      showNotification(`Se integraron ${allNewParts.length} registros de ${files.length} archivo(s) correctamente.`);
    } catch (error) {
      console.error('Error processing PDF:', error);
      showNotification('Error al procesar los archivos. Verifique el formato.', 'error');
    } finally {
      setIsProcessingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const processedParts = processParts(parts);

  const handleExport = (unit: 'dm²' | 'ft²') => {
    const csvContent = [
      ['Material', 'Color', 'Descripción', 'Ancho (mm)', 'Alto (mm)', 'Cantidad', `Área (${unit})`],
      ...parts.map(part => {
        const areaMm2 = part.width * part.height * part.quantity;
        let area = 0;
        if (unit === 'dm²') {
          area = areaMm2 / 10000;
        } else {
          area = areaMm2 / 92903.04;
        }
        return [
          part.material,
          part.color,
          part.description + (part.notes ? ` ${part.notes}` : ''),
          part.width,
          part.height,
          part.quantity,
          area.toFixed(2)
        ];
      })
    ].map(e => e.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fichas_tecnicas_${unit === 'dm²' ? 'dm2' : 'ft2'}.csv`;
    link.click();
    setIsExportModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between relative">
          {notification && (
            <div className={`absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full mt-[-10px] px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${
              notification.type === 'success' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'
            }`}>
              {notification.message}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span className="text-yellow-500">✂️</span> Gestor de Despiece
            </h1>
            <p className="text-gray-500 mt-1">Sube tu ficha. El sistema organizará automáticamente por <strong>Cuero 1, Cuero 2, Forro, etc.</strong></p>
            <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
              ✨ Tip: Edita el primer código de un grupo para actualizar todos los materiales de ese tipo.
            </p>
          </div>
          <div className="flex gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf"
              multiple
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingPdf}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg shadow-sm text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessingPdf ? (
                <span className="animate-pulse">Procesando...</span>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Agregar PDFs
                </>
              )}
            </button>
            <button 
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
          </div>
        </header>

        {/* Upload Hero Section (Visible when few parts) */}
        {parts.length <= 2 && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-12 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group"
          >
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Paso 1: Sube tu Ficha Técnica</h2>
            <p className="text-gray-500">Soporta archivos PDF</p>
          </div>
        )}

        {/* Input Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Entrada de Datos
            </h2>
            <button
              onClick={addRow}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar Fila
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3 w-32">Material</th>
                  <th className="px-4 py-3 w-32">Color</th>
                  <th className="px-4 py-3 w-64">Descripción</th>
                  <th className="px-4 py-3 w-48">Notas</th>
                  <th className="px-4 py-3 w-24 text-right">Ancho (mm)</th>
                  <th className="px-4 py-3 w-24 text-right">Alto (mm)</th>
                  <th className="px-4 py-3 w-24 text-right">Cant.</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parts.map((part, index) => (
                  <tr key={part.id} className="hover:bg-gray-50/50 group">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{index + 1}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={part.material}
                        onChange={(e) => handleMaterialChange(part.id, e.target.value)}
                        placeholder="1cap..."
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-gray-900 placeholder-gray-300 font-mono"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={part.color}
                        onChange={(e) => updatePart(part.id, 'color', e.target.value)}
                        placeholder="Color"
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-gray-900 placeholder-gray-300 font-mono"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={part.description}
                        onChange={(e) => updatePart(part.id, 'description', e.target.value)}
                        placeholder="Descripción de la pieza"
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-gray-900 placeholder-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={part.notes}
                        onChange={(e) => updatePart(part.id, 'notes', e.target.value)}
                        placeholder="Notas adicionales"
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-gray-900 placeholder-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        value={part.width || ''}
                        onChange={(e) => updatePart(part.id, 'width', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-right text-gray-900 font-mono"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        value={part.height || ''}
                        onChange={(e) => updatePart(part.id, 'height', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-right text-gray-900 font-mono"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        value={part.quantity}
                        onChange={(e) => updatePart(part.id, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-right text-gray-900 font-mono"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => removePart(part.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Results Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-600" />
              Resultado Procesado
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Rotulo Material</th>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3">Color</th>
                  <th className="px-4 py-3 w-1/3">Descripción Final (Desc + Notas)</th>
                  <th className="px-4 py-3 text-right">Área Calc.</th>
                  <th className="px-4 py-3 w-16">Unidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {processedParts.map((part, index) => (
                  <tr key={part.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{index + 1}</td>
                    <td className="px-4 py-3">
                      {part.leatherLabel ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          {part.leatherLabel}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">{part.material}</td>
                    <td className="px-4 py-3 font-mono text-gray-500">{part.color}</td>
                    <td className="px-4 py-3 text-gray-900">{part.finalDescription}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-900">
                      {part.area > 0 ? part.area : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {part.areaUnit !== 'N/A' ? part.areaUnit : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Instructions / Help */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <h3 className="font-semibold mb-2">Instrucciones de Cálculo:</h3>
          <ul className="list-disc list-inside space-y-1 opacity-80">
            <li><strong>1cap...</strong>: Se calcula en decímetros cuadrados (dm²). Fórmula: (Ancho × Alto × Cantidad) / 10000.</li>
            <li><strong>1vaq...</strong>: Se calcula en pies cuadrados (ft²). Fórmula: (Ancho × Alto × Cantidad) / 92903.</li>
            <li>El código se divide usando el carácter <strong>/</strong>.</li>
            <li>Las notas se agregan automáticamente al final de la descripción.</li>
          </ul>
        </div>

      </div>

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Exportar Datos</h3>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 mb-6">
              Seleccione la unidad de medida para el cálculo del área en el archivo exportado.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleExport('dm²')}
                className="flex flex-col items-center justify-center p-4 border-2 border-indigo-100 rounded-xl hover:border-indigo-600 hover:bg-indigo-50 transition-all group"
              >
                <span className="text-2xl font-bold text-indigo-600 group-hover:scale-110 transition-transform">dm²</span>
                <span className="text-sm text-gray-600 mt-1">Decímetros Cuadrados</span>
              </button>
              <button
                onClick={() => handleExport('ft²')}
                className="flex flex-col items-center justify-center p-4 border-2 border-emerald-100 rounded-xl hover:border-emerald-600 hover:bg-emerald-50 transition-all group"
              >
                <span className="text-2xl font-bold text-emerald-600 group-hover:scale-110 transition-transform">ft²</span>
                <span className="text-sm text-gray-600 mt-1">Pies Cuadrados</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
