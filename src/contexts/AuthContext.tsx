import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
    let userDocumentListener: Unsubscribe = () => {}; // Variable para guardar la función de limpieza del oyente

    // El oyente principal de Auth no cambia
    const authStateListener = onAuthStateChanged(auth, async (firebaseUser) => {
      
      // Si hay un cambio de usuario, siempre "apagamos" el oyente anterior para evitar fugas de memoria
      userDocumentListener();

      if (firebaseUser) {
        const userDocRef = doc(db, FirebaseCollections.USERS, firebaseUser.uid);
        
        // --- NUEVO OYENTE EN TIEMPO REAL ---
        // Nos suscribimos a los cambios del documento del usuario
        userDocumentListener = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const userDataFromDb = { id: docSnap.id, ...docSnap.data() } as AppUser;

            // ¡LA VERIFICACIÓN INSTANTÁNEA!
            // Si en algún momento el estado del usuario cambia a 'inactive', lo sacamos.
            if (userDataFromDb.status === 'inactive') {
              console.warn("La cuenta ha sido desactivada por un administrador. Forzando cierre de sesión.");
              auth.signOut(); // Forzamos el logout directamente
              return; 
            }

            // Si todo está en orden, actualizamos los datos y el usuario
            setUser(firebaseUser);
            setUserData(userDataFromDb);
          } else {
            console.error("No se encontró el documento de usuario. Forzando cierre de sesión.");
            auth.signOut();
          }
          setLoading(false);
        });

      } else {
        // No hay usuario, limpiamos todo
        setUser(null);
        setUserData(null);
        setLoading(false);
      }
    });

    // La función de limpieza principal que se ejecuta al final
    return () => {
      authStateListener(); // Apaga el oyente de auth
      userDocumentListener(); // Apaga el oyente del documento
    };
  }, []); // El array vacío asegura que esto se configure una sola vez al inicio de la app

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