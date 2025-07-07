import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import Navbar from '../common/Navbar';
import Button from '../common/Button';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner';
import { User, UserRole, UniversalHistoryEntry } from '../../types';
import { getAllUsersByRole, updateUser, createUserDocument, getUniversalHistoryPage } from '../../services/firestoreService';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { firebaseConfig } from '../../services/firebase';
import Modal from '../common/Modal';
import { useNotification } from '../../contexts/NotificationContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME, HISTORY_ACTIONS, ROLE_SORT_ORDER } from '../../constants';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import GerenteDashboard from '../gerente/GerenteDashboard';
import ChecklistManager from './ChecklistManager';
import ShiftReportsView from './ShiftReportsView';
import AnnouncementManager from './AnnouncementManager';
import MetricsDashboard from './MetricsDashboard';

// --- User Management Component ---
interface UserFormState {
  id?: string;
  email: string;
  name: string;
  role: UserRole;
  password?: string;
}

interface UserManagementViewProps {
  onDeactivateUser: (user: User) => void;
}





const UserManagementView: React.FC = () => {
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);
  const [isConfirmDeactivateModalOpen, setIsConfirmDeactivateModalOpen] = useState(false);

/**
 * Esta función se llama al hacer clic en el botón "Desactivar" de un usuario.
 * Guarda el usuario seleccionado en el estado y abre el modal de confirmación.
 */
const handleOpenDeactivateModal = (user: User) => {
  setUserToDeactivate(user);
  setIsConfirmDeactivateModalOpen(true);
};

/**
 * Esta función se ejecuta al hacer clic en "Sí, Desactivar" en el modal.
 * Contiene la lógica para actualizar la base de datos.
 */
const executeDeactivation = async () => {
  if (!userToDeactivate) return;

  try {
    // Actualizamos el estado del usuario a 'inactive'
    await updateUser(userToDeactivate.id, { status: 'inactive' });
    addNotification(`Usuario ${userToDeactivate.name} ha sido desactivado.`, 'success');
    
    // Aquí puedes añadir lógica para refrescar tu lista de usuarios si es necesario
    fetchUsers(); 
    
  } catch (error: any) {
    addNotification(`Error al desactivar usuario: ${error.message}`, 'error');
  } finally {
    // Cerramos el modal y limpiamos el estado
    setIsConfirmDeactivateModalOpen(false);
    setUserToDeactivate(null);
  }
};
  const { addNotification } = useNotification();
  const { userData: currentAdmin } = useAuth();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserFormState | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText: string;
    confirmVariant: 'danger' | 'success' | 'warning';
  } | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const usersFromDB = await getAllUsersByRole();
      const sortedUsers = usersFromDB.sort((a, b) => {
        const indexA = ROLE_SORT_ORDER.indexOf(a.role);
        const indexB = ROLE_SORT_ORDER.indexOf(b.role);
        return indexA - indexB;
      });
      setAllUsers(sortedUsers);
    } catch (error: any) {
      addNotification(`Error al cargar usuarios: ${error.message}`, 'error');
    }
    setIsLoading(false);
  }, [addNotification]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  
  const handleReactivateUser = (userToReactivate: User) => {
    setConfirmState({
      isOpen: true,
      title: 'Confirmar Reactivación',
      message: `¿Estás seguro de que quieres reactivar a ${userToReactivate.name}?`,
      confirmText: 'Sí, Reactivar',
      confirmVariant: 'success',
      onConfirm: async () => {
        try {
          await updateUser(userToReactivate.id, { status: 'active' });
          addNotification(`Usuario ${userToReactivate.name} reactivado con éxito.`, 'success');
          fetchUsers();
        } catch (error: any) { addNotification(`Error al reactivar: ${error.message}`, 'error'); }
      }
    });
  };
  
  const handleSendResetEmail = () => {
    if (!editingUser || !editingUser.email) return;
    const emailToSend = editingUser.email; // Guardamos el email por si el modal se cierra
    setConfirmState({
        isOpen: true,
        title: 'Confirmar Envío de Correo',
        message: `Se enviará un correo para restablecer la contraseña a ${emailToSend}. ¿Continuar?`,
        confirmText: 'Sí, Enviar Correo',
        confirmVariant: 'warning',
        onConfirm: async () => {
            try {
                await sendPasswordResetEmail(auth, emailToSend);
                addNotification(`Correo de restablecimiento enviado a ${emailToSend}.`, 'success');
            } catch (error: any) {
                addNotification(`Error al enviar el correo: ${error.message}`, 'error');
            }
        }
    });
  };

  const handleOpenUserModal = (user?: User) => {
    if (user) { setEditingUser({ id: user.id, email: user.email, name: user.name, role: user.role });
    } else { setEditingUser({ email: '', name: '', role: UserRole.COCINERO, password: '' }); }
    setIsUserModalOpen(true);
  };
  const handleUserFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!editingUser) return;
    const { name, value } = e.target;
    setEditingUser(prev => ({ ...prev!, [name]: value }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !currentAdmin) return;
    setIsLoading(true);
    try {
      if (editingUser.id) {
        await updateUser(editingUser.id, { name: editingUser.name, role: editingUser.role, email: editingUser.email });
        addNotification(`Usuario ${editingUser.name} actualizado.`, 'success');
      } else {
        if (!editingUser.password || editingUser.password.length < 6) {
          addNotification("La contraseña debe tener al menos 6 caracteres.", "warning");
          setIsLoading(false); return;
        }
        const tempApp = initializeApp(firebaseConfig, `user-creation-${Date.now()}`);
        const tempAuth = getAuth(tempApp);
        const userCredential = await createUserWithEmailAndPassword(tempAuth, editingUser.email, editingUser.password);
        await updateProfile(userCredential.user, { displayName: editingUser.name });
        
        const newUserFirestoreData: Omit<User, 'id' | 'createdAt'> = {
          email: editingUser.email, 
          name: editingUser.name, 
          role: editingUser.role, 
          status: 'active',
          passwordResetRequired: true,
        };
        await createUserDocument(userCredential.user.uid, newUserFirestoreData);
        addNotification(`Usuario ${editingUser.name} creado con éxito.`, 'success');
      }
      fetchUsers();
      setIsUserModalOpen(false);
      setEditingUser(null);
    } catch (error: any) {
      console.error("Error guardando usuario:", error);
      if ((error as any).code === 'auth/email-already-in-use') {
        addNotification('Este correo electrónico ya está registrado. Por favor, utiliza otro.', 'error');
      } else {
        addNotification(`Error al guardar usuario: ${(error as any).message}`, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = allUsers
    .filter(user => showInactive ? user.status === 'inactive' : user.status !== 'inactive')
    .filter(user => 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

  if (isLoading && allUsers.length === 0) return <LoadingSpinner text="Cargando gestión de usuarios..."/>;

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
        <h3 className="text-xl font-semibold text-amore-charcoal">Gestión de Usuarios</h3>
        <div className="flex items-center bg-gray-200 p-1 rounded-full">
            <button onClick={() => setShowInactive(false)} className={`px-4 py-1 text-sm rounded-full transition-colors ${!showInactive ? 'bg-white shadow text-amore-red font-semibold' : 'text-gray-600'}`}>Activos</button>
            <button onClick={() => setShowInactive(true)} className={`px-4 py-1 text-sm rounded-full transition-colors ${showInactive ? 'bg-white shadow text-amore-red font-semibold' : 'text-gray-600'}`}>Inactivos</button>
        </div>
        <div className="relative">
          <input type="text" placeholder="Buscar en la lista actual..." className="p-2 pl-8 border rounded-md w-full sm:w-56" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        </div>
        <Button onClick={() => handleOpenUserModal()} variant="primary" icon={<i className="fas fa-plus mr-2"></i>}>Nuevo Usuario</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.map(user => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-amore-charcoal">{user.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-amore-gray">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-amore-gray capitalize">{user.role}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {showInactive ? (
                    <Button onClick={() => handleReactivateUser(user)} size="sm" variant="success" icon={<i className="fas fa-user-check"></i>}>Reactivar</Button>
                  ) : (
                    <>
                      <Button onClick={() => handleOpenUserModal(user)} size="sm" variant="light" icon={<i className="fas fa-edit"></i>} className="mr-2">Editar</Button>
                      <Button 
  onClick={() => handleOpenDeactivateModal(user)} 
  size="sm" 
  variant="danger" 
  icon={<i className="fas fa-user-slash"></i>}
  // --- INICIO DE LA LÓGICA AÑADIDA ---
  disabled={currentAdmin?.id === user.id}
  title={currentAdmin?.id === user.id ? "No puedes desactivar tu propia cuenta" : "Desactivar usuario"}
  // --- FIN DE LA LÓGICA AÑADIDA ---
>
  Desactivar
</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredUsers.length === 0 && !isLoading && ( <p className="text-center p-8 text-amore-gray">No se encontraron usuarios.</p> )}
      </div>
      {isUserModalOpen && editingUser && (
        <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={editingUser.id ? 'Editar Usuario' : 'Crear Nuevo Usuario'} size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="light" onClick={() => setIsUserModalOpen(false)}>Cancelar</Button>
              <Button type="submit" form="userForm" variant="primary" isLoading={isLoading}>{isLoading ? 'Guardando...' : 'Guardar Cambios'}</Button>
            </div>
          }
        >
          <form id="userForm" onSubmit={handleSaveUser} className="space-y-4">
            <div><label htmlFor="name" className="block text-sm font-medium">Nombre</label><input type="text" name="name" id="name" value={editingUser.name} onChange={handleUserFormChange} required className="mt-1 w-full p-2 border rounded-md"/></div>
            <div><label htmlFor="email" className="block text-sm font-medium">Email</label><input type="email" name="email" id="email" value={editingUser.email} onChange={handleUserFormChange} required className="mt-1 w-full p-2 border rounded-md" disabled={!!editingUser.id} /></div>
            {!editingUser.id && (<div><label htmlFor="password">Contraseña (min. 6 caracteres)</label><input type="password" name="password" id="password" value={editingUser.password || ''} onChange={handleUserFormChange} required className="mt-1 w-full p-2 border rounded-md" /></div>)}
            <div><label htmlFor="role" className="block text-sm font-medium">Rol</label><select name="role" id="role" value={editingUser.role} onChange={handleUserFormChange} required className="mt-1 w-full p-2 border rounded-md capitalize">{Object.values(UserRole).map(role => <option key={role} value={role} className="capitalize">{role}</option>)}</select></div>
          </form>

          {editingUser.id && (
            <div className="mt-6 border-t pt-4">
               <h4 className="text-md font-semibold text-amore-charcoal mb-2">Acciones de Cuenta</h4>
               <Button onClick={handleSendResetEmail} variant="warning" icon={<i className="fas fa-key mr-2"></i>}>
                   Enviar Correo de Restablecimiento de Contraseña
               </Button>
            </div>
          )}

        </Modal>
      )}

      {confirmState?.isOpen && (
        <Modal
            isOpen={confirmState.isOpen}
            onClose={() => setConfirmState(null)}
            title={confirmState.title}
            size="sm"
            footer={
                <div className="flex justify-end gap-2">
                    <Button variant="light" onClick={() => setConfirmState(null)}>Cancelar</Button>
                    <Button
                        variant={confirmState.confirmVariant}
                        onClick={() => {
                            confirmState.onConfirm();
                            setConfirmState(null);
                        }}
                    >
                        {confirmState.confirmText}
                    </Button>
                </div>
            }
        >
            <p className="text-amore-gray">{confirmState.message}</p>
        </Modal>
      )}

      {/* --- MODAL DE CONFIRMACIÓN PARA DESACTIVAR USUARIO --- */}
      <Modal
        // Aquí USAMOS la variable, lo que soluciona el error.
        isOpen={isConfirmDeactivateModalOpen}
        onClose={() => setIsConfirmDeactivateModalOpen(false)}
        title="⚠️ Confirmar Desactivación"
      >
        {userToDeactivate && (
          <div className="p-4 text-center">
            <p className="text-lg text-gray-700">
              ¿Estás seguro de que quieres desactivar a
              <strong className="block my-2 text-xl text-amore-red">{userToDeactivate.name}</strong>?
            </p>
            <p className="text-sm text-gray-500 mt-2">
              El usuario ya no podrá iniciar sesión y sus turnos futuros serán desasignados.
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <Button onClick={() => setIsConfirmDeactivateModalOpen(false)} variant="light">
                Cancelar
              </Button>
              <Button onClick={executeDeactivation} variant="danger">
                Sí, Desactivar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// --- Universal History Component ---
// Reemplaza tu componente UniversalHistoryView completo con esta nueva versión
const UniversalHistoryView: React.FC = () => {
  const [allHistory, setAllHistory] = useState<UniversalHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [totalHistoryItems, setTotalHistoryItems] = useState(0);

  const [filters, setFilters] = useState({
    actorName: '',
    action: '',
    startDate: '',
    endDate: '',
  });

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  const fetchHistory = useCallback(async (loadMore = false) => {
    setIsLoading(true);
    try {
      // Usaremos un truco: para la primera carga, pedimos más items para tener una buena base para filtrar
      const itemsToFetch = loadMore ? 10 : 50; 
      const lastDoc = loadMore ? lastVisible : undefined;
      
      const { entries, nextLastVisibleDoc, totalCount } = await getUniversalHistoryPage(itemsToFetch, lastDoc);
      
      setAllHistory(prev => loadMore ? [...prev, ...entries] : entries);
      setLastVisible(nextLastVisibleDoc);
      
      if (!loadMore) {
        setTotalHistoryItems(totalCount);
      }
      // La condición de 'hasMore' se simplifica por ahora
      setHasMore(entries.length === itemsToFetch);

    } catch (error: any) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoading(false);
    }
  }, [lastVisible]); // Quitamos allHistory.length para evitar bucles de carga

  useEffect(() => {
    fetchHistory();
  }, []);

  const filteredHistory = allHistory.filter(entry => {
    const nameMatch = entry.actorName.toLowerCase().includes(filters.actorName.toLowerCase());
    const actionMatch = entry.action.replace(/_/g, ' ').toLowerCase().includes(filters.action.toLowerCase());
    
    // --- LÓGICA DE FECHA CORREGIDA Y MÁS ROBUSTA ---
    const entryDate = entry.timestamp.toDate();
    let dateMatch = true; // Asumimos que coincide a menos que un filtro diga lo contrario

    if (filters.startDate) {
      // Creamos la fecha de inicio al principio del día para evitar problemas de zona horaria
      const startDate = new Date(filters.startDate + 'T00:00:00');
      if (entryDate < startDate) {
        dateMatch = false;
      }
    }
    if (filters.endDate) {
      // Creamos la fecha de fin al final del día
      const endDate = new Date(filters.endDate + 'T23:59:59');
      if (entryDate > endDate) {
        dateMatch = false;
      }
    }
    // --- FIN DE LA LÓGICA CORREGIDA ---

    return nameMatch && actionMatch && dateMatch;
  });

  if (isLoading && allHistory.length === 0) return <LoadingSpinner text="Cargando historial..."/>;

  return (
    <div className="p-4">
      <h3 className="text-xl font-semibold mb-4 text-amore-charcoal">Historial Universal ({totalHistoryItems})</h3>
      
      <div className="mb-4 p-4 bg-gray-50 rounded-lg border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="actorName" className="block text-sm font-medium text-gray-700">Filtrar por Nombre</label>
            <input type="text" name="actorName" id="actorName" className="mt-1 w-full p-2 border rounded-md" placeholder="Nombre..." value={filters.actorName} onChange={handleFilterChange} />
          </div>
          <div>
            <label htmlFor="action" className="block text-sm font-medium text-gray-700">Filtrar por Acción</label>
            <input type="text" name="action" id="action" className="mt-1 w-full p-2 border rounded-md" placeholder="Ej: crear, publicar..." value={filters.action} onChange={handleFilterChange}/>
          </div>
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Desde</label>
            <input type="date" name="startDate" id="startDate" className="mt-1 w-full p-2 border rounded-md" value={filters.startDate} onChange={handleFilterChange} />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">Hasta</label>
            <input type="date" name="endDate" id="endDate" className="mt-1 w-full p-2 border rounded-md" value={filters.endDate} onChange={handleFilterChange} />
          </div>
      </div>

      {filteredHistory.length === 0 && !isLoading ? (
        <p className="text-center p-8 text-amore-gray">No se encontraron entradas para los filtros aplicados.</p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {filteredHistory.map(entry => (
            <div key={entry.id} className="p-3 bg-gray-50 rounded-md border border-gray-200 text-sm">
              <p className="font-semibold text-amore-charcoal capitalize"><strong>Acción:</strong> {entry.action.replace(/_/g, ' ')}</p>
              <p><strong>Actor:</strong> <span className="font-medium text-amore-red">{entry.actorName}</span></p>
              <p><strong>Fecha:</strong> {entry.timestamp ? format(entry.timestamp.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es }) : 'N/A'}</p>
              {entry.details && <details className="text-xs mt-1"><summary className="cursor-pointer">Detalles</summary><pre className="mt-1 bg-gray-200 p-2 rounded text-xs overflow-x-auto">{JSON.stringify(entry.details, null, 2)}</pre></details>}
            </div>
          ))}
        </div>
      )}

      {hasMore && !isLoading && (
        <div className="mt-4 text-center">
          <Button onClick={() => fetchHistory(true)} isLoading={isLoadingMore} variant="secondary">Cargar Más Registros</Button>
        </div>
      )}
    </div>
  );
};



// --- Main Dueno Dashboard Component ---
type DuenoView = 'userManagement' | 'universalHistory' | 'managerFunctions' | 'checklistManagement' | 'shiftReports' | 'announcements' | 'metrics';
const DUENO_VIEWS_CONFIG: {id: DuenoView, label: string, icon: string}[] = [
    { id: 'metrics', label: 'Métricas', icon: 'fas fa-chart-line' },
    { id: 'managerFunctions', label: 'Funciones de Gerente', icon: 'fas fa-briefcase'},
    { id: 'userManagement', label: 'Gestión de Usuarios', icon: 'fas fa-users-cog' },
    { id: 'announcements', label: 'Anuncios Globales', icon: 'fas fa-bullhorn' },
    { id: 'checklistManagement', label: 'Gestión de Checklists', icon: 'fas fa-tasks' },
    { id: 'shiftReports', label: 'Reportes de Turno', icon: 'fas fa-clipboard-check' },
    { id: 'universalHistory', label: 'Historial Universal', icon: 'fas fa-history' },
];

const DuenoDashboard: React.FC = () => {
  const { userData } = useAuth();
  const [activeView, setActiveView] = useState<DuenoView>('userManagement');

  if (!userData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner text="Cargando datos de dueño..." />
      </div>
    );
  }
    



  const renderView = () => {
    switch (activeView) {
      case 'userManagement': return <UserManagementView />;
      case 'universalHistory': return <UniversalHistoryView />;
      case 'managerFunctions': return <GerenteDashboard />;
      case 'checklistManagement': return <ChecklistManager />;
      case 'publishedSchedules':
  return <PublishedSchedules onNavigateToBuilder={handleNavigateToBuilder} />;
      case 'shiftReports': return <ShiftReportsView />;
      case 'announcements':
        return <AnnouncementManager />;
      case 'metrics':
        return <MetricsDashboard />;
      default: 
        const _exhaustiveCheck: never = activeView;
        return <p>Vista no implementada: {_exhaustiveCheck}</p>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Navbar title="Panel de Administración (Dueño)" />
      <div className="container mx-auto p-4 md:p-6 flex-grow">
        <aside className="mb-6">
          <div className="bg-white p-3 md:p-4 rounded-xl shadow-lg flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
            {DUENO_VIEWS_CONFIG.map(view => (
              <Button 
                key={view.id}
                variant={activeView === view.id ? 'primary' : 'light'}
                onClick={() => setActiveView(view.id)}
                icon={<i className={`${view.icon} mr-2`}></i>}
                className="flex-grow sm:flex-grow-0"
              >
                {view.label}
              </Button>
            ))}
          </div>
        </aside>
        <main className="bg-white p-4 sm:p-6 rounded-xl shadow-lg min-h-[400px]">
            {renderView()}
        </main>
      </div>


      



    </div>
  );
};

export default DuenoDashboard;