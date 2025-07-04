// src/components/test/FirestoreTest.tsx

import React from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase'; // Asegúrate que esta ruta a tu config de DB sea correcta

const FirestoreTest: React.FC = () => {

    const runTest = async () => {
        const collectionName = "shiftChecklistTemplates";
        const docId = "vespertino"; // Probaremos con un valor fijo que sabemos que debe existir

        console.log("--- PRUEBA DE FUEGO INICIADA ---");
        console.log(`Intentando leer de la colección: "${collectionName}"`);
        console.log(`Buscando el documento con ID: "${docId}"`);

        try {
            const docRef = doc(db, collectionName, docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                console.log("%c--> RESULTADO: ¡ÉXITO! El documento fue encontrado.", "color: green; font-weight: bold; font-size: 16px;");
                console.log("Contenido del documento:", docSnap.data());
            } else {
                console.error("%c--> RESULTADO: ¡FALLO! Documento NO ENCONTRADO.", "color: red; font-weight: bold; font-size: 16px;");
                console.error("Causas posibles: 1) Hay un error de tipeo en el nombre de la colección o en el ID del documento. 2) Las Reglas de Seguridad están bloqueando la lectura.");
            }
        } catch (error) {
            console.error("%c--> RESULTADO: ¡ERROR CATASTRÓFICO!", "color: red; font-weight: bold; font-size: 16px;", error);
        }
        console.log("--- PRUEBA DE FUEGO FINALIZADA ---");
    };

    return (
        <div style={{ padding: '40px', margin: '20px', border: '3px dashed red', backgroundColor: '#fff8e1' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Componente de Diagnóstico de Firestore</h1>
            <p style={{ margin: '10px 0' }}>Este botón prueba la lectura del documento 'vespertino' de la colección 'shiftChecklistTemplates'.</p>
            <button onClick={runTest} style={{ padding: '12px 20px', fontSize: '16px', backgroundColor: '#c0392b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                EJECUTAR PRUEBA DE LECTURA
            </button>
        </div>
    );
};

export default FirestoreTest;