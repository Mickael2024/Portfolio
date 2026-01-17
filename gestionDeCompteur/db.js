// db.js - Version LocalStorage

// Clés LocalStorage
const LS_KEYS = {
    CLIENTS: 'gestion_compteurs_clients',
    TOKENS: 'gestion_compteurs_tokens',
    TRANSACTIONS: 'gestion_compteurs_transactions',
    LOGS: 'gestion_compteurs_logs',
    SYNC_QUEUE: 'gestion_compteurs_sync_queue',
    USERS: 'gestion_compteurs_users',
    SETTINGS: 'gestion_compteurs_settings'
};
const TARIF_KWH = 500; // 500 Ar par kWh
const DEVISE = 'Ar'; // Ariary Malagasy
// Fonction de calcul
function calculateKwhFromAmount(amount) {
    // amount en Ariary, retourne kWh
    return parseFloat(amount) / TARIF_KWH;
}

function calculateAmountFromKwh(kwh) {
    // kwh en kWh, retourne montant en Ariary
    return parseFloat(kwh) * TARIF_KWH;
}

// Initialisation
function initDatabase() {
    console.log('Initialisation LocalStorage');
    
    // Créer les clés si elles n'existent pas
    Object.values(LS_KEYS).forEach(key => {
        if (!localStorage.getItem(key)) {
            localStorage.setItem(key, JSON.stringify([]));
        }
    });
    
    // Créer des données de test pour démonstration
    // initSampleData();
    
    return Promise.resolve(true);
}
function autoSave() {
    // Cette fonction peut être appelée périodiquement
    // ou à chaque modification importante
    console.log('Sauvegarde automatique effectuée');
}

// Fonctions Clients
async function saveClient(client) {
    try {
        const clients = getClientsFromLS();
        const clientId = client.id || Date.now().toString();
        
        // Normaliser les données du client
        const clientData = {
            id: clientId,
            nom: client.nom || '',
            prenom: client.prenom || '',
            adresse: client.adresse || '',
            numeroCompteur: client.numeroCompteur || '',
            typeContrat: client.typeContrat || 'standard',
            email: client.email || '',
            telephone: client.telephone || '',
            solde: parseFloat(client.solde) || 0,
            consommationTotale: parseFloat(client.consommationTotale) || 0,
            createdAt: client.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dernierRecharge: client.dernierRecharge || null,
            statut: client.statut || 'actif',
            // Champs pour la synchronisation
            companyId: window.firebaseService?.currentCompanyId ? window.firebaseService.currentCompanyId() : 'local',
            isSynced: false,
            syncedAt: null,
            firebaseId: client.firebaseId || null // Conserver l'ID Firebase si existe
        };
        
        // Vérifier si le client existe déjà
        const existingIndex = clients.findIndex(c => c.id === clientId);
        
        if (existingIndex >= 0) {
            // Mettre à jour le client existant
            const existingClient = clients[existingIndex];
            
            // Vérifier si le numéro de compteur change
            if (existingClient.numeroCompteur !== clientData.numeroCompteur) {
                const existingMeter = clients.find(c => 
                    c.id !== clientId && 
                    c.numeroCompteur === clientData.numeroCompteur
                );
                if (existingMeter) {
                    throw new Error('Numéro de compteur déjà utilisé par un autre client');
                }
            }
            
            // Conserver les champs de synchronisation existants
            clients[existingIndex] = {
                ...existingClient,
                ...clientData,
                firebaseId: existingClient.firebaseId || clientData.firebaseId, // Garder l'ID Firebase
                isSynced: existingClient.isSynced && clientData.numeroCompteur === existingClient.numeroCompteur, // Reste synced si pas de changement de compteur
                syncedAt: existingClient.syncedAt,
                updatedAt: new Date().toISOString()
            };
            
            console.log('Client mis à jour:', clientData);
            
        } else {
            // Nouveau client - vérifier si le numéro de compteur existe déjà
            const existingMeter = clients.find(c => c.numeroCompteur === clientData.numeroCompteur);
            if (existingMeter) {
                throw new Error('Numéro de compteur déjà utilisé');
            }
            
            clients.push(clientData);
            console.log('Nouveau client ajouté:', clientData);
        }
        
        // Sauvegarder en LocalStorage
        localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(clients));
        
        // === SYNCHRONISATION AVEC FIREBASE ===
        let firebaseResult = null;
        const currentClient = clients.find(c => c.id === clientId);
        
        if (window.firebaseService && navigator.onLine) {
            try {
                console.log('Tentative de sauvegarde sur Firebase...');
                
                // Préparer les données pour Firebase (sans les champs spéciaux)
                const firebaseData = {
                    nom: currentClient.nom,
                    prenom: currentClient.prenom,
                    adresse: currentClient.adresse,
                    numeroCompteur: currentClient.numeroCompteur,
                    typeContrat: currentClient.typeContrat,
                    email: currentClient.email,
                    telephone: currentClient.telephone,
                    solde: currentClient.solde,
                    consommationTotale: currentClient.consommationTotale,
                    createdAt: currentClient.createdAt,
                    updatedAt: currentClient.updatedAt,
                    dernierRecharge: currentClient.dernierRecharge,
                    statut: currentClient.statut,
                    localId: currentClient.id, // Stocker l'ID local pour référence
                    companyId: currentClient.companyId
                };
                
                // Si le client a déjà un firebaseId, l'utiliser pour la mise à jour
                if (currentClient.firebaseId) {
                    firebaseResult = await window.firebaseService.saveClientToFirebase({
                        ...firebaseData,
                        id: currentClient.firebaseId // Inclure l'ID Firebase pour mise à jour
                    });
                } else {
                    // Sinon, vérifier si un client avec ce numéro de compteur existe déjà dans Firebase
                    const existingFirebaseClient = await window.firebaseService.getClientByMeter(currentClient.numeroCompteur);
                    if (existingFirebaseClient) {
                        // Mettre à jour le client existant dans Firebase
                        firebaseResult = await window.firebaseService.saveClientToFirebase({
                            ...firebaseData,
                            id: existingFirebaseClient.id
                        });
                    } else {
                        // Créer un nouveau client dans Firebase
                        firebaseResult = await window.firebaseService.saveClientToFirebase(firebaseData);
                    }
                }
                
                if (firebaseResult && firebaseResult.success) {
                    console.log('Client synchronisé avec Firebase:', firebaseResult.clientId);
                    
                    // Mettre à jour le client local avec l'ID Firebase
                    const updatedClients = getClientsFromLS();
                    const clientIndex = updatedClients.findIndex(c => c.id === clientId);
                    
                    if (clientIndex >= 0) {
                        updatedClients[clientIndex] = {
                            ...updatedClients[clientIndex],
                            firebaseId: firebaseResult.clientId,
                            isSynced: true,
                            syncedAt: new Date().toISOString()
                        };
                        
                        localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(updatedClients));
                    }
                    
                    // Mettre à jour clientData pour le retour
                    clientData.firebaseId = firebaseResult.clientId;
                    clientData.isSynced = true;
                    clientData.syncedAt = new Date().toISOString();
                    
                } else if (firebaseResult) {
                    console.warn('Échec synchronisation Firebase:', firebaseResult.error);
                }
                
            } catch (firebaseError) {
                console.error('Erreur Firebase:', firebaseError);
                // Continuer même en cas d'erreur Firebase
            }
        }
        
        // Si pas en ligne ou erreur Firebase, mettre en file d'attente
        if (!clientData.isSynced) {
            console.log('Client mis en file d\'attente pour synchronisation');
            
            const operationType = existingIndex >= 0 ? 'update' : 'create';
            const clientForQueue = {
                ...currentClient,
                operation: operationType
            };
            
            // Si c'est une mise à jour et qu'on a un firebaseId, l'inclure
            if (operationType === 'update' && currentClient.firebaseId) {
                clientForQueue.firebaseId = currentClient.firebaseId;
            }
            
            await saveToSyncQueue('client', clientForQueue);
        }
        
        // Mettre à jour la liste des compteurs pour l'autocomplétion
        await loadAllMeters();
        
        return {
            ...clientData,
            firebaseId: firebaseResult?.clientId || currentClient?.firebaseId,
            firebaseSuccess: firebaseResult?.success || false
        };
        
    } catch (error) {
        console.error('Erreur sauvegarde client:', error);
        
        // Journaliser l'erreur
        if (window.firebaseService) {
            await window.firebaseService.logAction('erreur_sauvegarde_client', error.message);
        }
        
        throw error;
    }
}

function getClientsFromLS() {
    try {
        const clients = localStorage.getItem(LS_KEYS.CLIENTS);
        return clients ? JSON.parse(clients) : [];
    } catch (error) {
        console.error('Erreur lecture clients:', error);
        return [];
    }
}

async function getClientsFromDB() {
    try {
        let clients = getClientsFromLS();
        
        console.log(`${clients.length} clients trouvés en local`);
        
        // Normaliser les données locales
        const normalizedClients = clients.map(client => ({
            id: client.id || Date.now().toString(),
            nom: client.nom || '',
            prenom: client.prenom || '',
            adresse: client.adresse || '',
            numeroCompteur: client.numeroCompteur || '',
            typeContrat: client.typeContrat || 'standard',
            email: client.email || '',
            telephone: client.telephone || '',
            solde: parseFloat(client.solde) || 0,
            consommationTotale: parseFloat(client.consommationTotale) || 0,
            createdAt: client.createdAt || new Date().toISOString(),
            updatedAt: client.updatedAt || new Date().toISOString(),
            dernierRecharge: client.dernierRecharge || null,
            statut: client.statut || 'actif',
            // Champs pour la synchronisation
            firebaseId: client.firebaseId || null,
            isSynced: client.isSynced !== undefined ? client.isSynced : true,
            companyId: client.companyId || 'local',
            syncedAt: client.syncedAt || null
        }));
        
        // === INTÉGRATION FIREBASE ===
        // Vérifier si nous sommes en ligne et authentifiés
        const shouldSyncWithFirebase = 
            navigator.onLine && 
            window.firebaseService && 
            window.firebaseService.currentUserId && 
            window.firebaseService.currentUserId();
        
        if (shouldSyncWithFirebase) {
            try {
                console.log('Tentative de récupération des clients depuis Firebase...');
                
                // 1. D'abord synchroniser les données locales vers Firebase
                await syncLocalClientsToFirebase(normalizedClients);
                
                // 2. Récupérer les clients depuis Firebase
                const firebaseResult = await window.firebaseService.getClientsFromFirebase();
                
                if (firebaseResult.success && firebaseResult.clients && firebaseResult.clients.length > 0) {
                    console.log(`${firebaseResult.clients.length} clients récupérés depuis Firebase`);
                    
                    // 3. Fusionner les données locales et Firebase
                    const mergedClients = mergeClientsWithFirebase(normalizedClients, firebaseResult.clients);
                    
                    // 4. Sauvegarder la fusion en LocalStorage
                    localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(mergedClients));
                    
                    // 5. Mettre à jour le timestamp de dernière synchronisation
                    localStorage.setItem('lastFirebaseSync_Clients', new Date().toISOString());
                    
                    console.log(`${mergedClients.length} clients après fusion`);
                    
                    // Trier par nom pour un affichage cohérent
                    mergedClients.sort((a, b) => {
                        const nomA = (a.nom || '').toLowerCase();
                        const nomB = (b.nom || '').toLowerCase();
                        const prenomA = (a.prenom || '').toLowerCase();
                        const prenomB = (b.prenom || '').toLowerCase();
                        
                        if (nomA === nomB) {
                            return prenomA.localeCompare(prenomB);
                        }
                        return nomA.localeCompare(nomB);
                    });
                    
                    return mergedClients;
                } else {
                    console.warn('Aucun client récupéré depuis Firebase:', firebaseResult.error);
                }
                
            } catch (firebaseError) {
                console.error('Erreur lors de la synchronisation Firebase:', firebaseError);
                
                // Journaliser l'erreur
                if (window.firebaseService.logAction) {
                    await window.firebaseService.logAction(
                        'erreur_sync_clients', 
                        `Erreur Firebase: ${firebaseError.message}`
                    );
                }
            }
        } else {
            console.log('Mode hors ligne - utilisation des données locales uniquement');
            
            // Marquer les clients non synchronisés
            const unsyncedClients = normalizedClients.filter(client => !client.isSynced);
            if (unsyncedClients.length > 0) {
                console.log(`${unsyncedClients.length} clients en attente de synchronisation`);
            }
        }
        
        // Trier les clients normalisés
        normalizedClients.sort((a, b) => {
            const nomA = (a.nom || '').toLowerCase();
            const nomB = (b.nom || '').toLowerCase();
            const prenomA = (a.prenom || '').toLowerCase();
            const prenomB = (b.prenom || '').toLowerCase();
            
            if (nomA === nomB) {
                return prenomA.localeCompare(prenomB);
            }
            return nomA.localeCompare(nomB);
        });
        
        console.log(`${normalizedClients.length} clients retournés`);
        return normalizedClients;
        
    } catch (error) {
        console.error('Erreur récupération clients DB:', error);
        
        // En cas d'erreur, retourner les données locales de secours
        try {
            const fallbackClients = getClientsFromLS().map(client => ({
                id: client.id || Date.now().toString(),
                nom: client.nom || '',
                prenom: client.prenom || '',
                adresse: client.adresse || '',
                numeroCompteur: client.numeroCompteur || '',
                typeContrat: client.typeContrat || 'standard',
                email: client.email || '',
                telephone: client.telephone || '',
                solde: parseFloat(client.solde) || 0,
                consommationTotale: parseFloat(client.consommationTotale) || 0,
                statut: client.statut || 'actif'
            }));
            
            console.warn(`Utilisation des données de secours: ${fallbackClients.length} clients`);
            return fallbackClients;
            
        } catch (fallbackError) {
            console.error('Erreur même avec le fallback:', fallbackError);
            throw new Error(`Impossible de récupérer les clients: ${error.message}`);
        }
    }
}

// Fonction pour synchroniser les clients locaux vers Firebase
async function syncLocalClientsToFirebase(localClients) {
    try {
        // Filtrer les clients qui ne sont pas synchronisés
        const clientsToSync = localClients.filter(client => !client.isSynced);
        
        if (clientsToSync.length === 0) {
            console.log('Aucun client à synchroniser vers Firebase');
            return;
        }
        
        console.log(`${clientsToSync.length} clients à synchroniser vers Firebase`);
        
        let syncedCount = 0;
        let errorCount = 0;
        
        // Synchroniser chaque client
        for (const client of clientsToSync) {
            try {
                // Préparer les données pour Firebase
                const firebaseData = {
                    nom: client.nom,
                    prenom: client.prenom,
                    adresse: client.adresse,
                    numeroCompteur: client.numeroCompteur,
                    typeContrat: client.typeContrat,
                    email: client.email,
                    telephone: client.telephone,
                    solde: client.solde,
                    consommationTotale: client.consommationTotale,
                    statut: client.statut,
                    createdAt: client.createdAt,
                    updatedAt: client.updatedAt,
                    dernierRecharge: client.dernierRecharge
                };
                
                // Si le client a déjà un firebaseId, c'est une mise à jour
                let result;
                if (client.firebaseId) {
                    firebaseData.id = client.firebaseId;
                    result = await window.firebaseService.saveClientToFirebase(firebaseData);
                } else {
                    // Sinon c'est une création
                    result = await window.firebaseService.saveClientToFirebase(firebaseData);
                }
                
                if (result.success) {
                    // Mettre à jour le client local
                    const updatedClients = getClientsFromLS();
                    const clientIndex = updatedClients.findIndex(c => c.id === client.id);
                    
                    if (clientIndex >= 0) {
                        updatedClients[clientIndex] = {
                            ...updatedClients[clientIndex],
                            firebaseId: result.clientId || client.firebaseId,
                            isSynced: true,
                            syncedAt: new Date().toISOString(),
                            companyId: result.data?.companyId || client.companyId
                        };
                        
                        localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(updatedClients));
                    }
                    
                    syncedCount++;
                    console.log(`Client synchronisé: ${client.prenom} ${client.nom}`);
                    
                } else {
                    errorCount++;
                    console.warn(`Échec synchronisation client ${client.id}:`, result.error);
                }
                
                // Petite pause pour éviter de surcharger Firebase
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (clientError) {
                errorCount++;
                console.error(`Erreur synchronisation client ${client.id}:`, clientError);
            }
        }
        
        console.log(`Synchronisation terminée: ${syncedCount} réussis, ${errorCount} échecs`);
        
        if (syncedCount > 0 && window.firebaseService.logAction) {
            await window.firebaseService.logAction(
                'sync_clients_firebase',
                `${syncedCount} clients synchronisés vers Firebase`
            );
        }
        
    } catch (error) {
        console.error('Erreur générale synchronisation clients:', error);
        throw error;
    }
}

// Fonction pour fusionner les clients locaux et Firebase
function mergeClientsWithFirebase(localClients, firebaseClients) {
    const mergedMap = new Map();
    
    // 1. Ajouter tous les clients Firebase
    firebaseClients.forEach(fbClient => {
        const firebaseId = fbClient.id;
        const clientKey = firebaseId || fbClient.numeroCompteur;
        
        if (clientKey) {
            const convertedClient = convertFirebaseClientToLocal(fbClient);
            mergedMap.set(clientKey, convertedClient);
        }
    });
    
    // 2. Ajouter ou fusionner les clients locaux
    localClients.forEach(localClient => {
        const clientKey = localClient.firebaseId || localClient.numeroCompteur;
        
        if (clientKey && mergedMap.has(clientKey)) {
            // Fusionner: garder les données les plus récentes
            const existingClient = mergedMap.get(clientKey);
            const localDate = new Date(localClient.updatedAt || localClient.createdAt);
            const firebaseDate = new Date(existingClient.updatedAt || existingClient.createdAt);
            
            if (localDate > firebaseDate && !localClient.isSynced) {
                // Les données locales sont plus récentes et non synchronisées
                mergedMap.set(clientKey, {
                    ...existingClient,
                    ...localClient,
                    // Indiquer que ces données doivent être resynchronisées
                    isSynced: false,
                    firebaseId: existingClient.firebaseId || localClient.firebaseId
                });
            } else if (localDate <= firebaseDate) {
                // Les données Firebase sont plus récentes ou égales
                mergedMap.set(clientKey, {
                    ...localClient,
                    ...existingClient,
                    isSynced: true
                });
            }
        } else if (clientKey) {
            // Client local avec clé mais pas dans Firebase
            mergedMap.set(clientKey, localClient);
        } else {
            // Client local sans clé identifiable (nouveau)
            const newKey = `local_${localClient.id}`;
            mergedMap.set(newKey, localClient);
        }
    });
    
    // Convertir la Map en array
    const mergedArray = Array.from(mergedMap.values());
    
    // Nettoyer les doublons par numeroCompteur
    const uniqueClients = [];
    const seenMeters = new Set();
    
    mergedArray.forEach(client => {
        if (client.numeroCompteur && !seenMeters.has(client.numeroCompteur)) {
            seenMeters.add(client.numeroCompteur);
            uniqueClients.push(client);
        } else if (!client.numeroCompteur) {
            uniqueClients.push(client);
        }
    });
    
    return uniqueClients;
}

// Fonction pour convertir un client Firebase au format local
function convertFirebaseClientToLocal(firebaseClient) {
    return {
        id: firebaseClient.id || Date.now().toString(),
        firebaseId: firebaseClient.id,
        nom: firebaseClient.nom || '',
        prenom: firebaseClient.prenom || '',
        adresse: firebaseClient.adresse || '',
        numeroCompteur: firebaseClient.numeroCompteur || '',
        typeContrat: firebaseClient.typeContrat || 'standard',
        email: firebaseClient.email || '',
        telephone: firebaseClient.telephone || '',
        solde: parseFloat(firebaseClient.solde) || 0,
        consommationTotale: parseFloat(firebaseClient.consommationTotale) || 0,
        statut: firebaseClient.statut || 'actif',
        companyId: firebaseClient.companyId || 'local',
        isSynced: true,
        syncedAt: new Date().toISOString(),
        // Gestion des dates Firebase
        createdAt: firebaseClient.createdAt instanceof Date ? 
            firebaseClient.createdAt.toISOString() : 
            (typeof firebaseClient.createdAt === 'string' ? 
                firebaseClient.createdAt : 
                new Date().toISOString()),
        updatedAt: firebaseClient.updatedAt instanceof Date ? 
            firebaseClient.updatedAt.toISOString() : 
            (typeof firebaseClient.updatedAt === 'string' ? 
                firebaseClient.updatedAt : 
                new Date().toISOString()),
        dernierRecharge: firebaseClient.dernierRecharge instanceof Date ? 
            firebaseClient.dernierRecharge.toISOString() : 
            (typeof firebaseClient.dernierRecharge === 'string' ? 
                firebaseClient.dernierRecharge : 
                null)
    };
}

// Fonction utilitaire pour vérifier l'état de la synchronisation
function getSyncStatus() {
    const clients = getClientsFromLS();
    const totalClients = clients.length;
    const syncedClients = clients.filter(c => c.isSynced).length;
    const unsyncedClients = totalClients - syncedClients;
    
    return {
        total: totalClients,
        synced: syncedClients,
        unsynced: unsyncedClients,
        percentage: totalClients > 0 ? Math.round((syncedClients / totalClients) * 100) : 100,
        lastSync: localStorage.getItem('lastFirebaseSync_Clients') || 'Jamais'
    };
}
async function findClientByMeter(meterNumber) {
    try {
        // Chercher d'abord en local
        let clients = getClientsFromLS();
        let client = clients.find(c => 
            c.numeroCompteur && c.numeroCompteur.trim() === meterNumber.trim()
        );
        
        // Si pas trouvé et en ligne, chercher dans Firebase
        if (!client && window.firebaseService && navigator.onLine && window.firebaseService.currentUserId()) {
            console.log('Recherche du client dans Firebase...');
            
            try {
                const clientsResult = await window.firebaseService.getClientsFromFirebase();
                
                if (clientsResult.success) {
                    const firebaseClient = clientsResult.clients.find(c => 
                        c.numeroCompteur && c.numeroCompteur.trim() === meterNumber.trim()
                    );
                    
                    if (firebaseClient) {
                        console.log('Client trouvé dans Firebase:', firebaseClient);
                        
                        // Convertir pour LocalStorage
                        client = {
                            id: firebaseClient.id || Date.now().toString(),
                            nom: firebaseClient.nom,
                            prenom: firebaseClient.prenom,
                            adresse: firebaseClient.adresse,
                            numeroCompteur: firebaseClient.numeroCompteur,
                            typeContrat: firebaseClient.typeContrat,
                            email: firebaseClient.email,
                            telephone: firebaseClient.telephone,
                            solde: parseFloat(firebaseClient.solde) || 0,
                            consommationTotale: parseFloat(firebaseClient.consommationTotale) || 0,
                            statut: firebaseClient.statut,
                            createdAt: firebaseClient.createdAt instanceof Date ? 
                                firebaseClient.createdAt.toISOString() : 
                                (firebaseClient.createdAt || new Date().toISOString()),
                            updatedAt: firebaseClient.updatedAt instanceof Date ? 
                                firebaseClient.updatedAt.toISOString() : 
                                (firebaseClient.updatedAt || new Date().toISOString()),
                            dernierRecharge: firebaseClient.dernierRecharge instanceof Date ? 
                                firebaseClient.dernierRecharge.toISOString() : 
                                firebaseClient.dernierRecharge,
                            firebaseId: firebaseClient.id,
                            isSynced: true,
                            companyId: firebaseClient.companyId
                        };
                        
                        // Sauvegarder localement pour usage futur
                        const existingIndex = clients.findIndex(c => 
                            c.firebaseId === client.firebaseId || 
                            c.numeroCompteur === client.numeroCompteur
                        );
                        
                        if (existingIndex >= 0) {
                            clients[existingIndex] = client;
                        } else {
                            clients.push(client);
                        }
                        
                        localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(clients));
                    }
                }
            } catch (firebaseError) {
                console.warn('Erreur recherche Firebase:', firebaseError);
            }
        }
        
        return client || null;
        
    } catch (error) {
        console.error('Erreur recherche client par compteur:', error);
        return null;
    }
}

async function findClientById(clientId) {
    const clients = getClientsFromLS();
    return clients.find(client => client.id === clientId);
}


// db.js - Modifiez la fonction deleteClientFromDB

async function deleteClientFromDB(clientId) {
    try {
        const clients = getClientsFromLS();
        const clientIndex = clients.findIndex(c => c.id === clientId);
        
        if (clientIndex === -1) {
            throw new Error('Client non trouvé');
        }
        
        const clientToDelete = clients[clients.findIndex(c => c.id === clientId)];
        
        // Vérifier s'il y a des tokens non utilisés
        const tokens = getTokensFromLS();
        const activeTokens = tokens.filter(t => 
            t.clientId === clientId && t.status === 'unused'
        );
        
        if (activeTokens.length > 0) {
            throw new Error(`Impossible de supprimer. ${activeTokens.length} token(s) non utilisé(s).`);
        }
        
        // Supprimer localement
        clients.splice(clientIndex, 1);
        localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(clients));
        
        // Supprimer aussi les tokens associés
        const filteredTokens = tokens.filter(token => token.clientId !== clientId);
        localStorage.setItem(LS_KEYS.TOKENS, JSON.stringify(filteredTokens));
        
        // === SYNCHRONISER AVEC FIREBASE ===
        if (window.firebaseService && navigator.onLine) {
            try {
                // Si le client a un firebaseId, le supprimer de Firebase
                if (clientToDelete.firebaseId) {
                    await window.firebaseService.deleteClientFromFirebase(clientToDelete.firebaseId);
                    console.log('Client supprimé de Firebase:', clientToDelete.firebaseId);
                } else {
                    // Sinon, chercher par numéro de compteur
                    const firebaseClient = await window.firebaseService.getClientByMeter(clientToDelete.numeroCompteur);
                    if (firebaseClient && firebaseClient.id) {
                        await window.firebaseService.deleteClientFromFirebase(firebaseClient.id);
                        console.log('Client supprimé de Firebase (par compteur):', firebaseClient.id);
                    }
                }
            } catch (firebaseError) {
                console.warn('Erreur suppression Firebase:', firebaseError);
                // Mettre en file d'attente pour suppression
                await saveToSyncQueue('client', {
                    ...clientToDelete,
                    operation: 'delete'
                });
            }
        } else {
            // Mettre en file d'attente pour synchronisation
            await saveToSyncQueue('client', {
                ...clientToDelete,
                operation: 'delete'
            });
        }
        
        // Mettre à jour la liste des compteurs
        await loadAllMeters();
        
        // Journaliser
        if (window.firebaseService) {
            await window.firebaseService.logAction(
                'suppression_client', 
                `Client supprimé: ${clientToDelete.prenom} ${clientToDelete.nom} (${clientToDelete.numeroCompteur})`
            );
        }
        
        return { success: true, client: clientToDelete };
        
    } catch (error) {
        console.error('Erreur suppression client:', error);
        
        // Journaliser l'erreur
        if (window.firebaseService) {
            await window.firebaseService.logAction('erreur_suppression_client', error.message);
        }
        
        throw error;
    }
}

// Fonctions Tokens
async function saveTokenToLocal(tokenData) {
    try {
      const tokens = getTokensFromLS();
      
      const token = {
        id: tokenData.id || Date.now().toString(),
        token: tokenData.token || '',
        meter: tokenData.meter || '',
        amount: tokenData.amount || 0,
        kwh: tokenData.kwh || calculateKwhFromAmount(tokenData.amount || 0),
        date: tokenData.date || new Date().toISOString(),
        status: tokenData.status || 'unused',
        clientId: tokenData.clientId || null,
        generatedBy: tokenData.generatedBy || (currentUser ? currentUser.name : 'system'),
        usedDate: tokenData.usedDate || null,
        sentVia: tokenData.sentVia || null,
        sentDate: tokenData.sentDate || null,
        tarifKwh: TARIF_KWH,
        devise: DEVISE,
        isSynced: false // Marquer pour synchronisation
      };
      
      tokens.push(token);
      localStorage.setItem(LS_KEYS.TOKENS, JSON.stringify(tokens));
      
      // Mettre à jour la dernière recharge du client
      updateClientLastRecharge(token.meter, token.amount, token.date);
      
      // Sauvegarder en Firebase si en ligne
      if (window.firebaseService && navigator.onLine) {
        const firebaseResult = await window.firebaseService.saveTokenToFirebase(token);
        if (firebaseResult.success) {
          token.isSynced = true;
          token.firebaseId = firebaseResult.tokenId;
          localStorage.setItem(LS_KEYS.TOKENS, JSON.stringify(tokens));
        }
      } else {
        // Mettre en file d'attente
        await saveToSyncQueue('token', token);
      }
      
      console.log('Token sauvegardé localement:', token);
      return token;
    } catch (error) {
      console.error('Erreur sauvegarde token:', error);
      throw error;
    }
  }

function getTokensFromLS() {
    try {
        const tokens = localStorage.getItem(LS_KEYS.TOKENS);
        return tokens ? JSON.parse(tokens) : [];
    } catch (error) {
        console.error('Erreur lecture tokens:', error);
        return [];
    }
}

async function getTokensFromDB() {
    return getTokensFromLS();
}

async function updateTokenStatus(tokenId, status) {
    try {
        const tokens = getTokensFromLS();
        const tokenIndex = tokens.findIndex(t => t.id === tokenId);
        
        if (tokenIndex >= 0) {
            tokens[tokenIndex].status = status;
            tokens[tokenIndex].usedDate = status === 'used' ? new Date().toISOString() : null;
            localStorage.setItem(LS_KEYS.TOKENS, JSON.stringify(tokens));
            return true;
        }
        return false;
    } catch (error) {
        console.error('Erreur mise à jour token:', error);
        throw error;
    }
}

// Fonctions Transactions
async function saveTransaction(transactionData) {
    try {
        const transactions = getTransactionsFromLS();
        
        const transaction = {
            id: transactionData.id || Date.now().toString(),
            clientId: transactionData.clientId,
            meter: transactionData.meter,
            token: transactionData.token,
            amount: transactionData.amount,
            kwh: transactionData.kwh,
            type: transactionData.type || 'recharge', // 'recharge', 'consommation', 'ajustement'
            date: transactionData.date || new Date().toISOString(),
            description: transactionData.description || '',
            operator: transactionData.operator || (currentUser ? currentUser.name : 'system')
        };
        
        transactions.push(transaction);
        localStorage.setItem(LS_KEYS.TRANSACTIONS, JSON.stringify(transactions));
        
        return transaction;
    } catch (error) {
        console.error('Erreur sauvegarde transaction:', error);
        throw error;
    }
}

function getTransactionsFromLS() {
    try {
        const transactions = localStorage.getItem(LS_KEYS.TRANSACTIONS);
        return transactions ? JSON.parse(transactions) : [];
    } catch (error) {
        console.error('Erreur lecture transactions:', error);
        return [];
    }
}

async function getClientTransactions(clientId) {
    const transactions = getTransactionsFromLS();
    return transactions.filter(t => t.clientId === clientId);
}

// Fonctions Logs
async function saveLogToLocal(log) {
    try {
        const logs = getLogsFromLS();
        
        const logEntry = {
            id: Date.now().toString(),
            user: log.user || (currentUser ? currentUser.name : 'inconnu'),
            action: log.action || 'unknown',
            details: log.details || '',
            timestamp: log.timestamp || new Date().toISOString(),
            online: log.online !== undefined ? log.online : navigator.onLine,
            ip: log.ip || 'local'
        };
        
        logs.push(logEntry);
        localStorage.setItem(LS_KEYS.LOGS, JSON.stringify(logs));
        
        return logEntry;
    } catch (error) {
        console.error('Erreur sauvegarde log:', error);
        throw error;
    }
}

function getLogsFromLS() {
    try {
        const logs = localStorage.getItem(LS_KEYS.LOGS);
        return logs ? JSON.parse(logs) : [];
    } catch (error) {
        console.error('Erreur lecture logs:', error);
        return [];
    }
}

// Gestion file d'attente synchronisation
// db.js - Ajouter ces fonctions

// File d'attente de synchronisation
function getSyncQueueFromLS() {
    try {
      const queue = localStorage.getItem(LS_KEYS.SYNC_QUEUE);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('Erreur lecture sync queue:', error);
      return [];
    }
  }
  
  async function saveToSyncQueue(type, data) {
    try {
      const queue = getSyncQueueFromLS();
      
      queue.push({
        id: Date.now().toString(),
        type: type,
        data: data,
        operation: 'create',
        localId: data.id || Date.now().toString(),
        synced: false,
        attempts: 0,
        companyId: window.firebaseService.currentCompanyId ? window.firebaseService.currentCompanyId() : 'local',
        createdAt: new Date().toISOString()
      });
      
      localStorage.setItem(LS_KEYS.SYNC_QUEUE, JSON.stringify(queue));
      return { success: true, id: queue[queue.length - 1].id };
    } catch (error) {
      console.error('Erreur sauvegarde sync queue:', error);
      return { success: false, error: error.message };
    }
  }
  
  async function markAsSyncedInLS(syncId) {
    try {
      const queue = getSyncQueueFromLS();
      const itemIndex = queue.findIndex(item => item.id === syncId);
      
      if (itemIndex >= 0) {
        queue[itemIndex].synced = true;
        queue[itemIndex].syncedAt = new Date().toISOString();
        localStorage.setItem(LS_KEYS.SYNC_QUEUE, JSON.stringify(queue));
      }
      return { success: true };
    } catch (error) {
      console.error('Erreur mise à jour sync:', error);
      return { success: false, error: error.message };
    }
  }

// Statistiques Dashboard
async function getDashboardStats() {
    try {
        const clients = getClientsFromLS();
        const tokens = getTokensFromLS();
        const transactions = getTransactionsFromLS();
        const syncQueue = getSyncQueueFromLS();
        
        // Date d'aujourd'hui
        const today = new Date().toDateString();
        
        // Tokens d'aujourd'hui
        const todayTokens = tokens.filter(t => {
            const tokenDate = new Date(t.date).toDateString();
            return tokenDate === today;
        });
        
        // Calculs en Ariary
        const salesToday = todayTokens.reduce((sum, t) => sum + (parseInt(t.amount) || 0), 0);
        const kwhToday = todayTokens.reduce((sum, t) => sum + (parseFloat(t.kwh) || 0), 0);
        
        // Tokens de la semaine
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekTokens = tokens.filter(t => new Date(t.date) >= weekAgo);
        const salesWeek = weekTokens.reduce((sum, t) => sum + (parseInt(t.amount) || 0), 0);
        
        // Tokens du mois
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        const monthTokens = tokens.filter(t => new Date(t.date) >= monthAgo);
        const salesMonth = monthTokens.reduce((sum, t) => sum + (parseInt(t.amount) || 0), 0);
        
        const activeTokens = tokens.filter(t => t.status === 'unused').length;
        const usedTokens = tokens.filter(t => t.status === 'used').length;
        
        const pendingSync = syncQueue.filter(item => !item.synced).length;
        
        // Clients avec solde bas (< 5000 Ar)
        const clientsLowBalance = clients.filter(c => (c.solde || 0) < 5000).length;
        
        // Top clients (par consommation ou recharges)
        const topClients = [...clients]
            .sort((a, b) => (b.consommationTotale || 0) - (a.consommationTotale || 0))
            .slice(0, 5);
        
        return {
            salesToday: salesToday,
            kwhToday: kwhToday,
            salesWeek: salesWeek,
            salesMonth: salesMonth,
            activeTokens: activeTokens,
            usedTokens: usedTokens,
            totalClients: clients.length,
            alertsCount: clientsLowBalance,
            pendingSync: pendingSync,
            topClients: topClients,
            totalKwh: tokens.reduce((sum, t) => sum + (parseFloat(t.kwh) || 0), 0),
            totalRevenue: tokens.reduce((sum, t) => sum + (parseInt(t.amount) || 0), 0)
        };
    } catch (error) {
        console.error('Erreur calcul statistiques:', error);
        return {
            salesToday: 0,
            kwhToday: 0,
            salesWeek: 0,
            salesMonth: 0,
            activeTokens: 0,
            usedTokens: 0,
            totalClients: 0,
            alertsCount: 0,
            pendingSync: 0,
            topClients: [],
            totalKwh: 0,
            totalRevenue: 0
        };
    }
}
// Fonctions utilitaires
function updateClientLastRecharge(meterNumber, amount, date) {
    try {
        const clients = getClientsFromLS();
        const clientIndex = clients.findIndex(c => c.numeroCompteur === meterNumber);
        
        if (clientIndex >= 0) {
            const client = clients[clientIndex];
            client.dernierRecharge = date;
            client.solde = (parseFloat(client.solde) || 0) + parseFloat(amount);
            client.updatedAt = new Date().toISOString();
            
            localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(clients));
        }
    } catch (error) {
        console.error('Erreur mise à jour client:', error);
    }
}

// Fonction de recherche améliorée
function searchClients(searchTerm) {
    const clients = getClientsFromLS();
    
    if (!searchTerm || searchTerm.trim() === '') {
        return clients;
    }
    
    const term = searchTerm.toLowerCase().trim();
    return clients.filter(client => {
        return (
            (client.nom && client.nom.toLowerCase().includes(term)) ||
            (client.prenom && client.prenom.toLowerCase().includes(term)) ||
            (client.numeroCompteur && client.numeroCompteur.toLowerCase().includes(term)) ||
            (client.adresse && client.adresse.toLowerCase().includes(term)) ||
            (client.email && client.email.toLowerCase().includes(term)) ||
            (client.telephone && client.telephone.includes(term))
        );
    });
}

// Données de démonstration
// function initSampleData() {
//     // Vérifier si des données existent déjà
//     const existingClients = getClientsFromLS();
//     if (existingClients.length > 0) {
//         return; // Ne pas écraser les données existantes
//     }
    
//     // Clients de démonstration
//     const sampleClients = [
//         {
//             id: '1',
//             nom: 'Dupont',
//             prenom: 'Jean',
//             adresse: '123 Rue de Paris, 75001 Paris',
//             numeroCompteur: 'COMPT001',
//             typeContrat: 'standard',
//             email: 'jean.dupont@email.com',
//             telephone: '01 23 45 67 89',
//             solde: 150.50,
//             consommationTotale: 1250.75,
//             createdAt: '2024-01-15T10:30:00Z',
//             updatedAt: '2024-01-15T10:30:00Z',
//             dernierRecharge: '2024-01-10T14:25:00Z',
//             statut: 'actif'
//         },
//         {
//             id: '2',
//             nom: 'Martin',
//             prenom: 'Marie',
//             adresse: '456 Avenue des Champs, 69002 Lyon',
//             numeroCompteur: 'COMPT002',
//             typeContrat: 'premium',
//             email: 'marie.martin@email.com',
//             telephone: '04 56 78 90 12',
//             solde: 75.25,
//             consommationTotale: 890.30,
//             createdAt: '2024-01-16T09:15:00Z',
//             updatedAt: '2024-01-16T09:15:00Z',
//             dernierRecharge: '2024-01-12T11:45:00Z',
//             statut: 'actif'
//         },
//         {
//             id: '3',
//             nom: 'Bernard',
//             prenom: 'Pierre',
//             adresse: '789 Boulevard Maritime, 13008 Marseille',
//             numeroCompteur: 'COMPT003',
//             typeContrat: 'standard',
//             email: 'pierre.bernard@email.com',
//             telephone: '04 91 23 45 67',
//             solde: 25.00,
//             consommationTotale: 1560.20,
//             createdAt: '2024-01-14T16:45:00Z',
//             updatedAt: '2024-01-14T16:45:00Z',
//             dernierRecharge: '2024-01-05T09:30:00Z',
//             statut: 'actif'
//         }
//     ];
    
//     localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(sampleClients));
    
//     // Tokens de démonstration
//     const sampleTokens = [
//         {
//             id: 'TOK001',
//             token: '1234-5678-9012-3456',
//             meter: 'COMPT001',
//             amount: 50.00,
//             kwh: 100.00,
//             date: '2024-01-10T14:25:00Z',
//             status: 'used',
//             clientId: '1',
//             generatedBy: 'admin',
//             usedDate: '2024-01-11T10:15:00Z',
//             sentVia: 'email'
//         },
//         {
//             id: 'TOK002',
//             token: '2345-6789-0123-4567',
//             meter: 'COMPT002',
//             amount: 30.00,
//             kwh: 60.00,
//             date: '2024-01-12T11:45:00Z',
//             status: 'used',
//             clientId: '2',
//             generatedBy: 'agent',
//             usedDate: '2024-01-13T08:30:00Z',
//             sentVia: 'sms'
//         },
//         {
//             id: 'TOK003',
//             token: '3456-7890-1234-5678',
//             meter: 'COMPT003',
//             amount: 25.00,
//             kwh: 50.00,
//             date: '2024-01-05T09:30:00Z',
//             status: 'used',
//             clientId: '3',
//             generatedBy: 'admin',
//             usedDate: '2024-01-06T14:20:00Z',
//             sentVia: 'print'
//         }
//     ];
    
//     localStorage.setItem(LS_KEYS.TOKENS, JSON.stringify(sampleTokens));
    
//     console.log('Données de démonstration initialisées');
// }

// Export des fonctions

function mergeFirebaseData(localData, firebaseData, key = 'id') {
    const merged = [...localData];
    const localMap = new Map(localData.map(item => [item[key], item]));
    
    firebaseData.forEach(fbItem => {
        const existing = localMap.get(fbItem[key]);
        if (existing) {
            // Fusionner: garder la version la plus récente
            const localDate = new Date(existing.updatedAt || existing.createdAt || 0);
            const firebaseDate = new Date(fbItem.updatedAt || fbItem.createdAt || 0);
            
            if (firebaseDate > localDate) {
                // Mettre à jour avec les données Firebase
                Object.assign(existing, fbItem);
                existing.isSynced = true;
            }
        } else {
            // Ajouter les données Firebase
            fbItem.isSynced = true;
            merged.push(fbItem);
        }
    });
    
    return merged;
}

// Synchroniser les données manuellement
async function manualSync() {
    try {
        if (!navigator.onLine) {
            showNotification('Pas de connexion Internet', 'error');
            return { success: false, error: 'Offline' };
        }
        
        if (!window.firebaseService || !window.firebaseService.currentUserId()) {
            showNotification('Veuillez vous connecter', 'warning');
            return { success: false, error: 'Not authenticated' };
        }
        
        showNotification('Synchronisation en cours...', 'info');
        
        // 1. Récupérer les données Firebase
        const [clientsResult, tokensResult] = await Promise.all([
            window.firebaseService.getClientsFromFirebase(),
            window.firebaseService.getTokensFromFirebase()
        ]);
        
        // 2. Fusionner avec les données locales
        if (clientsResult.success) {
            const localClients = getClientsFromLS();
            const mergedClients = mergeFirebaseData(localClients, clientsResult.clients, 'numeroCompteur');
            localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(mergedClients));
        }
        
        if (tokensResult.success) {
            const localTokens = getTokensFromLS();
            const mergedTokens = mergeFirebaseData(localTokens, tokensResult.tokens, 'token');
            localStorage.setItem(LS_KEYS.TOKENS, JSON.stringify(mergedTokens));
        }
        
        // 3. Synchroniser les données locales vers Firebase
        await window.firebaseService.syncLocalData();
        
        showNotification('Synchronisation terminée', 'success');
        
        // Recharger l'affichage
        await loadDashboardData();
        await loadClients();
        await loadAllMeters();
        
        return { success: true };
        
    } catch (error) {
        console.error('Erreur synchronisation manuelle:', error);
        showNotification('Erreur synchronisation: ' + error.message, 'error');
        return { success: false, error: error.message };
    }
}

function checkStorageSpace() {
    try {
        const totalSpace = 5 * 1024 * 1024; // 5MB (limite commune)
        let usedSpace = 0;
        
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                usedSpace += localStorage[key].length * 2; // Chars to bytes
            }
        }
        
        const percentage = (usedSpace / totalSpace) * 100;
        
        if (percentage > 80) {
            console.warn(`LocalStorage presque plein: ${percentage.toFixed(2)}%`);
            alert('Attention: l\'espace de stockage local est presque plein. Veuillez synchroniser ou exporter vos données.');
        }
        
        return {
            used: usedSpace,
            total: totalSpace,
            percentage: percentage
        };
    } catch (error) {
        console.error('Erreur vérification espace:', error);
        return null;
    }
}
window.dbFunctions = {
    initDatabase,
    saveClient,
    getClientsFromDB,
    findClientByMeter,
    findClientById,
    deleteClientFromDB,
    saveTokenToLocal,
    getTokensFromDB,
    updateTokenStatus,
    saveTransaction,
    getClientTransactions,
    saveLogToLocal,
    saveToSyncQueue,
    markAsSyncedInLS,
    getDashboardStats,
    searchClients,
    TARIF_KWH,
    DEVISE,
    calculateKwhFromAmount,
    calculateAmountFromKwh
};
