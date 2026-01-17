// firebaseAdmin.js
// Service Firebase pour la synchronisation

(function() {
    'use strict';
    
    console.log('🔥 Initialisation Firebase Admin...');
    
    // Configuration Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyAzDRGNbYIajLpavNeLIewzdXMSgMFknzA",
        authDomain: "compteur-nlf.firebaseapp.com",
        projectId: "compteur-nlf",
        storageBucket: "compteur-nlf.firebasestorage.app",
        messagingSenderId: "62458837339",
        appId: "1:62458837339:web:556a3ac3c4f267b6d9c27e",
        measurementId: "G-4QTS7HWZ46"
    };
    
    // Variables Firebase
    let app, db;
    
    // Vérifier si Firebase est disponible
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase non chargé. Vérifiez les scripts dans HTML.');
        
        // Créer un service mock pour éviter les erreurs
        window.firebaseService = {
            saveClientToFirebase: async function() {
                return { success: false, error: 'Firebase non disponible' };
            },
            getClientsFromFirebase: async function() {
                return { success: false, clients: [], error: 'Firebase non disponible' };
            },
            deleteClientFromFirebase: async function() {
                return { success: false, error: 'Firebase non disponible' };
            },
            saveTokenToFirebase: async function() {
                return { success: false, error: 'Firebase non disponible' };
            },
            getTokensFromFirebase: async function() {
                return { success: false, tokens: [], error: 'Firebase non disponible' };
            },
            syncLocalData: async function() {
                return { success: false, error: 'Firebase non disponible' };
            },
            testConnection: async function() {
                return { success: false, error: 'Firebase non disponible' };
            },
            logAction: async function() {
                // Ne rien faire
            },
            currentUserId: function() { return 'admin'; },
            currentCompanyId: function() { return 'default'; }
        };
        console.log('⚠️ Mode mock activé - pas de Firebase');
        return;
    }
    
    try {
        // Initialiser Firebase
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
            console.log('✅ Nouvelle instance Firebase créée');
        } else {
            app = firebase.apps[0];
            console.log('✅ Instance Firebase existante réutilisée');
        }
        
        db = firebase.firestore();
        console.log('✅ Firestore initialisé');
        
    } catch (error) {
        console.error('❌ Erreur initialisation Firebase:', error);
        
        // Service mock en cas d'erreur
        window.firebaseService = {
            saveClientToFirebase: async function() {
                return { success: false, error: 'Firebase erreur d\'initialisation' };
            },
            getClientsFromFirebase: async function() {
                return { success: false, clients: [], error: 'Firebase erreur d\'initialisation' };
            },
            deleteClientFromFirebase: async function() {
                return { success: false, error: 'Firebase erreur d\'initialisation' };
            },
            saveTokenToFirebase: async function() {
                return { success: false, error: 'Firebase erreur d\'initialisation' };
            },
            getTokensFromFirebase: async function() {
                return { success: false, tokens: [], error: 'Firebase erreur d\'initialisation' };
            },
            syncLocalData: async function() {
                return { success: false, error: 'Firebase erreur d\'initialisation' };
            },
            testConnection: async function() {
                return { success: false, error: 'Firebase erreur d\'initialisation' };
            },
            logAction: async function() {},
            currentUserId: function() { return 'admin'; },
            currentCompanyId: function() { return 'default'; }
        };
        return;
    }
    
    // ==================== FONCTIONS UTILITAIRES ====================
    
    // Nettoyer les données pour Firebase (enlever undefined)
    function cleanDataForFirebase(data) {
        const cleanData = {};
        
        for (const key in data) {
            if (data[key] !== undefined && data[key] !== null) {
                cleanData[key] = data[key];
            }
        }
        
        return cleanData;
    }
    
    // Préparer un client pour Firebase
    function prepareClientForFirebase(clientData) {
        const cleanData = cleanDataForFirebase(clientData);
        
        return {
            nom: cleanData.nom || '',
            prenom: cleanData.prenom || '',
            adresse: cleanData.adresse || '',
            numeroCompteur: cleanData.numeroCompteur || '',
            typeContrat: cleanData.typeContrat || 'standard',
            email: cleanData.email || '',
            telephone: cleanData.telephone || '',
            solde: parseFloat(cleanData.solde) || 0,
            consommationTotale: parseFloat(cleanData.consommationTotale) || 0,
            statut: cleanData.statut || 'actif',
            createdAt: cleanData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dernierRecharge: cleanData.dernierRecharge || null,
            // Garder l'ID local pour référence
            localId: cleanData.id || '',
            syncedAt: new Date().toISOString(),
            companyId: 'default'
        };
    }
    
    // Préparer un token pour Firebase
    function prepareTokenForFirebase(tokenData) {
        const cleanData = cleanDataForFirebase(tokenData);
        
        return {
            token: cleanData.token || '',
            meter: cleanData.meter || '',
            amount: parseFloat(cleanData.amount) || 0,
            kwh: parseFloat(cleanData.kwh) || 0,
            date: cleanData.date || new Date().toISOString(),
            status: cleanData.status || 'unused',
            clientId: cleanData.clientId || '',
            generatedBy: cleanData.generatedBy || 'system',
            usedDate: cleanData.usedDate || null,
            sentVia: cleanData.sentVia || null,
            sentDate: cleanData.sentDate || null,
            tarifKwh: 500,
            devise: 'Ar',
            syncedAt: new Date().toISOString(),
            companyId: 'default'
        };
    }
    
    // ==================== SERVICE FIREBASE ====================
    
    const FirebaseAdminService = {
        
        // ==================== GESTION CLIENTS ====================
        
        async saveClientToFirebase(clientData) {
            try {
                console.log('💾 Sauvegarde client vers Firebase:', clientData.numeroCompteur);
                
                // Préparer les données
                const firebaseClient = prepareClientForFirebase(clientData);
                
                // Utiliser le numéro de compteur comme ID (ou créer un ID unique)
                const clientId = clientData.numeroCompteur || `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Sauvegarder dans Firestore
                await db.collection('clients').doc(clientId).set(firebaseClient, { merge: true });
                
                console.log('✅ Client sauvegardé Firebase:', clientId);
                
                return {
                    success: true,
                    clientId: clientId
                };
                
            } catch (error) {
                console.error('❌ Erreur sauvegarde client Firebase:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        },
        
        async getClientsFromFirebase() {
            try {
                console.log('📡 Récupération clients depuis Firebase...');
                
                const snapshot = await db.collection('clients').get();
                const clients = [];
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    clients.push({
                        id: doc.id, // ID Firestore
                        firebaseId: doc.id,
                        ...data,
                        isSynced: true // Marquer comme synchronisé
                    });
                });
                
                console.log(`📊 ${clients.length} clients récupérés depuis Firebase`);
                
                return {
                    success: true,
                    clients: clients
                };
                
            } catch (error) {
                console.error('❌ Erreur récupération clients Firebase:', error);
                return {
                    success: false,
                    error: error.message,
                    clients: []
                };
            }
        },
        
        async getClientByMeter(meterNumber) {
            try {
                const snapshot = await db.collection('clients')
                    .where('numeroCompteur', '==', meterNumber)
                    .limit(1)
                    .get();
                
                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    const data = doc.data();
                    return {
                        id: doc.id,
                        firebaseId: doc.id,
                        ...data,
                        isSynced: true
                    };
                }
                return null;
            } catch (error) {
                console.error('Erreur recherche client:', error);
                return null;
            }
        },
        
        async deleteClientFromFirebase(clientId) {
            try {
                await db.collection('clients').doc(clientId).delete();
                console.log('🗑️ Client supprimé Firebase:', clientId);
                return { success: true };
            } catch (error) {
                console.error('Erreur suppression client:', error);
                return { success: false, error: error.message };
            }
        },
        
        // ==================== GESTION TOKENS ====================
        
        async saveTokenToFirebase(tokenData) {
            try {
                const tokenId = tokenData.token || `token_${Date.now()}`;
                const firebaseToken = prepareTokenForFirebase(tokenData);
                
                await db.collection('tokens').doc(tokenId).set(firebaseToken, { merge: true });
                
                console.log('✅ Token sauvegardé Firebase:', tokenId);
                
                return {
                    success: true,
                    tokenId: tokenId
                };
            } catch (error) {
                console.error('Erreur sauvegarde token:', error);
                return { success: false, error: error.message };
            }
        },
        
        async getTokensFromFirebase() {
            try {
                const snapshot = await db.collection('tokens').get();
                const tokens = [];
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    tokens.push({
                        id: doc.id,
                        firebaseId: doc.id,
                        ...data,
                        isSynced: true
                    });
                });
                
                return {
                    success: true,
                    tokens: tokens
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message,
                    tokens: []
                };
            }
        },
        
        // ==================== SYNCHRONISATION ====================
        
        async syncLocalData() {
            try {
                if (!navigator.onLine) {
                    return { success: false, error: 'Hors ligne' };
                }
                
                console.log('🔄 Début synchronisation...');
                
                let syncedCount = 0;
                let errorCount = 0;
                
                // 1. Synchroniser les clients
                const clients = JSON.parse(localStorage.getItem('gestion_compteurs_clients') || '[]');
                const unsyncedClients = clients.filter(client => !client.isSynced);
                
                console.log(`📊 ${unsyncedClients.length} clients à synchroniser`);
                
                for (const client of unsyncedClients) {
                    try {
                        const result = await this.saveClientToFirebase(client);
                        
                        if (result.success) {
                            // Marquer comme synchronisé
                            const updatedClients = clients.map(c => 
                                c.id === client.id ? { 
                                    ...c, 
                                    isSynced: true,
                                    firebaseId: result.clientId,
                                    syncedAt: new Date().toISOString()
                                } : c
                            );
                            localStorage.setItem('gestion_compteurs_clients', JSON.stringify(updatedClients));
                            syncedCount++;
                            console.log(`✅ Client synchronisé: ${client.prenom} ${client.nom}`);
                        } else {
                            errorCount++;
                            console.warn(`❌ Échec client ${client.id}:`, result.error);
                        }
                    } catch (clientError) {
                        errorCount++;
                        console.error(`❌ Erreur sync client ${client.id}:`, clientError);
                    }
                }
                
                // 2. Synchroniser les tokens
                const tokens = JSON.parse(localStorage.getItem('gestion_compteurs_tokens') || '[]');
                const unsyncedTokens = tokens.filter(token => !token.isSynced);
                
                console.log(`🔑 ${unsyncedTokens.length} tokens à synchroniser`);
                
                for (const token of unsyncedTokens) {
                    try {
                        const result = await this.saveTokenToFirebase(token);
                        
                        if (result.success) {
                            const updatedTokens = tokens.map(t => 
                                t.id === token.id ? { 
                                    ...t, 
                                    isSynced: true,
                                    firebaseId: result.tokenId,
                                    syncedAt: new Date().toISOString()
                                } : t
                            );
                            localStorage.setItem('gestion_compteurs_tokens', JSON.stringify(updatedTokens));
                            syncedCount++;
                        } else {
                            errorCount++;
                        }
                    } catch (tokenError) {
                        errorCount++;
                        console.error('Erreur sync token:', tokenError);
                    }
                }
                
                console.log(`✅ Sync terminé: ${syncedCount} réussis, ${errorCount} échecs`);
                
                return {
                    success: true,
                    synced: syncedCount,
                    errors: errorCount
                };
                
            } catch (error) {
                console.error('❌ Erreur synchronisation générale:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        },
        
        // ==================== UTILITAIRES ====================
        
        async testConnection() {
            try {
                // Tester avec une requête simple
                await db.collection('clients').limit(1).get();
                return { 
                    success: true, 
                    message: '✅ Firebase connecté avec succès'
                };
            } catch (error) {
                // Même en cas d'erreur de permission, la connexion est bonne
                if (error.code === 'permission-denied') {
                    return { 
                        success: true, 
                        message: '✅ Firebase accessible (permissions à configurer)',
                        warning: error.message
                    };
                }
                console.error('❌ Test connexion échoué:', error);
                return { 
                    success: false, 
                    error: error.message
                };
            }
        },
        
        async logAction(action, details) {
            try {
                await db.collection('logs').add({
                    action: action,
                    details: details,
                    timestamp: new Date().toISOString(),
                    user: 'admin',
                    companyId: 'default'
                });
            } catch (error) {
                console.error('Erreur journalisation:', error);
            }
        },
        
        // Getters simples
        currentUserId() {
            return 'admin';
        },
        
        currentCompanyId() {
            return 'default';
        }
    };
    
    // Exposer le service globalement
    window.firebaseService = FirebaseAdminService;
    
    console.log('🎉 Firebase Admin Service prêt et opérationnel!');
    
    // Tester la connexion automatiquement
    setTimeout(async () => {
        const test = await FirebaseAdminService.testConnection();
        if (test.success) {
            console.log('📡 Test connexion:', test.message);
        } else {
            console.warn('⚠️ Test connexion échoué:', test.error);
        }
    }, 1000);
    
})();