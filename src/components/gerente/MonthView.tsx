import React from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { Shift } from '../../types';

interface MonthViewProps {
  currentDate: Date;
  shifts?: Shift[];
  onDayClick: (date: Date) => void;
}

const MonthView: React.FC<MonthViewProps> = ({ currentDate, shifts, onDayClick }) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = [];
  let day = startDate;

  while (day <= endDate) {
    days.push(day);
    day = addDays(day, 1);
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      {/* --- Cabecera con los días de la semana --- */}
      <div className="grid grid-cols-7 text-center font-bold text-gray-500">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(dayName => (
          <div key={dayName} className="py-2 text-sm">{dayName}</div>
        ))}
      </div>

      {/* --- Cuadrícula del Calendario --- */}
      <div className="grid grid-cols-7 border-t border-l">
        {days.map(d => {
          const isCurrentMonth = isSameMonth(d, currentDate);
          const isToday = isSameDay(d, new Date());

          // --- LÓGICA MEJORADA: Verificamos si existen turnos de cada tipo ---
          const hasMorningShift = (shifts || []).some(s => 
            s.start && isSameDay(s.start.toDate(), d) && s.shiftTypeId === 'matutino'
          );
          const hasEveningShift = (shifts || []).some(s => 
            s.start && isSameDay(s.start.toDate(), d) && s.shiftTypeId === 'vespertino'
          );
          // --------------------------------------------------------------------

          return (
            <div
              key={d.toISOString()}
              // Hacemos que toda la celda sea clicable para navegar, no solo los botones
              onClick={() => onDayClick(d)}
              className={`p-2 h-28 border-r border-b cursor-pointer transition-colors ${
                isCurrentMonth ? 'hover:bg-gray-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-200'
              } ${isToday ? 'bg-red-50' : ''}`}
            >
              <div className={`font-semibold ${isToday ? 'text-amore-red' : ''}`}>
                {format(d, 'd')}
              </div>
              
              {/* --- RENDERIZADO DE BOTONES CONDICIONALES --- */}
              <div className="mt-1 space-y-1">
                {hasMorningShift && (
                  <div className="p-1 text-xs text-center font-semibold bg-blue-100 text-blue-800 rounded truncate">
                    T. Matutino
                  </div>
                )}
                {hasEveningShift && (
                  <div className="p-1 text-xs text-center font-semibold bg-indigo-100 text-indigo-800 rounded truncate">
                    T. Vespertino
                  </div>
                )}
              </div>
              {/* ------------------------------------------- */}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;