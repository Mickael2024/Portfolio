// Service Worker pour le mode hors ligne
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(registration => {
            console.log('Service Worker enregistré:', registration);
        })
        .catch(error => {
            console.log('Erreur enregistrement Service Worker:', error);
        });
}

// Gestion du cache
const CACHE_NAME = 'gestion-compteurs-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './db.js',
    './auth.js',
    './sync.js',
    '//offline.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];