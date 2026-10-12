/* ============ firebase-config.js — conexión con tu proyecto de Firebase ============
 * Pega aquí la configuración de tu app web de Firebase (Consola de Firebase >
 * Configuración del proyecto > Tus apps > SDK setup and configuration > Config).
 * Los pasos completos están en docs/FIREBASE.md.
 *
 * Estos datos NO son secretos: Firebase los diseña para ir en la web. Lo que
 * protege las partidas son las reglas de Firestore (firestore.rules).
 *
 * Si se pone a null, el juego funciona en modo local (sólo en el navegador).
 */
// Versión local: emuladores de Firebase en este servidor (server/start-emulators.sh), a los que
// se llega por la misma dirección que el juego (server/gateway.js). Abierto con doble clic
// (file://) no hay servidor: el juego guarda sólo en el navegador.
G.FIREBASE_CONFIG = /^https?:$/.test(location.protocol) ? {
  apiKey: 'demo-local',
  authDomain: location.host,
  projectId: 'demo-pokesurvivor',
  appId: 'demo-pokesurvivor',
  databaseURL: location.origin + '/?ns=demo-pokesurvivor-default-rtdb',
  emulator: true
} : null;

/* Ejemplo de cómo debe quedar:
G.FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'tu-proyecto.firebaseapp.com',
  projectId: 'tu-proyecto',
  storageBucket: 'tu-proyecto.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123'
};
*/
