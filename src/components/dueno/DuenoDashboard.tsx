import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import Navbar from '../common/Navbar';
import Button from '../common/Button';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner';
import { User, UserRole, UniversalHistoryEntry, Shift, ShiftStatus } from '../../types';
import { getAllUsersByRole, updateUser, createUserDocument, getUniversalHistoryPage, replaceShiftsForTemplate } from '../../services/firestoreService';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { firebaseConfig } from '../../services/firebase';
import Modal from '../common/Modal';
import { useNotification } from '../../contexts/NotificationContext';
import { format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { DATE_FORMAT_SPA_DATETIME, HISTORY_ACTIONS } from '../../constants';
import { QueryDocumentSnapshot, DocumentData, Timestamp, collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import GerenteDashboard from '../gerente/GerenteDashboard';
import ChecklistManager from './ChecklistManager';
import { db } from '../../services/firebase';


// --- User Management Component ---
interface UserFormState {
  id?: string;
  email: string;
  name: string;
  role: UserRole;
  password?: string;
}

const UserManagementView: React.FC = () => {
  const { addNotification } = useNotification();
  const { userData: currentAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserFormState | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const allUsers = await getAllUsersByRole();
      setUsers(allUsers);
    } catch (error: any) {
      addNotification(`Error al cargar usuarios: ${error.message}`, 'error');
    }
    setIsLoading(false);
  }, [addNotification]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenUserModal = (user?: User) => {
    if (user) {
      setEditingUser({ id: user.id, email: user.email, name: user.name, role: user.role });
    } else {
      setEditingUser({ email: '', name: '', role: UserRole.COCINERO, password: '' });
    }
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
          setIsLoading(false);
          return;
        }
        const tempApp = initializeApp(firebaseConfig, `user-creation-${Date.now()}`);
        const tempAuth = getAuth(tempApp);
        const userCredential = await createUserWithEmailAndPassword(tempAuth, editingUser.email, editingUser.password);
        await updateProfile(userCredential.user, { displayName: editingUser.name });
        const newUserFirestoreData: Omit<User, 'id' | 'createdAt'> = {
          email: editingUser.email,
          name: editingUser.name,
          role: editingUser.role,
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

  if (isLoading && users.length === 0) return <LoadingSpinner text="Cargando gestión de usuarios..."/>;

  return (
    <div className="p-4 bg-white rounded-lg shadow animate-fadeIn">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-amore-charcoal">Gestión de Usuarios</h3>
        <Button onClick={() => handleOpenUserModal()} variant="primary" icon={<i className="fas fa-plus mr-2"></i>}>Nuevo Usuario</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-amore-gray uppercase tracking-wider">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-amore-gray uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-amore-gray uppercase tracking-wider">Rol</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-amore-gray uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map(user => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-amore-charcoal">{user.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-amore-gray">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-amore-gray capitalize">{user.role}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <Button onClick={() => handleOpenUserModal(user)} size="sm" variant="light" icon={<i className="fas fa-edit"></i>} className="mr-2">Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
            <div>
              <label htmlFor="name" className="block text-sm font-medium">Nombre</label>
              <input type="text" name="name" id="name" value={editingUser.name} onChange={handleUserFormChange} required className="mt-1 w-full p-2 border rounded-md"/>
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium">Email</label>
              <input type="email" name="email" id="email" value={editingUser.email} onChange={handleUserFormChange} required className="mt-1 w-full p-2 border rounded-md" disabled={!!editingUser.id} />
            </div>
            {!editingUser.id && (
              <div>
                <label htmlFor="password">Contraseña (min. 6 caracteres)</label>
                <input type="password" name="password" id="password" value={editingUser.password || ''} onChange={handleUserFormChange} required className="mt-1 w-full p-2 border rounded-md" />
              </div>
            )}
            <div>
              <label htmlFor="role" className="block text-sm font-medium">Rol</label>
              <select name="role" id="role" value={editingUser.role} onChange={handleUserFormChange} required className="mt-1 w-full p-2 border rounded-md capitalize">
                {Object.values(UserRole).map(role => <option key={role} value={role} className="capitalize">{role}</option>)}
              </select>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

// --- Universal History Component ---
const UniversalHistoryView: React.FC = () => {
  const [history, setHistory] = useState<UniversalHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [totalHistoryItems, setTotalHistoryItems] = useState(0);

  const fetchHistory = useCallback(async (loadMore = false) => {
    setIsLoading(true);
    try {
      const { entries, nextLastVisibleDoc, totalCount } = await getUniversalHistoryPage(10, loadMore ? lastVisible : undefined);
      setHistory(prev => loadMore ? [...prev, ...entries] : entries);
      setLastVisible(nextLastVisibleDoc);
      setHasMore(entries.length === 10);
      if (!loadMore) setTotalHistoryItems(totalCount);
    } catch (error: any) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoading(false);
    }
  }, [lastVisible]);

  useEffect(() => {
    fetchHistory();
  }, []);

  if (isLoading && history.length === 0) return <LoadingSpinner text="Cargando historial..."/>;

  return (
    <div className="p-4 bg-white rounded-lg shadow animate-fadeIn">
      <h3 className="text-xl font-semibold mb-4 text-amore-charcoal">Historial Universal (Total: {totalHistoryItems})</h3>
      <div className="mb-4 text-sm text-gray-500 italic">Filtros (por fecha, usuario, accion) se implementarian aqui.</div>
      {history.length === 0 && !isLoading ? <p>No hay entradas en el historial.</p> : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {history.map(entry => (
            <div key={entry.id} className="p-3 bg-gray-50 rounded-md border border-gray-200 text-sm">
              <p><strong>Accion:</strong> {entry.action.replace(/_/g, ' ')}</p>
              <p><strong>Actor:</strong> {entry.actorName} ({entry.actorId.substring(0,8)}...)</p>
              <p><strong>Fecha:</strong> {entry.timestamp ? format(entry.timestamp.toDate(), DATE_FORMAT_SPA_DATETIME, { locale: es }) : 'N/A'}</p>
              {entry.details && <details className="text-xs mt-1"><summary>Detalles</summary><pre className="bg-gray-200 p-1 rounded text-xs overflow-x-auto">{JSON.stringify(entry.details, null, 2)}</pre></details>}
            </div>
          ))}
        </div>
      )}
      {hasMore && !isLoading && (
        <Button onClick={() => fetchHistory(true)} isLoading={isLoading} variant="secondary" className="mt-4">Cargar Mas</Button>
      )}
      {!hasMore && history.length > 0 && <p className="text-center text-gray-500 mt-4 text-sm">Fin del historial.</p>}
    </div>
  );
};

// --- Main Dueno Dashboard Component ---
type DuenoView = 'userManagement' | 'universalHistory' | 'managerFunctions' | 'checklistManagement';

const DUENO_VIEWS_CONFIG: {id: DuenoView, label: string, icon: string}[] = [
    { id: 'managerFunctions', label: 'Funciones de Gerente', icon: 'fas fa-briefcase'},
    { id: 'userManagement', label: 'Gestión de Usuarios', icon: 'fas fa-users-cog' },
    { id: 'checklistManagement', label: 'Gestión de Checklists', icon: 'fas fa-tasks' },
    { id: 'universalHistory', label: 'Historial Universal', icon: 'fas fa-history' },
];

const DuenoDashboard: React.FC = () => {
  const { userData } = useAuth();
  const [activeView, setActiveView] = useState<DuenoView>('managerFunctions');

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