import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, addMonths, subMonths, isEqual, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { Timestamp } from 'firebase/firestore';
import MonthView from './MonthView';

// Hooks, tipos y servicios
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { Shift } from '../../types';
import { onShiftsForWeekSnapshot, onShiftsForMonthSnapshot, getAllUsersByRole } from '../../services/firestoreService';

// Componentes
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import MonthView from './MonthView';

// Tipos locales para este componente
type MainView = 'all' | 'mine';
type CalendarView = 'week' | 'month';

// --- FUNCIÓN DE AYUDA PARA REHIDRATAR TIMESTAMPS ---
const ensureTimestamp = (dateValue: any): Timestamp | null => {
  if (!dateValue) return null;
  // Si ya es un Timestamp de Firestore, lo devolvemos
  if (dateValue instanceof Timestamp) {
    return dateValue;
  }
  // Si es un objeto con seconds/nanoseconds (formato de datos serializado)
  if (typeof dateValue === 'object' && 'seconds' in dateValue && 'nanoseconds' in dateValue) {
    return new Timestamp(dateValue.seconds, dateValue.nanoseconds);
  }
  // Si no es un formato reconocido, devolvemos null para evitar el crash
  console.warn("Se encontró un formato de fecha no válido:", dateValue);
  return null;
};

//================================================================
// --- Vista de "Mi Horario" (VERSIÓN COMPLETA) ---
//================================================================

const MyScheduleView: React.FC<{
  shifts: Shift[];
  userId: string;
  currentDate: Date;
  onShiftClick: (shift: Shift) => void;
}> = ({ shifts, userId, currentDate, onShiftClick }) => {

  // Filtramos para obtener solo los turnos del gerente actual
  const myShifts = useMemo(() => {
    return (shifts || []).filter(s => s && s.userId === userId);
  }, [shifts, userId]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [currentDate]);

  // Mapa de colores para los diferentes estados del turno
  const statusColorMap: { [key: string]: string } = {
    confirmado: 'bg-blue-100 text-blue-800 border-blue-400',
    cambio_ofrecido_gerente: 'bg-yellow-100 text-yellow-800 border-yellow-400',
    cambio_aprobado: 'bg-green-100 text-green-800 border-green-400',
    falta_injustificada: 'bg-red-100 text-red-800 border-red-400',
    justificacion_pendiente: 'bg-yellow-100 text-yellow-800 border-yellow-400',
  };

  return (
    <div className="animate-fadeIn">
      <div className="grid grid-cols-7 text-center font-bold text-gray-500 border-t border-l border-r">
        {weekDays.map(day => (
          <div key={day.toISOString()} className="py-2 border-b">{format(day, 'eee d', { locale: es })}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-b border-l border-r">
        {weekDays.map(day => {
          const shiftsOnDay = myShifts.filter(s => s && s.start && isSameDay(s.start.toDate(), day));
          return (
            <div key={day.toISOString()} className="border-r border-gray-200 min-h-[100px] p-1 space-y-1">
              {shiftsOnDay.map(shift => (
                (!shift || !shift.start || !shift.end) ? null : (
                  <button
                    key={shift.id}
                    onClick={() => onShiftClick(shift)}
                    className={`w-full p-2 rounded-lg text-left transition-transform hover:scale-105 border-l-4 ${statusColorMap[shift.status] || 'bg-gray-100'}`}
                  >
                    <p className="font-bold text-sm">{shift.shiftTypeName}</p>
                    <p className="text-xs">
                      {`${format(shift.start.toDate(), 'p', { locale: es })} - ${format(shift.end.toDate(), 'p', { locale: es })}`}
                    </p>
                    {shift.status === 'cambio_ofrecido_gerente' && (
                       <p className="text-xs font-semibold italic mt-1 text-yellow-900">Ofrecido</p>
                    )}
                    {shift.status === 'falta_injustificada' && (
                       <p className="text-xs font-bold mt-1 text-red-900 flex items-center"><i className="fas fa-exclamation-triangle mr-1"></i>Falta Registrada</p>
                    )}
                  </button>
                )
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

//================================================================
// --- Vista de "Horario Completo" (VERSIÓN MEJORADA) ---
//================================================================
const FullScheduleView: React.FC<FullScheduleViewProps> = ({ shifts, employees, currentDate, onDayClick }) => {
  const [nameFilter, setNameFilter] = useState('');

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [currentDate]);

  // Filtro de turnos mejorado para ser más seguro
  const filteredShifts = useMemo(() => {
    // Limpiamos el texto de búsqueda y lo ponemos en minúsculas
    const lowercasedFilter = nameFilter.trim().toLowerCase();

    // Si no hay nada escrito en el filtro, mostramos todos los turnos.
    if (!lowercasedFilter) {
      return (shifts || []);
    }

    // Filtramos el array de turnos
    return (shifts || []).filter(shift =>
      // Comprobamos si el nombre del empleado en el turno (en minúsculas)
      // incluye el texto del filtro.
      shift?.userName?.toLowerCase().includes(lowercasedFilter)
    );
  }, [shifts, nameFilter]); // Ahora depende de los turnos y del texto del filtro

  // Mapa de colores (claves en minúsculas para coincidir siempre)
  const roleColorMap: { [key: string]: string } = {
    mesero: 'bg-blue-100 text-blue-800 border-blue-400',
    bartender: 'bg-indigo-100 text-indigo-800 border-indigo-400',
    cocinero: 'bg-orange-100 text-orange-800 border-orange-400',
    auxiliar_cocina: 'bg-amber-100 text-amber-800 border-amber-400',
    lavaloza: 'bg-gray-200 text-gray-800 border-gray-400',
    gerente: 'bg-red-100 text-red-800 border-red-400',
  };

  // Sub-componente para la Leyenda de Colores
  const RoleLegend = () => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-2 bg-gray-50 rounded-lg text-xs">
      <p className="font-semibold text-sm mr-2">Roles:</p>
      {Object.entries(roleColorMap).map(([role, className]) => (
        <div key={role} className="flex items-center">
          <span className={`w-3 h-3 rounded-full mr-1.5 ${className.split(' ')[0]}`}></span>
          <span className="capitalize text-gray-700">{role.replace('_', ' ')}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="animate-fadeIn">
      {/* --- Controles Superiores: Filtro y Leyenda --- */}
      <div className="flex flex-col md:flex-row gap-4 justify-between md:items-center mb-4">
        <div className="mb-4 max-w-xs">
  <label htmlFor="name-filter" className="block text-sm font-medium text-gray-700 mb-1">Filtrar por nombre:</label>
  <input
    type="text"
    id="name-filter"
    value={nameFilter}
    onChange={(e) => setNameFilter(e.target.value)}
    placeholder="Escribe un nombre..."
    className="w-full p-2 border-gray-300 rounded-md shadow-sm"
  />
</div>
      </div>

      {/* --- Cuadrícula del Horario Semanal --- */}
      <div className="grid grid-cols-7 border-t border-l border-gray-200">
        {/* Cabeceras de los días */}
        {weekDays.map(day => (
          <div key={`header-${day.toISOString()}`} className="p-2 text-center font-bold bg-gray-50 border-r border-b">
            {format(day, 'eee d', { locale: es })}
          </div>
        ))}
        
        {/* Celdas con los turnos */}
        {weekDays.map(day => {
          const shiftsForDay = filteredShifts.filter(s => s?.start && isSameDay(s.start.toDate(), day));
          return (
            <div key={day.toISOString()} className="border-r border-b border-gray-200 min-h-[120px] p-1 space-y-1">
              {shiftsForDay.map(shift => (
                // --- TARJETA DE TURNO REDISEÑADA ---
                <div key={shift.id} className={`p-2 rounded-lg border-l-4 ${roleColorMap[shift.role?.toLowerCase()] || 'bg-gray-200 border-gray-400'}`}>
                  <p className="font-bold text-sm truncate">{shift.userName}</p>
                  <p className="text-xs">{shift.shiftTypeName}</p>
                  <p className="text-xs capitalize font-medium opacity-70">{shift.role?.replace('_', ' ')}</p>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};




//================================================================
// --- Componente Principal: PublishedSchedules ---
//================================================================
interface PublishedSchedulesProps {
  currentDate: Date;
  onDateChange: (newDate: Date) => void;
  onNavigateToBuilder: (date: Date) => void;
  onShiftClick: (shift: Shift) => void; 
}

const PublishedSchedules: React.FC<PublishedSchedulesProps> = ({ 
  currentDate, 
  onDateChange, 
  onNavigateToBuilder, 
  onShiftClick 
}) => {
  const { user } = useAuth();
  const { addNotification } = useNotification();

  const [mainView, setMainView] = useState<MainView>('all');
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // En PublishedSchedules.tsx

  // En PublishedSchedules.tsx

useEffect(() => {
  if (!user) return;
  setLoading(true);

  const userIdForQuery = mainView === 'mine' ? user.uid : undefined;
  let unsubscribe = () => {}; // Variable para guardar la función de limpieza del oyente

  if (calendarView === 'week') {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

    unsubscribe = onShiftsForWeekSnapshot(weekStart, weekEnd, (fetchedShifts) => {
      setShifts(fetchedShifts);
      setLoading(false);
    }, userIdForQuery);

  } else { // 'month'
    unsubscribe = onShiftsForMonthSnapshot(currentDate, (fetchedShifts) => {
      setShifts(fetchedShifts);
      setLoading(false);
    }, userIdForQuery);
  }

  // La función de limpieza que devuelve el useEffect ahora es el 'unsubscribe'
  // que nos da onSnapshot. Esto "apaga el walkie-talkie" cuando ya no es necesario.
  return () => unsubscribe();

}, [currentDate, calendarView, mainView, user]); // Quitamos addNotification
  
  // --- Manejadores de Navegación ---
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = calendarView === 'week'
      ? addDays(currentDate, direction === 'prev' ? -7 : 7)
      : direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1);
    onDateChange(newDate);
  };
  
  const dateDisplay = useMemo(() => {
    if (calendarView === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      return `Semana del ${format(weekStart, 'd \'de\' MMMM', { locale: es })}`;
    }
    return format(currentDate, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase());
  }, [currentDate, calendarView]);

  // --- AÑADE ESTA FUNCIÓN AQUÍ ---
  const handleDaySelectFromMonth = useCallback((day: Date) => {
    onDateChange(day);
      setCalendarView('week');
  }, []); // useCallback para optimizar, el array vacío significa que no se recrea
  // -----------------------------


  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold text-amore-charcoal mb-4">Horarios Publicados</h2>

      {/* --- Pestañas Principales --- */}
      <div className="flex border-b mb-4">
        <button onClick={() => setMainView('all')} className={`py-2 px-4 font-semibold ${mainView === 'all' ? 'border-b-2 border-amore-red text-amore-red' : 'text-gray-500'}`}>
          Horario Completo
        </button>
        <button onClick={() => setMainView('mine')} className={`py-2 px-4 font-semibold ${mainView === 'mine' ? 'border-b-2 border-amore-red text-amore-red' : 'text-gray-500'}`}>
          Mi Horario
        </button>
      </div>

      {/* --- Controles de Calendario --- */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => navigateDate('prev')} icon={<i className="fas fa-chevron-left"></i>} />
          <h3 className="text-xl font-bold text-center text-amore-charcoal w-64">{dateDisplay}</h3>
          <Button onClick={() => navigateDate('next')} icon={<i className="fas fa-chevron-right"></i>} />
        </div>
        <div className="bg-gray-200 p-1 rounded-lg flex">
          <Button size="sm" onClick={() => setCalendarView('week')} className={`px-4 py-1 rounded-md ${calendarView === 'week' ? 'bg-white shadow' : ''}`}>Semana</Button>
          <Button size="sm" onClick={() => setCalendarView('month')} className={`px-4 py-1 rounded-md ${calendarView === 'month' ? 'bg-white shadow' : ''}`}>Mes</Button>
        </div>
      </div>

      {/* --- Área de Contenido --- */}
      <div className="mt-4">
        {loading ? (
          <LoadingSpinner text="Cargando horarios..." />
        ) : (
          <>
            {/* Si la vista es 'semana', mostramos una de las dos vistas semanales */}
            {calendarView === 'week' && (
              mainView === 'all' 
                ? <FullScheduleView shifts={shifts} employees={employees} currentDate={currentDate} onDayClick={onNavigateToBuilder} />
                : <MyScheduleView 
            shifts={shifts} 
            userId={user!.uid} 
            currentDate={currentDate}
            onShiftClick={onShiftClick} />
            )}

            {/* Si la vista es 'mes', mostramos el componente MonthView */}
            {calendarView === 'month' && (
              <MonthView 
                currentDate={currentDate} 
                shifts={shifts} // Le pasamos todos los turnos para que los muestre
                onDayClick={handleDaySelectFromMonth} // Le conectamos la nueva función
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PublishedSchedules;