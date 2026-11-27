import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { AppState } from '../../../chatbot/playground/types';
import { RAW_MERMAID_DIAGRAM } from '../constants';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface MermaidModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: AppState;
}

export const MermaidModal: React.FC<MermaidModalProps> = ({ isOpen, onClose, currentState }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [svgContent, setSvgContent] = useState<string>('');

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const renderDiagram = async () => {
      try {
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, RAW_MERMAID_DIAGRAM);
        if (isMounted) {
          // Highlight current state in SVG if possible
          setSvgContent(svg);
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentState]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Sơ đồ State Machine 3 Live Chat
              </h3>
              <span className="px-2.5 py-0.5 text-xs font-mono font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Current: {currentState}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sơ đồ điều phối chu trình vòng lặp giữa Khách hàng, AI CSKH, Đội xe DCE và CSĐT
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
              title="Phóng to"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
              title="Mặc định 100%"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 ml-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Diagram container */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto p-6 flex items-center justify-center bg-slate-50/50 dark:bg-slate-950/40"
        >
          {svgContent ? (
            <div
              className="transition-transform duration-150 origin-center max-w-full"
              style={{ transform: `scale(${zoom})` }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Đang kết xuất sơ đồ Mermaid...
            </div>
          )}
        </div>

        {/* Footer explanation */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              1. Thu thập thông tin Form
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              2. Điều phối DCE (Cấp 1)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
              3. Dự phòng CSĐT (Cấp 2 khi DCE từ chối)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              4. Chốt Báo giá / Tuyến không hỗ trợ
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
