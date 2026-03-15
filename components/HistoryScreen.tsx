
import React from 'react';
import { AlertState } from '../types';
import { IconRenderer } from '../constants';
import { ArrowLeft, Clock, Trash2, Download } from 'lucide-react';

interface HistoryScreenProps {
  history: AlertState[];
  onBack: () => void;
  onClear: () => void;
}

// Feature 7: Export alert history as CSV
const exportCSV = (history: AlertState[]) => {
  const headers = ['Time', 'Label', 'Word', 'Detected Text', 'Source'];
  const rows = history.map(h => [
    new Date(h.timestamp || 0).toLocaleString(),
    h.trigger?.label || '',
    h.trigger?.word || '',
    `"${(h.detectedText || '').replace(/"/g, '""')}"`,
    h.source || ''
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `silentear-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ history, onBack, onClear }) => {
  return (
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-y-auto pb-20">
      <header className="flex items-center p-4 sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 border-b border-slate-800">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="ml-4 text-xl font-bold flex-1">Alert History</h1>
        {history.length > 0 && (
          <div className="flex gap-1">
            <button onClick={() => exportCSV(history)} className="p-2 text-blue-400 hover:text-blue-300" title="Export CSV">
              <Download size={20} />
            </button>
            <button onClick={onClear} className="p-2 text-slate-500 hover:text-red-500">
              <Trash2 size={20} />
            </button>
          </div>
        )}
      </header>

      <div className="p-4 space-y-3">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Clock size={48} className="mb-4 opacity-20" />
            <p>No alerts recorded yet.</p>
          </div>
        ) : (
          history.map((h, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-4">
              <div className={`p-3 rounded-xl ${h.trigger?.color || 'bg-slate-700'}`}>
                <IconRenderer icon={h.trigger?.icon || 'zap'} size={24} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-slate-100">{h.trigger?.label}</h3>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(h.timestamp || 0).toLocaleTimeString()}
                    </span>
                    {h.source && <span className="text-[8px] text-slate-600 uppercase font-bold">{h.source}</span>}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1 italic">
                  Matched: "{h.detectedText}"
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
