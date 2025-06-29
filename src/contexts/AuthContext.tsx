import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { User as AppUser } from '../types';
import { FirebaseCollections } from '../constants';

interface AuthContextType {
  user: FirebaseUser | null;
  userData: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // --- NUEVA ESTRUCTURA ---

  // Efecto #1: Solo se encarga de escuchar el estado de autenticación (login/logout).
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false); // Dejamos de cargar una vez que sabemos si hay usuario o no.
    });

    // Se limpia la suscripción de auth cuando el componente se desmonta.
    return () => unsubscribeAuth();
  }, []); // Se ejecuta solo una vez.

  // Efecto #2: Reacciona cuando el 'user' cambia.
  useEffect(() => {
    // Si no hay usuario (logout), limpiamos los datos y no hacemos nada más.
    if (!user) {
      setUserData(null);
      return;
    }

    // Si SÍ hay un usuario, creamos la suscripción a sus datos en Firestore.
    const userDocRef = doc(db, FirebaseCollections.USERS, user.uid);
    const unsubscribeFirestore = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserData({ id: docSnap.id, ...docSnap.data() } as AppUser);
      } else {
        console.warn("No se encontro el documento de usuario en Firestore para UID:", user.uid);
        setUserData(null);
      }
    }, (error) => {
      console.error("Error al obtener datos de usuario de Firestore:", error);
      setUserData(null);
    });

    // La magia de React: esta función de limpieza se ejecuta AUTOMÁTICAMENTE
    // cuando el 'user' cambia (es decir, cuando se cierra la sesión).
    // Esto asegura que nos damos de baja del listener ANTES de que el usuario sea nulo.
    return () => unsubscribeFirestore();

  }, [user]); // La dependencia [user] es la clave.

  // --- FIN DE LA NUEVA ESTRUCTURA ---

  const logout = async () => {
    try {
      await auth.signOut();
      // No es necesario limpiar los estados aquí, el useEffect de arriba lo hará automáticamente.
    } catch (error) {
      console.error("Error durante el cierre de sesion:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};