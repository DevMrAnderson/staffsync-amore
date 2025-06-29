import { ref, uploadBytes, getDownloadURL, FirebaseStorageError } from 'firebase/storage';
import { storage } from './firebase'; // Ensure storage is correctly initialized
import { MAX_FILE_UPLOAD_SIZE_BYTES, MAX_FILE_UPLOAD_SIZE_MB } from '../constants';

export const uploadFile = async (file: File, path: string): Promise<string> => {
  if (!storage) {
    throw new Error("Firebase Storage no esta inicializado.");
  }
  if (file.size > MAX_FILE_UPLOAD_SIZE_BYTES) {
    throw new Error(`El archivo es demasiado grande. El tamano maximo es ${MAX_FILE_UPLOAD_SIZE_MB}MB.`);
  }
  
  const storageRef = ref(storage, path);
  try {
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    const firebaseError = error as FirebaseStorageError;
    console.error("Error al subir archivo a Firebase Storage:", firebaseError);
    // You can customize error messages based on firebaseError.code
    throw new Error(`Error al subir archivo: ${firebaseError.message}`);
  }
};

// VERSIÓN NUEVA (CORREGIDA Y MEJORADA)
export const uploadJustificationFile = async (file: File, userId: string): Promise<{downloadURL: string, fileName: string}> => {
  // Añadimos una comprobación de seguridad primero.
  if (!file) {
    throw new Error("No se ha proporcionado ningún archivo para subir.");
  }

  const timestamp = Date.now();
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const finalFileName = `${timestamp}_${sanitizedFileName}`;
  const path = `justifications/${userId}/${finalFileName}`;

  // Llamamos a la función original para subir el archivo.
  const downloadURL = await uploadFile(file, path);

  // Devolvemos un objeto con ambos datos.
  return { downloadURL, fileName: finalFileName };
};
