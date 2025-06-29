import React from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { Shift, ShiftTemplate } from '../../types';

interface MonthViewProps {
  currentDate: Date;
  shifts: Shift[];
  templates: ShiftTemplate[];
  onShiftClick: (day: Date, templateId: string) => void;
}

const MonthView: React.FC<MonthViewProps> = ({ currentDate, shifts, templates, onShiftClick }) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="bg-white p-4 rounded-xl shadow-lg animate-fadeIn">
      <div className="grid grid-cols-7 gap-2 text-center text-sm font-semibold text-amore-gray mb-2">
        {weekDays.map(day => ( <div key={day}>{day}</div> ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isCurrentDay = isToday(day);
          
          const shiftsForThisDay = shifts.filter(shift => isSameDay(shift.start.toDate(), day));
          
          return (
            <div 
              key={day.toISOString()}
              className={`h-28 md:h-32 p-2 border rounded-md flex flex-col transition-colors
                ${isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'}
                ${isCurrentDay ? 'border-2 border-amore-red' : 'border-gray-200'}
              `}
            >
              <span className={`font-medium ${isCurrentDay ? 'text-white bg-[#B91C1C] rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>
                {format(day, 'd')}
              </span>
              <div className="flex-grow mt-1 space-y-1 overflow-hidden">
                {templates.map(template => {
                  const shiftExists = shiftsForThisDay.find(s => s.shiftTypeId === template.id);
                  if (!shiftExists) return null;

                  return (
                    <button
                      key={template.id} 
                      onClick={() => onShiftClick(day, template.id)}
                      // --- CAMBIO CLAVE: Usamos los códigos de color directamente ---
                      className={`w-full p-1 rounded-full text-xs text-white truncate transition-transform hover:scale-105
                        ${template.id === 'matutino' ? 'bg-[#B91C1C]' : 'bg-[#1F2937]'}
                      `}
                      title={`Ver/Editar ${template.name}`}
                    >
                     {template.name === 'Turno Matutino' ? 'Matutino' : 'Vespertino'}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;