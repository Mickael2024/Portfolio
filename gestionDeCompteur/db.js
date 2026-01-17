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
            statut: client.statut || 'actif'
        };
        
        // Vérifier si le client existe déjà
        const existingIndex = clients.findIndex(c => c.id === clientId);
        
        if (existingIndex >= 0) {
            clients[existingIndex] = clientData;
        } else {
            // Vérifier si le numéro de compteur existe déjà
            const existingMeter = clients.find(c => c.numeroCompteur === clientData.numeroCompteur);
            if (existingMeter) {
                throw new Error('Numéro de compteur déjà utilisé');
            }
            clients.push(clientData);
        }
        
        localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(clients));
        console.log('Client sauvegardé:', clientData);
        
        return clientData;
    } catch (error) {
        console.error('Erreur sauvegarde client:', error);
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
        const clients = getClientsFromLS();
        
        // Assurer que tous les clients ont les champs nécessaires
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
            statut: client.statut || 'actif'
        }));
        
        console.log(`${normalizedClients.length} clients normalisés`);
        return normalizedClients;
    } catch (error) {
        console.error('Erreur récupération clients DB:', error);
        throw error;
    }
}

async function findClientByMeter(meterNumber) {
    const clients = getClientsFromLS();
    return clients.find(client => 
        client.numeroCompteur && client.numeroCompteur.trim() === meterNumber.trim()
    );
}

async function findClientById(clientId) {
    const clients = getClientsFromLS();
    return clients.find(client => client.id === clientId);
}


async function deleteClientFromDB(clientId) {
    try {
        const clients = getClientsFromLS();
        const clientIndex = clients.findIndex(c => c.id === clientId);
        
        if (clientIndex === -1) {
            return false;
        }
        
        clients.splice(clientIndex, 1);
        localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(clients));
        
        return true;
    } catch (error) {
        console.error('Erreur suppression client:', error);
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
            tarifKwh: TARIF_KWH, // Sauvegarder le tarif utilisé
            devise: DEVISE // Sauvegarder la devise
        };
        
        tokens.push(token);
        localStorage.setItem(LS_KEYS.TOKENS, JSON.stringify(tokens));
        
        // Mettre à jour la dernière recharge du client
        updateClientLastRecharge(token.meter, token.amount, token.date);
        
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
            timestamp: new Date().toISOString(),
            synced: false,
            attempts: 0
        });
        
        localStorage.setItem(LS_KEYS.SYNC_QUEUE, JSON.stringify(queue));
        return true;
    } catch (error) {
        console.error('Erreur sauvegarde sync queue:', error);
        throw error;
    }
}

async function markAsSynced(syncId) {
    try {
        const queue = getSyncQueueFromLS();
        const itemIndex = queue.findIndex(item => item.id === syncId);
        
        if (itemIndex >= 0) {
            queue[itemIndex].synced = true;
            queue[itemIndex].syncedAt = new Date().toISOString();
            localStorage.setItem(LS_KEYS.SYNC_QUEUE, JSON.stringify(queue));
        }
        return true;
    } catch (error) {
        console.error('Erreur mise à jour sync:', error);
        throw error;
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
    markAsSynced,
    getDashboardStats,
    searchClients,
    TARIF_KWH,
    DEVISE,
    calculateKwhFromAmount,
    calculateAmountFromKwh
};
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