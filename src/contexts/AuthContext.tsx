import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { User as AppUser } from '../types';
import { FirebaseCollections } from '../constants';
import { getAuth, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

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
  const [loading, setLoading] = useState(true); // Siempre inicia en true

  useEffect(() => {
    const auth = getAuth();
    
    // onAuthStateChanged es la forma correcta y en tiempo real de saber el estado del usuario.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Si hay un usuario, buscamos sus datos en Firestore INMEDIATAMENTE.
        const userDocRef = doc(db, FirebaseCollections.USERS, firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        setUser(firebaseUser); // Guardamos el usuario de Firebase Auth
        
        if (userDoc.exists()) {
          setUserData({ id: userDoc.id, ...userDoc.data() } as AppUser); // Guardamos los datos de Firestore
        } else {
          console.warn("No se encontró documento de usuario para UID:", firebaseUser.uid);
          setUserData(null);
        }
      } else {
        // Si no hay usuario, limpiamos ambos estados.
        setUser(null);
        setUserData(null);
      }
      
      // La clave: Solo dejamos de cargar DESPUÉS de que toda la lógica ha terminado.
      setLoading(false);
    });

    // Esta función se ejecuta cuando el componente se desmonta para evitar fugas de memoria.
    return () => unsubscribe();
  }, []); // El array vacío asegura que esto se ejecute solo una vez.

  const logout = async () => {
    try {
      await auth.signOut();
      // No es necesario limpiar estados aquí, onAuthStateChanged lo hará automáticamente.
    } catch (error) {
      console.error("Error durante el cierre de sesión:", error);
    }
  };

  const value = { user, userData, loading, logout };

  return (
    <AuthContext.Provider value={value}>
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