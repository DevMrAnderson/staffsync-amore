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

export const uploadJustificationFile = async (userId: string, file: File): Promise<string> => {
  const timestamp = Date.now();
  // Sanitize file name (optional, but good practice)
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${timestamp}_${sanitizedFileName}`;
  const path = `justifications/${userId}/${fileName}`;
  return uploadFile(file, path);
};
