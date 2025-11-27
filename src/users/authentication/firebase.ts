import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// Detectar si estamos en producción (Render.com) o desarrollo local
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const productionPath = '/etc/secrets/admin-firebase.json';
const developmentPath = path.join(__dirname, '../../admin-firebase.json');

// Determinar qué ruta usar
let serviceAccountPath: string;
if (isProduction && fs.existsSync(productionPath)) {
  serviceAccountPath = productionPath;
} else if (fs.existsSync(developmentPath)) {
  serviceAccountPath = developmentPath;
} else if (fs.existsSync(productionPath)) {
  // Fallback: intentar producción si existe
  serviceAccountPath = productionPath;
} else {
  throw new Error('Firebase admin key file not found. Please check admin-firebase.json location.');
}

const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export { admin };