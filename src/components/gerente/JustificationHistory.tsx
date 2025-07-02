// Nuevo Archivo: src/components/gerente/JustificationHistory.tsx

import React, { useState, useEffect } from 'react';
import { getResolvedJustifications } from '../../services/firestoreService';
import { Justification } from '../../types';
import LoadingSpinner from '../common/LoadingSpinner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME } from '../../constants';

const JustificationHistory: React.FC = () => {
  const [history, setHistory] = useState<Justification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        const resolvedJustifications = await getResolvedJustifications();
        setHistory(resolvedJustifications);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, []);

  if (isLoading) {
    return <LoadingSpinner text="Cargando historial de justificantes..." />;
  }

  if (error) {
    return <p className="text-red-500 text-center">Error al cargar el historial: {error}</p>;
  }

  return (
    <div className="animate-fadeIn mt-6">
      <h3 className="text-xl font-semibold text-gray-700 mb-4">Historial de Justificantes</h3>
      {history.length === 0 ? (
        <p className="text-gray-500 italic text-center py-4">No hay justificantes en el historial.</p>
      ) : (
        <div className="space-y-4">
          {history.map((justification) => {
            const isApproved = justification.status === 'aprobado';
            return (
              <div key={justification.id} className={`border-l-4 p-4 rounded-r-lg bg-white shadow-sm ${isApproved ? 'border-green-500' : 'border-red-500'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-800">{justification.employeeName}</p>
                    <p className="text-sm text-gray-500">
                      Fecha Ausencia: {justification.dateOfAbsence?.toDate ? format(justification.dateOfAbsence.toDate(), 'P', { locale: es }) : 'N/A'}
                    </p>
                    <p className={`text-sm font-semibold ${isApproved ? 'text-green-600' : 'text-red-600'}`}>
                      Estado: {justification.status.charAt(0).toUpperCase() + justification.status.slice(1)}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">
                    Revisado: {justification.createdAt?.toDate ? format(justification.createdAt.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es }) : 'N/A'}
                  </p>
                </div>
                {justification.reviewNotes && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-sm text-gray-600"><span className="font-semibold">Notas del Gerente:</span> {justification.reviewNotes}</p>
                  </div>
                )}
                <div className="mt-3">
                  {/* --- ¡AQUÍ ESTÁ LA MAGIA! --- */}
                  <a 
                    href={justification.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <i className="fas fa-paperclip mr-2"></i>Ver Archivo Adjunto
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JustificationHistory;