import React, { useState, useEffect } from 'react';
import { AnalyticsSummary, DailyMetric } from '../../types'; // Asegúrate de tener los tipos actualizados
import { getAnalyticsSummary } from '../../services/firestoreService';
import LoadingSpinner from '../common/LoadingSpinner';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

const MetricsDashboard: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalyticsSummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);
  
  if (loading) return <LoadingSpinner text="Calculando KPIs de rendimiento..." />;
  if (!summary) return <p>No hay datos de métricas disponibles. Ejecuta la función de análisis.</p>;

  // Preparamos los datos para los gráficos
  const topEmployeesByHours = [...summary.employeeMetrics].sort((a, b) => b.totalHours - a.totalHours).slice(0, 10);
  const dailyChartData = (summary?.dailyMetrics || []).map(d => ({
    // CORRECCIÓN: Usamos d.date.toDate() para convertir el Timestamp
  name: d.date ? format(d.date.toDate(), 'd MMM', { locale: es }) : '',
  Horas: parseFloat(d.totalHours.toFixed(1)),
}));

  return (
    <div className="p-2 sm:p-4 space-y-8 animate-fadeIn">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-amore-charcoal">Dashboard de Métricas</h2>
        <p className="text-xs text-gray-400">Última actualización: {summary.lastUpdated.toDate().toLocaleString('es-MX')}</p>
      </div>
      
      {/* SECCIÓN 1: KPIs de Operación */}
      <h3 className="text-xl font-semibold text-gray-700 border-b pb-2">Rendimiento Operativo (Últimos 30 días)</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-xl shadow-lg text-center"><p className="text-lg text-gray-500">Total de Horas Trabajadas</p><p className="text-4xl font-extrabold text-amore-red">{summary.employeeMetrics.reduce((s, e) => s + e.totalHours, 0).toFixed(1)}</p></div>
        <div className="p-6 bg-white rounded-xl shadow-lg text-center"><p className="text-lg text-gray-500">Solicitudes de Cambio</p><p className="text-4xl font-extrabold text-amore-red">{summary.totalChangeRequests_30d}</p></div>
        <div className="p-6 bg-white rounded-xl shadow-lg text-center"><p className="text-lg text-gray-500">Justificantes Enviados</p><p className="text-4xl font-extrabold text-amore-red">{summary.totalJustifications_30d}</p></div>
      </div>
      
      {/* Gráfico de Tendencia Diaria */}
      <div className="p-6 bg-white rounded-xl shadow-lg">
        <h3 className="font-bold mb-4 text-amore-charcoal">Tendencia de Horas Trabajadas por Día</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dailyChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Horas" stroke="#B91C1C" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* SECCIÓN 2: Métricas de Personal */}
      <h3 className="text-xl font-semibold text-gray-700 border-b pb-2">Análisis de Personal (Últimos 30 días)</h3>
      <div className="p-6 bg-white rounded-xl shadow-lg">
        <h3 className="font-bold mb-4 text-amore-charcoal">Tabla de Rendimiento por Empleado</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empleado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horas Totales</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Turnos Totales</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Solicitudes de Cambio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Faltas (Just./Injust.)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {summary.employeeMetrics.sort((a,b) => b.totalHours - a.totalHours).map(emp => (
                <tr key={emp.userId}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{emp.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap font-bold">{emp.totalHours.toFixed(1)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{emp.totalShifts}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{emp.changeRequestCount}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-green-600 font-semibold">{emp.justifiedAbsenceCount}</span> / <span className="text-red-600 font-semibold">{emp.unjustifiedAbsenceCount}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default MetricsDashboard;