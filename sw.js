// Service Worker pour QR Badge Scanner
// Version du cache - à incrémenter lors des mises à jour
const CACHE_VERSION = 'qr-badge-v1.2.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Fichiers à mettre en cache (ressources critiques)
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// URLs de l'API à ne pas mettre en cache
const API_URLS = [
  'https://script.google.com/macros/s/',
  'https://ipapi.co/',
  'https://docs.google.com/spreadsheets/'
];

// Installation du Service Worker
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installation en cours...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('📦 Service Worker: Mise en cache des fichiers statiques');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('✅ Service Worker: Installation terminée');
        return self.skipWaiting(); // Force l'activation immédiate
      })
      .catch(error => {
        console.error('❌ Service Worker: Erreur installation:', error);
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activation en cours...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        // Supprimer les anciens caches
        const deletePromises = cacheNames
          .filter(name => name.startsWith('qr-badge-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map(name => {
            console.log('🗑️ Service Worker: Suppression ancien cache:', name);
            return caches.delete(name);
          });
        
        return Promise.all(deletePromises);
      })
      .then(() => {
        console.log('✅ Service Worker: Activation terminée');
        return self.clients.claim(); // Prendre contrôle immédiatement
      })
      .catch(error => {
        console.error('❌ Service Worker: Erreur activation:', error);
      })
  );
});

// Interception des requêtes réseau
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignorer les requêtes non-GET et les extensions de navigateur
  if (request.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }
  
  event.respondWith(handleFetch(request));
});

// Gestion intelligente des requêtes
async function handleFetch(request) {
  const url = new URL(request.url);
  
  try {
    // Stratégie pour les fichiers statiques : Cache First
    if (isStaticFile(request)) {
      return await cacheFirst(request);
    }
    
    // Stratégie pour l'API : Network First avec fallback
    if (isApiRequest(request)) {
      return await networkFirstWithFallback(request);
    }
    
    // Stratégie par défaut : Network First
    return await networkFirst(request);
    
  } catch (error) {
    console.error('❌ Service Worker: Erreur fetch:', error);
    
    // Page de fallback hors ligne
    if (request.destination === 'document') {
      return await createOfflinePage();
    }
    
    throw error;
  }
}

// Vérifier si c'est un fichier statique
function isStaticFile(request) {
  const url = new URL(request.url);
  return STATIC_FILES.some(file => url.pathname.endsWith(file)) ||
         url.pathname.endsWith('.css') ||
         url.pathname.endsWith('.js') ||
         url.pathname.endsWith('.png') ||
         url.pathname.endsWith('.jpg') ||
         url.pathname.endsWith('.svg');
}

// Vérifier si c'est une requête API
function isApiRequest(request) {
  const url = request.url;
  return API_URLS.some(apiUrl => url.includes(apiUrl));
}

// Stratégie Cache First (pour les fichiers statiques)
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    console.log('📦 Cache hit:', request.url);
    return cachedResponse;
  }
  
  console.log('🌐 Cache miss, fetch:', request.url);
  const networkResponse = await fetch(request);
  
  // Mettre en cache la réponse
  if (networkResponse.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, networkResponse.clone());
  }
  
  return networkResponse;
}

// Stratégie Network First (pour le contenu dynamique)
async function networkFirst(request) {
  try {
    console.log('🌐 Network first:', request.url);
    const networkResponse = await fetch(request);
    
    // Mettre en cache si réponse OK
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('📦 Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Stratégie Network First avec fallback pour API
async function networkFirstWithFallback(request) {
  try {
    console.log('🌐 API request:', request.url);
    const networkResponse = await fetch(request);
    return networkResponse;
    
  } catch (error) {
    console.log('❌ API request failed:', request.url);
    
    // Retourner une réponse d'erreur JSON pour l'API
    if (request.url.includes('script.google.com')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Mode hors ligne - API indisponible',
        offline: true,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 503
      });
    }
    
    throw error;
  }
}

// Créer une page hors ligne
async function createOfflinePage() {
  return new Response(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR Badge - Hors ligne</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
                color: white;
                text-align: center;
            }
            .container {
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 40px;
                max-width: 400px;
            }
            h1 { font-size: 24px; margin-bottom: 20px; }
            p { font-size: 16px; line-height: 1.5; margin-bottom: 30px; }
            button {
                background: #1e40af;
                color: white;
                border: none;
                padding: 15px 30px;
                border-radius: 12px;
                font-size: 16px;
                cursor: pointer;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📡 Mode Hors Ligne</h1>
            <p>Vous êtes actuellement hors ligne. L'application QR Badge Scanner fonctionne en mode dégradé.</p>
            <p>Les scans seront synchronisés automatiquement lors de la reconnexion.</p>
            <button onclick="window.location.reload()">🔄 Réessayer</button>
        </div>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
    status: 200
  });
}

// Gestion des messages du client
self.addEventListener('message', event => {
  console.log('📨 Service Worker: Message reçu:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  
  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: CACHE_VERSION,
      caches: [STATIC_CACHE, DYNAMIC_CACHE]
    });
    return;
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    clearAllCaches().then(() => {
      event.ports[0].postMessage({ success: true });
    });
    return;
  }
});

// Nettoyer tous les caches
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  const deletePromises = cacheNames
    .filter(name => name.startsWith('qr-badge-'))
    .map(name => caches.delete(name));
  
  await Promise.all(deletePromises);
  console.log('🗑️ Service Worker: Tous les caches supprimés');
}

// Gestion des notifications push (pour usage futur)
self.addEventListener('push', event => {
  console.log('📲 Push notification reçue:', event);
  
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.message,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: 'qr-badge-notification',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'Voir',
        icon: '/icon-view.png'
      },
      {
        action: 'dismiss',
        title: 'Ignorer',
        icon: '/icon-dismiss.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'QR Badge Scanner', options)
  );
});

// Gestion des clics sur notifications
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification cliquée:', event);
  
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Synchronisation en arrière-plan (pour les scans hors ligne)
self.addEventListener('sync', event => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'offline-scans-sync') {
    event.waitUntil(syncOfflineScans());
  }
});

// Synchroniser les scans hors ligne
async function syncOfflineScans() {
  try {
    // Cette fonction serait appelée depuis l'app principale
    // pour synchroniser les données stockées localement
    console.log('🔄 Synchronisation des scans hors ligne...');
    
    // Logique de synchronisation ici
    // (communication avec l'app principale via postMessage)
    
  } catch (error) {
    console.error('❌ Erreur synchronisation:', error);
    throw error; // Pour retry automatique
  }
}

console.log('🎫 QR Badge Service Worker chargé - Version:', CACHE_VERSION);