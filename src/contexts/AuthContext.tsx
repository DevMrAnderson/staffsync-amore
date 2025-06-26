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

  useEffect(() => {
    let unsubscribeFirestore: Unsubscribe | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (unsubscribeFirestore) {
        unsubscribeFirestore(); // Clean up previous Firestore listener
        unsubscribeFirestore = undefined;
      }

      if (firebaseUser) {
        setLoading(true); // Ensure loading is true while fetching/subscribing
        const userDocRef = doc(db, FirebaseCollections.USERS, firebaseUser.uid);
        
        unsubscribeFirestore = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserData({ id: docSnap.id, ...docSnap.data() } as AppUser);
          } else {
            console.warn("No se encontro el documento de usuario en Firestore para UID:", firebaseUser.uid);
            setUserData(null); 
            // This case might indicate an issue, e.g., user exists in Auth but not Firestore
            // Could sign out the user or prompt for profile creation depending on app logic
          }
          setLoading(false);
        }, (error) => {
          console.error("Error al obtener datos de usuario de Firestore:", error);
          setUserData(null);
          setLoading(false);
        });

      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, []);

  const logout = async () => {
    try {
      await auth.signOut();
      setUser(null); // Explicitly clear user
      setUserData(null); // Explicitly clear userData
    } catch (error) {
      console.error("Error durante el cierre de sesion:", error);
      // Optionally notify user of logout error
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