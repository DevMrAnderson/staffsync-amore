import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// La configuración que pegaste desde la consola de Firebase.
// Asegúrate de que estos sean tus datos reales.
export const firebaseConfig = {
  apiKey: "AIzaSyCe0OwKxuiZvVev8997VfTHCiiC43jxbrc",
  authDomain: "staffsync-amore.firebaseapp.com",
  projectId: "staffsync-amore",
  storageBucket: "staffsync-amore.firebasestorage.app",
  messagingSenderId: "808475164577",
  appId: "1:808475164577:web:d8ff58364c0efcd46155e0"
};

// Inicializar la aplicación de Firebase
const app: FirebaseApp = initializeApp(firebaseConfig);

// Inicializar cada servicio que necesitamos y exportarlo inmediatamente
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

// Opcional: exportar la 'app' por si se necesita en otro lado
export default app;