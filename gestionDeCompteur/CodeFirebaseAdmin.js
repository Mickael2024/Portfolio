// firebase-service.js
// Services et fonctions métier Firebase

// Vérifier que la configuration Firebase est chargée
if (typeof window.firebaseConfig === 'undefined') {
    console.error('Erreur: firebase-config.js doit être chargé avant firebase-service.js');
    throw new Error('Firebase configuration non trouvée');
}

// Raccourcis pour les services Firebase
const { db, auth, analytics, FieldValue, Timestamp } = window.firebaseConfig;

// ==================== AUTHENTIFICATION ====================
async function loginUser(email, password) {
    try {
        console.log('Tentative de connexion Firebase:', email);
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        console.log('Utilisateur Firebase connecté:', user.uid);
        
        // Récupérer les infos utilisateur depuis Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // Mettre à jour les variables globales
            window.firebaseConfig.setCurrentUserId(user.uid);
            window.firebaseConfig.setCurrentCompanyId(userData.companyId);
            window.firebaseConfig.setUserRole(userData.role);
            
            // Sauvegarder en localStorage
            localStorage.setItem('firebase_user', JSON.stringify({
                uid: user.uid,
                email: user.email,
                role: userData.role,
                companyId: userData.companyId,
                displayName: userData.displayName || user.email.split('@')[0]
            }));
            
            // Journaliser la connexion
            await logAction('connexion', `Utilisateur ${email} connecté`);
            
            console.log('Connexion réussie, utilisateur:', userData);
            return { success: true, user: userData };
        } else {
            console.warn('Document utilisateur non trouvé dans Firestore');
            return { success: false, error: 'Profil utilisateur non configuré' };
        }
    } catch (error) {
        console.error('Erreur connexion Firebase:', error);
        return { success: false, error: error.message };
    }
}

async function logoutUser() {
    try {
        await auth.signOut();
        
        // Réinitialiser les variables globales
        window.firebaseConfig.setCurrentUserId(null);
        window.firebaseConfig.setCurrentCompanyId(null);
        window.firebaseConfig.setUserRole(null);
        
        localStorage.removeItem('firebase_user');
        console.log('Déconnexion réussie');
        return { success: true };
    } catch (error) {
        console.error('Erreur déconnexion Firebase:', error);
        return { success: false, error: error.message };
    }
}

function checkAuthState() {
    return new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const userDoc = await db.collection('users').doc(user.uid).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        
                        window.firebaseConfig.setCurrentUserId(user.uid);
                        window.firebaseConfig.setCurrentCompanyId(userData.companyId);
                        window.firebaseConfig.setUserRole(userData.role);
                        
                        localStorage.setItem('firebase_user', JSON.stringify({
                            uid: user.uid,
                            email: user.email,
                            role: userData.role,
                            companyId: userData.companyId,
                            displayName: userData.displayName || user.email.split('@')[0]
                        }));
                        
                        console.log('Utilisateur déjà authentifié:', user.email);
                        resolve({ isAuthenticated: true, user: userData });
                    } else {
                        console.warn('Document utilisateur non trouvé');
                        resolve({ isAuthenticated: false });
                    }
                } catch (error) {
                    console.error('Erreur vérification auth state:', error);
                    resolve({ isAuthenticated: false });
                }
            } else {
                console.log('Aucun utilisateur authentifié');
                resolve({ isAuthenticated: false });
            }
            unsubscribe();
        });
    });
}

// ==================== GESTION DES CLIENTS ====================
async function saveClientToFirebase(clientData) {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        const userId = window.firebaseConfig.currentUserId();
        
        if (!companyId) {
            throw new Error('Company ID non défini - Veuillez initialiser la compagnie');
        }
        
        if (!userId) {
            throw new Error('User ID non défini - Veuillez vous connecter');
        }
        
        // Utiliser l'ID Firebase existant ou créer un nouveau
        const clientId = clientData.firebaseId || db.collection('clients').doc().id;
        const clientRef = db.collection('clients').doc(clientId);
        
        const client = {
            nom: clientData.nom || '',
            prenom: clientData.prenom || '',
            adresse: clientData.adresse || '',
            numeroCompteur: clientData.numeroCompteur || '',
            typeContrat: clientData.typeContrat || 'standard',
            email: clientData.email || '',
            telephone: clientData.telephone || '',
            solde: parseFloat(clientData.solde) || 0,
            consommationTotale: parseFloat(clientData.consommationTotale) || 0,
            statut: clientData.statut || 'actif',
            companyId: companyId,
            createdAt: clientData.createdAt ? Timestamp.fromDate(new Date(clientData.createdAt)) : FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            dernierRecharge: clientData.dernierRecharge ? Timestamp.fromDate(new Date(clientData.dernierRecharge)) : null,
            createdBy: userId
        };
        
        await clientRef.set(client, { merge: true });
        
        // Journaliser
        await logAction(
            clientData.firebaseId ? 'modification_client' : 'ajout_client',
            `${clientData.firebaseId ? 'Modifié' : 'Ajouté'}: ${client.prenom} ${client.nom} (${client.numeroCompteur})`
        );
        
        console.log('Client sauvegardé dans Firebase:', clientId);
        return { success: true, clientId, data: client };
        
    } catch (error) {
        console.error('Erreur sauvegarde client Firebase:', error);
        return { success: false, error: error.message };
    }
}

async function getClientsFromFirebase() {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        
        if (!companyId) {
            console.warn('Company ID non défini, retour tableau vide');
            return { success: true, clients: [] };
        }
        
        console.log('Récupération clients Firebase pour company:', companyId);
        
        const snapshot = await db.collection('clients')
            .where('companyId', '==', companyId)
            .orderBy('nom')
            .orderBy('prenom')
            .get();
        
        const clients = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            clients.push({
                id: doc.id,
                firebaseId: doc.id,
                nom: data.nom || '',
                prenom: data.prenom || '',
                adresse: data.adresse || '',
                numeroCompteur: data.numeroCompteur || '',
                typeContrat: data.typeContrat || 'standard',
                email: data.email || '',
                telephone: data.telephone || '',
                solde: parseFloat(data.solde) || 0,
                consommationTotale: parseFloat(data.consommationTotale) || 0,
                statut: data.statut || 'actif',
                companyId: data.companyId,
                createdAt: data.createdAt?.toDate() || new Date(),
                updatedAt: data.updatedAt?.toDate() || new Date(),
                dernierRecharge: data.dernierRecharge?.toDate() || null,
                isSynced: true,
                syncedAt: new Date().toISOString()
            });
        });
        
        console.log(`${clients.length} clients récupérés de Firebase`);
        return { success: true, clients };
        
    } catch (error) {
        console.error('Erreur récupération clients Firebase:', error);
        return { success: false, error: error.message, clients: [] };
    }
}

async function searchClientsInFirebase(searchTerm) {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        
        if (!companyId || !searchTerm) {
            return { success: true, clients: [] };
        }
        
        // Recherche simple - dans une vraie app, vous pourriez utiliser un index Algolia/Elastic
        const allClients = await getClientsFromFirebase();
        
        if (!allClients.success) {
            return allClients;
        }
        
        const term = searchTerm.toLowerCase();
        const filteredClients = allClients.clients.filter(client => {
            return (
                (client.nom && client.nom.toLowerCase().includes(term)) ||
                (client.prenom && client.prenom.toLowerCase().includes(term)) ||
                (client.numeroCompteur && client.numeroCompteur.toLowerCase().includes(term)) ||
                (client.adresse && client.adresse.toLowerCase().includes(term)) ||
                (client.email && client.email.toLowerCase().includes(term)) ||
                (client.telephone && client.telephone.includes(term))
            );
        });
        
        return { success: true, clients: filteredClients };
        
    } catch (error) {
        console.error('Erreur recherche clients Firebase:', error);
        return { success: false, error: error.message, clients: [] };
    }
}

async function deleteClientFromFirebase(clientId) {
    try {
        // Vérifier si le client existe et a des données liées
        const clientRef = db.collection('clients').doc(clientId);
        const clientDoc = await clientRef.get();
        
        if (!clientDoc.exists) {
            return { success: false, error: 'Client non trouvé' };
        }
        
        // Vérifier s'il y a des tokens actifs
        const tokensSnapshot = await db.collection('tokens')
            .where('clientId', '==', clientId)
            .where('status', '==', 'unused')
            .get();
        
        if (!tokensSnapshot.empty) {
            return { 
                success: false, 
                error: `Impossible de supprimer: ${tokensSnapshot.size} token(s) non utilisé(s)`
            };
        }
        
        // Supprimer le client
        await clientRef.delete();
        
        // Journaliser
        await logAction('suppression_client', `Client supprimé: ${clientId}`);
        
        console.log('Client supprimé de Firebase:', clientId);
        return { success: true };
        
    } catch (error) {
        console.error('Erreur suppression client Firebase:', error);
        return { success: false, error: error.message };
    }
}

// ==================== GESTION DES TOKENS ====================
async function saveTokenToFirebase(tokenData) {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        const userId = window.firebaseConfig.currentUserId();
        
        if (!companyId || !userId) {
            throw new Error('Non authentifié ou compagnie non initialisée');
        }
        
        const tokenId = tokenData.firebaseId || db.collection('tokens').doc().id;
        const tokenRef = db.collection('tokens').doc(tokenId);
        
        const token = {
            token: tokenData.token,
            meter: tokenData.meter,
            clientId: tokenData.clientId,
            amount: parseInt(tokenData.amount) || 0,
            kwh: parseFloat(tokenData.kwh) || 0,
            tarifKwh: 500,
            status: tokenData.status || 'unused',
            generatedBy: userId,
            generatedAt: FieldValue.serverTimestamp(),
            usedAt: tokenData.usedAt ? Timestamp.fromDate(new Date(tokenData.usedAt)) : null,
            sentVia: tokenData.sentVia || null,
            sentAt: tokenData.sentAt ? Timestamp.fromDate(new Date(tokenData.sentAt)) : null,
            companyId: companyId,
            notes: tokenData.notes || ''
        };
        
        await tokenRef.set(token, { merge: true });
        
        // Journaliser
        await logAction('generation_token', 
            `Token généré: ${token.amount.toLocaleString('fr-FR')} Ar (${token.kwh} kWh) pour ${token.meter}`
        );
        
        console.log('Token sauvegardé dans Firebase:', tokenId);
        return { success: true, tokenId, data: token };
        
    } catch (error) {
        console.error('Erreur sauvegarde token Firebase:', error);
        return { success: false, error: error.message };
    }
}

async function getTokensFromFirebase(options = {}) {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        
        if (!companyId) {
            return { success: true, tokens: [] };
        }
        
        let query = db.collection('tokens')
            .where('companyId', '==', companyId);
        
        // Appliquer les filtres
        if (options.meter) {
            query = query.where('meter', '==', options.meter);
        }
        
        if (options.status) {
            query = query.where('status', '==', options.status);
        }
        
        if (options.clientId) {
            query = query.where('clientId', '==', options.clientId);
        }
        
        // Date de début
        if (options.startDate) {
            const startDate = options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
            query = query.where('generatedAt', '>=', Timestamp.fromDate(startDate));
        }
        
        // Date de fin
        if (options.endDate) {
            const endDate = options.endDate instanceof Date ? options.endDate : new Date(options.endDate);
            endDate.setHours(23, 59, 59, 999);
            query = query.where('generatedAt', '<=', Timestamp.fromDate(endDate));
        }
        
        // Trier et limiter
        query = query.orderBy('generatedAt', 'desc');
        
        if (options.limit) {
            query = query.limit(options.limit);
        } else {
            query = query.limit(1000); // Limite par défaut
        }
        
        const snapshot = await query.get();
        const tokens = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            tokens.push({
                id: doc.id,
                firebaseId: doc.id,
                token: data.token,
                meter: data.meter,
                clientId: data.clientId,
                amount: data.amount,
                kwh: data.kwh,
                tarifKwh: data.tarifKwh || 500,
                status: data.status || 'unused',
                generatedBy: data.generatedBy,
                generatedAt: data.generatedAt?.toDate() || new Date(),
                usedAt: data.usedAt?.toDate() || null,
                sentVia: data.sentVia,
                sentAt: data.sentAt?.toDate() || null,
                companyId: data.companyId,
                isSynced: true,
                syncedAt: new Date().toISOString()
            });
        });
        
        console.log(`${tokens.length} tokens récupérés de Firebase`);
        return { success: true, tokens };
        
    } catch (error) {
        console.error('Erreur récupération tokens Firebase:', error);
        return { success: false, error: error.message, tokens: [] };
    }
}

async function updateTokenStatusInFirebase(tokenId, status) {
    try {
        const tokenRef = db.collection('tokens').doc(tokenId);
        
        const updateData = {
            status: status,
            updatedAt: FieldValue.serverTimestamp()
        };
        
        if (status === 'used') {
            updateData.usedAt = FieldValue.serverTimestamp();
        }
        
        await tokenRef.update(updateData);
        
        // Journaliser
        await logAction('utilisation_token', `Token ${tokenId} marqué comme ${status}`);
        
        console.log(`Token ${tokenId} mis à jour: ${status}`);
        return { success: true };
        
    } catch (error) {
        console.error('Erreur mise à jour token Firebase:', error);
        return { success: false, error: error.message };
    }
}

// ==================== TRANSACTIONS ====================
async function saveTransactionToFirebase(transactionData) {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        const userId = window.firebaseConfig.currentUserId();
        
        if (!companyId || !userId) {
            throw new Error('Non authentifié ou compagnie non initialisée');
        }
        
        const transactionId = transactionData.firebaseId || db.collection('transactions').doc().id;
        const transactionRef = db.collection('transactions').doc(transactionId);
        
        const transaction = {
            clientId: transactionData.clientId,
            meter: transactionData.meter,
            token: transactionData.token || null,
            type: transactionData.type || 'recharge',
            amount: parseInt(transactionData.amount) || 0,
            kwh: parseFloat(transactionData.kwh) || 0,
            description: transactionData.description || '',
            operator: userId,
            companyId: companyId,
            createdAt: FieldValue.serverTimestamp(),
            notes: transactionData.notes || ''
        };
        
        await transactionRef.set(transaction);
        
        // Mettre à jour le solde du client si c'est une recharge
        if (transactionData.type === 'recharge' && transactionData.clientId) {
            await updateClientBalanceInFirebase(transactionData.clientId, transactionData.amount);
        }
        
        console.log('Transaction sauvegardée dans Firebase:', transactionId);
        return { success: true, transactionId, data: transaction };
        
    } catch (error) {
        console.error('Erreur sauvegarde transaction Firebase:', error);
        return { success: false, error: error.message };
    }
}

async function updateClientBalanceInFirebase(clientId, amount) {
    try {
        const clientRef = db.collection('clients').doc(clientId);
        const clientDoc = await clientRef.get();
        
        if (clientDoc.exists) {
            const currentSolde = parseFloat(clientDoc.data().solde) || 0;
            const newSolde = currentSolde + parseFloat(amount);
            
            await clientRef.update({
                solde: newSolde,
                updatedAt: FieldValue.serverTimestamp(),
                dernierRecharge: FieldValue.serverTimestamp()
            });
            
            console.log(`Solde client ${clientId} mis à jour: ${newSolde} Ar`);
        }
    } catch (error) {
        console.error('Erreur mise à jour solde client:', error);
        throw error;
    }
}

async function getClientTransactionsFromFirebase(clientId, options = {}) {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        
        if (!companyId) {
            return { success: true, transactions: [] };
        }
        
        let query = db.collection('transactions')
            .where('companyId', '==', companyId)
            .where('clientId', '==', clientId)
            .orderBy('createdAt', 'desc');
        
        if (options.limit) {
            query = query.limit(options.limit);
        }
        
        const snapshot = await query.get();
        const transactions = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            transactions.push({
                id: doc.id,
                firebaseId: doc.id,
                clientId: data.clientId,
                meter: data.meter,
                token: data.token,
                type: data.type,
                amount: data.amount,
                kwh: data.kwh,
                description: data.description,
                operator: data.operator,
                companyId: data.companyId,
                createdAt: data.createdAt?.toDate() || new Date(),
                notes: data.notes || ''
            });
        });
        
        return { success: true, transactions };
        
    } catch (error) {
        console.error('Erreur récupération transactions client:', error);
        return { success: false, error: error.message, transactions: [] };
    }
}

// ==================== LOGS ====================
async function logAction(action, details) {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        const userId = window.firebaseConfig.currentUserId();
        
        if (!companyId || !userId) {
            console.warn('Impossible de journaliser: Non authentifié');
            return { success: false, error: 'Non authentifié' };
        }
        
        const logRef = db.collection('logs').doc();
        
        const log = {
            userId: userId,
            action: action,
            details: details,
            companyId: companyId,
            timestamp: FieldValue.serverTimestamp(),
            userAgent: navigator.userAgent,
            online: navigator.onLine,
            ip: 'web_client'
        };
        
        await logRef.set(log);
        
        // Analytics
        try {
            analytics.logEvent(action, { 
                details: details.length > 100 ? details.substring(0, 100) + '...' : details 
            });
        } catch (analyticsError) {
            console.warn('Erreur analytics:', analyticsError);
        }
        
        console.log('Action journalisée:', action);
        return { success: true, logId: logRef.id };
        
    } catch (error) {
        console.error('Erreur journalisation Firebase:', error);
        return { success: false, error: error.message };
    }
}

async function getLogsFromFirebase(options = {}) {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        
        if (!companyId) {
            return { success: true, logs: [] };
        }
        
        let query = db.collection('logs')
            .where('companyId', '==', companyId)
            .orderBy('timestamp', 'desc');
        
        if (options.userId) {
            query = query.where('userId', '==', options.userId);
        }
        
        if (options.action) {
            query = query.where('action', '==', options.action);
        }
        
        if (options.limit) {
            query = query.limit(options.limit);
        } else {
            query = query.limit(100); // Limite par défaut
        }
        
        const snapshot = await query.get();
        const logs = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            logs.push({
                id: doc.id,
                firebaseId: doc.id,
                userId: data.userId,
                action: data.action,
                details: data.details,
                companyId: data.companyId,
                timestamp: data.timestamp?.toDate() || new Date(),
                userAgent: data.userAgent,
                online: data.online,
                ip: data.ip
            });
        });
        
        return { success: true, logs };
        
    } catch (error) {
        console.error('Erreur récupération logs Firebase:', error);
        return { success: false, error: error.message, logs: [] };
    }
}

// ==================== SYNCHRONISATION ====================
async function syncLocalData() {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        const userId = window.firebaseConfig.currentUserId();
        
        if (!companyId || !userId) {
            return { 
                success: false, 
                error: 'Non authentifié', 
                message: 'Veuillez vous connecter pour synchroniser' 
            };
        }
        
        console.log('Début synchronisation Firebase...');
        
        // 1. Télécharger les données depuis Firebase
        const downloadResult = await downloadFirebaseData();
        
        if (!downloadResult.success) {
            return { 
                success: false, 
                error: downloadResult.error,
                message: 'Erreur téléchargement données'
            };
        }
        
        // 2. Synchroniser les données locales vers Firebase
        const uploadResult = await uploadLocalDataToFirebase();
        
        const stats = {
            clientsDownloaded: downloadResult.clients?.length || 0,
            tokensDownloaded: downloadResult.tokens?.length || 0,
            clientsUploaded: uploadResult.clientsSynced || 0,
            tokensUploaded: uploadResult.tokensSynced || 0,
            errors: uploadResult.errors || 0
        };
        
        const message = `Synchronisation terminée: ` +
                       `${stats.clientsDownloaded} clients, ${stats.tokensDownloaded} tokens téléchargés | ` +
                       `${stats.clientsUploaded} clients, ${stats.tokensUploaded} tokens uploadés`;
        
        console.log(message);
        
        // Journaliser
        await logAction('synchronisation', message);
        
        return { 
            success: true, 
            message: message,
            stats: stats
        };
        
    } catch (error) {
        console.error('Erreur synchronisation Firebase:', error);
        return { success: false, error: error.message };
    }
}

async function uploadLocalDataToFirebase() {
    try {
        console.log('Upload des données locales vers Firebase...');
        
        // Récupérer la file d'attente de synchronisation
        const syncQueue = getSyncQueueFromLS();
        const pendingItems = syncQueue.filter(item => !item.synced);
        
        if (pendingItems.length === 0) {
            console.log('Aucune donnée à synchroniser');
            return { clientsSynced: 0, tokensSynced: 0, errors: 0 };
        }
        
        console.log(`${pendingItems.length} éléments à synchroniser`);
        
        let clientsSynced = 0;
        let tokensSynced = 0;
        let transactionsSynced = 0;
        let logsSynced = 0;
        let errors = 0;
        
        // Traiter chaque élément
        for (const item of pendingItems) {
            try {
                switch (item.type) {
                    case 'client':
                        const clientResult = await saveClientToFirebase(item.data);
                        if (clientResult.success) {
                            clientsSynced++;
                            await markAsSyncedInLS(item.id);
                        } else {
                            errors++;
                        }
                        break;
                        
                    case 'token':
                        const tokenResult = await saveTokenToFirebase(item.data);
                        if (tokenResult.success) {
                            tokensSynced++;
                            await markAsSyncedInLS(item.id);
                        } else {
                            errors++;
                        }
                        break;
                        
                    case 'transaction':
                        const transactionResult = await saveTransactionToFirebase(item.data);
                        if (transactionResult.success) {
                            transactionsSynced++;
                            await markAsSyncedInLS(item.id);
                        } else {
                            errors++;
                        }
                        break;
                        
                    case 'log':
                        const logResult = await logAction(item.data.action, item.data.details);
                        if (logResult.success) {
                            logsSynced++;
                            await markAsSyncedInLS(item.id);
                        } else {
                            errors++;
                        }
                        break;
                }
                
                // Petite pause pour éviter de surcharger
                await new Promise(resolve => setTimeout(resolve, 50));
                
            } catch (itemError) {
                console.error(`Erreur synchronisation ${item.type}:`, itemError);
                errors++;
                
                // Incrémenter le nombre d'essais
                const updatedQueue = syncQueue.map(qItem => {
                    if (qItem.id === item.id) {
                        return {
                            ...qItem,
                            attempts: (qItem.attempts || 0) + 1,
                            lastError: itemError.message,
                            lastAttempt: new Date().toISOString()
                        };
                    }
                    return qItem;
                });
                
                localStorage.setItem('gestion_compteurs_sync_queue', JSON.stringify(updatedQueue));
            }
        }
        
        console.log(`Upload terminé: ${clientsSynced} clients, ${tokensSynced} tokens, ${errors} erreurs`);
        
        return {
            clientsSynced,
            tokensSynced,
            transactionsSynced,
            logsSynced,
            errors
        };
        
    } catch (error) {
        console.error('Erreur upload données locales:', error);
        throw error;
    }
}

async function downloadFirebaseData() {
    try {
        console.log('Téléchargement des données depuis Firebase...');
        
        const clientsResult = await getClientsFromFirebase();
        const tokensResult = await getTokensFromFirebase({ limit: 500 });
        
        console.log(`Données téléchargées: ${clientsResult.clients?.length || 0} clients, ${tokensResult.tokens?.length || 0} tokens`);
        
        return { 
            success: true,
            clients: clientsResult.clients || [],
            tokens: tokensResult.tokens || [],
            stats: {
                clients: clientsResult.clients?.length || 0,
                tokens: tokensResult.tokens?.length || 0
            }
        };
        
    } catch (error) {
        console.error('Erreur téléchargement données Firebase:', error);
        return { success: false, error: error.message };
    }
}

// ==================== STATISTIQUES ====================
async function getDashboardStatsFromFirebase() {
    try {
        const companyId = window.firebaseConfig.currentCompanyId();
        
        if (!companyId) {
            console.warn('Company ID non défini pour les statistiques');
            return null;
        }
        
        // Clients totaux
        const clientsSnapshot = await db.collection('clients')
            .where('companyId', '==', companyId)
            .get();
        
        const totalClients = clientsSnapshot.size;
        
        // Tokens du jour
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const tokensTodaySnapshot = await db.collection('tokens')
            .where('companyId', '==', companyId)
            .where('generatedAt', '>=', Timestamp.fromDate(today))
            .where('generatedAt', '<', Timestamp.fromDate(tomorrow))
            .get();
        
        const todayTokens = [];
        tokensTodaySnapshot.forEach(doc => todayTokens.push(doc.data()));
        
        // Calculs
        const salesToday = todayTokens.reduce((sum, t) => sum + (t.amount || 0), 0);
        const kwhToday = todayTokens.reduce((sum, t) => sum + (t.kwh || 0), 0);
        
        // Tokens actifs
        const activeTokensSnapshot = await db.collection('tokens')
            .where('companyId', '==', companyId)
            .where('status', '==', 'unused')
            .get();
        
        const activeTokens = activeTokensSnapshot.size;
        
        // Clients avec solde bas (< 5000 Ar)
        let clientsLowBalance = 0;
        clientsSnapshot.forEach(doc => {
            const client = doc.data();
            if ((client.solde || 0) < 5000) {
                clientsLowBalance++;
            }
        });
        
        // File d'attente de synchronisation
        const syncQueue = getSyncQueueFromLS();
        const pendingSync = syncQueue.filter(item => !item.synced).length;
        
        return {
            salesToday,
            kwhToday: kwhToday.toFixed(3),
            activeTokens,
            usedTokens: todayTokens.length,
            totalClients,
            alertsCount: clientsLowBalance,
            pendingSync,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Erreur statistiques Firebase:', error);
        return null;
    }
}

// ==================== INITIALISATION COMPAGNIE ====================
async function initializeCompany() {
    try {
        // Créer la compagnie par défaut si elle n'existe pas
        const companyId = 'compteur_nlf_001';
        const companyRef = db.collection('companies').doc(companyId);
        const companyDoc = await companyRef.get();
        
        if (!companyDoc.exists) {
            await companyRef.set({
                name: 'Compteur NLF',
                tarifKwh: 500,
                devise: 'Ar',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                settings: {
                    tokenLength: 10,
                    minRecharge: 500,
                    sendNotifications: true,
                    offlineMode: true,
                    currencySymbol: 'Ar',
                    country: 'Madagascar'
                },
                contact: {
                    email: 'contact@compteur-nlf.com',
                    phone: '+261 XX XX XXX XX',
                    address: 'Antananarivo, Madagascar'
                }
            });
            console.log('Compagnie créée avec succès dans Firebase');
        } else {
            console.log('Compagnie déjà existante dans Firebase');
        }
        
        window.firebaseConfig.setCurrentCompanyId(companyId);
        
        // Créer l'utilisateur admin par défaut si nécessaire
        await createDefaultAdminUser();
        
        return companyId;
        
    } catch (error) {
        console.error('Erreur initialisation compagnie:', error);
        return null;
    }
}

async function createDefaultAdminUser() {
    try {
        const userId = window.firebaseConfig.currentUserId();
        if (!userId) return;
        
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            const currentUser = auth.currentUser;
            if (currentUser) {
                await userRef.set({
                    email: currentUser.email,
                    role: 'admin',
                    displayName: currentUser.email.split('@')[0],
                    companyId: 'compteur_nlf_001',
                    isActive: true,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    permissions: {
                        manageClients: true,
                        generateTokens: true,
                        viewReports: true,
                        manageUsers: true,
                        deleteData: true
                    }
                });
                console.log('Utilisateur admin créé dans Firestore');
            }
        }
    } catch (error) {
        console.error('Erreur création utilisateur admin:', error);
    }
}

// ==================== FONCTIONS UTILITAIRES LOCALSTORAGE ====================
// Ces fonctions devraient être dans db.js, mais on les inclut ici pour la compatibilité

function getSyncQueueFromLS() {
    try {
        const queue = localStorage.getItem('gestion_compteurs_sync_queue');
        return queue ? JSON.parse(queue) : [];
    } catch (error) {
        console.error('Erreur lecture sync queue:', error);
        return [];
    }
}

async function markAsSyncedInLS(syncId) {
    try {
        const queue = getSyncQueueFromLS();
        const itemIndex = queue.findIndex(item => item.id === syncId);
        
        if (itemIndex >= 0) {
            queue[itemIndex].synced = true;
            queue[itemIndex].syncedAt = new Date().toISOString();
            localStorage.setItem('gestion_compteurs_sync_queue', JSON.stringify(queue));
        }
        return true;
    } catch (error) {
        console.error('Erreur mise à jour sync:', error);
        return false;
    }
}

// ==================== EXPORT DES SERVICES ====================
window.firebaseService = {
    // Auth
    loginUser,
    logoutUser,
    checkAuthState,
    
    // Clients
    saveClientToFirebase,
    getClientsFromFirebase,
    searchClientsInFirebase,
    deleteClientFromFirebase,
    
    // Tokens
    saveTokenToFirebase,
    getTokensFromFirebase,
    updateTokenStatusInFirebase,
    
    // Transactions
    saveTransactionToFirebase,
    getClientTransactionsFromFirebase,
    updateClientBalanceInFirebase,
    
    // Logs
    logAction,
    getLogsFromFirebase,
    
    // Sync
    syncLocalData,
    downloadFirebaseData,
    uploadLocalDataToFirebase,
    
    // Stats
    getDashboardStatsFromFirebase,
    
    // Initialisation
    initializeCompany,
    
    // Utilitaires
    currentUserId: () => window.firebaseConfig.currentUserId(),
    currentCompanyId: () => window.firebaseConfig.currentCompanyId(),
    userRole: () => window.firebaseConfig.userRole(),
    isOnline: () => navigator.onLine,
    getFirebaseConfig: () => window.firebaseConfig
};

console.log('✅ Firebase Services initialisés avec succès');