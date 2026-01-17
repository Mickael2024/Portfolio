// Variables globales
let currentUser = null;
let isOnline = navigator.onLine;
let database = null;
let pendingSync = [];
let allMeters = [];

let currentMeterSuggestions = [];
// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    setupEventListeners();
    checkAuth();
    updateOnlineStatus();
    
    // Écouter les changements de connexion
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
});
// app.js - Ajoutez cette fonction
async function loadInitialData() {
    try {
        const isOnline = navigator.onLine;
        const hasLocalData = localStorage.getItem('gestion_compteurs_clients') && 
                            JSON.parse(localStorage.getItem('gestion_compteurs_clients')).length > 0;
        
        // Si LocalStorage est vide ET on est en ligne ET Firebase est disponible
        if (!hasLocalData && isOnline && window.firebaseService) {
            console.log('📡 LocalStorage vide - Chargement depuis Firebase...');
            
            const testResult = await window.firebaseService.testConnection();
            if (testResult.success) {
                // 1. Charger les clients depuis Firebase
                const clientsResult = await window.firebaseService.getClientsFromFirebase();
                
                if (clientsResult.success && clientsResult.clients.length > 0) {
                    console.log(`📊 ${clientsResult.clients.length} clients trouvés dans Firebase`);
                    
                    // Convertir au format LocalStorage
                    const localClients = clientsResult.clients.map(fbClient => ({
                        id: fbClient.localId || `client_${Date.now()}`,
                        nom: fbClient.nom || '',
                        prenom: fbClient.prenom || '',
                        adresse: fbClient.adresse || '',
                        numeroCompteur: fbClient.numeroCompteur || '',
                        typeContrat: fbClient.typeContrat || 'standard',
                        email: fbClient.email || '',
                        telephone: fbClient.telephone || '',
                        solde: parseFloat(fbClient.solde) || 0,
                        consommationTotale: parseFloat(fbClient.consommationTotale) || 0,
                        statut: fbClient.statut || 'actif',
                        createdAt: fbClient.createdAt || new Date().toISOString(),
                        updatedAt: fbClient.updatedAt || new Date().toISOString(),
                        dernierRecharge: fbClient.dernierRecharge || null,
                        companyId: fbClient.companyId || 'default',
                        firebaseId: fbClient.id,
                        isSynced: true,
                        syncedAt: new Date().toISOString()
                    }));
                    
                    // Sauvegarder dans LocalStorage
                    localStorage.setItem('gestion_compteurs_clients', JSON.stringify(localClients));
                    console.log(`💾 ${localClients.length} clients sauvegardés dans LocalStorage`);
                    
                    // 2. Charger les tokens depuis Firebase
                    const tokensResult = await window.firebaseService.getTokensFromFirebase();
                    if (tokensResult.success && tokensResult.tokens.length > 0) {
                        const localTokens = tokensResult.tokens.map(fbToken => ({
                            id: fbToken.id || `token_${Date.now()}`,
                            token: fbToken.token || '',
                            meter: fbToken.meter || '',
                            amount: parseFloat(fbToken.amount) || 0,
                            kwh: parseFloat(fbToken.kwh) || 0,
                            date: fbToken.date || new Date().toISOString(),
                            status: fbToken.status || 'unused',
                            clientId: fbToken.clientId || null,
                            generatedBy: fbToken.generatedBy || 'system',
                            usedDate: fbToken.usedDate || null,
                            sentVia: fbToken.sentVia || null,
                            sentDate: fbToken.sentDate || null,
                            tarifKwh: 500,
                            devise: 'Ar',
                            isSynced: true,
                            firebaseId: fbToken.id
                        }));
                        
                        localStorage.setItem('gestion_compteurs_tokens', JSON.stringify(localTokens));
                        console.log(`🔑 ${localTokens.length} tokens sauvegardés dans LocalStorage`);
                    }
                }
            }
        }
        
        // Charger l'affichage
        await loadDashboardData();
        await loadClients();
        await loadAllMeters();
        
    } catch (error) {
        console.error('Erreur chargement initial:', error);
        // Continuer même en cas d'erreur
    }
}

async function initApp() {
    try {
        console.log('Initialisation de l\'application...');
        
        // Initialiser LocalStorage
        await initDatabase();
        
        // Vérifier Firebase
        if (window.firebaseService) {
            const testResult = await window.firebaseService.testConnection();
            if (testResult.success) {
                console.log('✅ Firebase connecté');
            } else {
                console.warn('⚠️ Firebase non disponible:', testResult.error);
            }
        }
        
        // Charger les données (LocalStorage OU Firebase)
        await loadInitialData(); // ← REMPLACER les 3 lignes par cette fonction
        
        updateOnlineStatus();
        updateAuthUI();
        
    } catch (error) {
        console.error('Erreur initialisation:', error);
        showNotification('Erreur initialisation: ' + error.message, 'error');
    }
}
function updateAuthUI() {
    const userNameElement = document.getElementById('userName');
    const loginModal = document.getElementById('loginModal');
    
    if (currentUser) {
        userNameElement.textContent = currentUser.name;
        if (loginModal) {
            loginModal.style.display = 'none';
        }
    } else {
        userNameElement.textContent = 'Non connecté';
        if (loginModal) {
            loginModal.style.display = 'flex';
        }
    }
}
function calculateKwh() {
    const amount = parseFloat(document.getElementById('rechargeAmount').value) || 0;
    // 500 Ar = 1 kWh
    const kwh = amount / 500;
    document.getElementById('rechargeKwh').value = kwh.toFixed(3);
    
    // Mettre à jour l'affichage du tarif
    updateTarifDisplay();
}

function calculateAmount() {
    const kwh = parseFloat(document.getElementById('rechargeKwh').value) || 0;
    // 1 kWh = 500 Ar
    const amount = kwh * 500;
    document.getElementById('rechargeAmount').value = amount.toFixed(0);
    
    // Mettre à jour l'affichage du tarif
    updateTarifDisplay();
}
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function() {
            const page = this.getAttribute('data-page');
            switchPage(page);
        });
    });
    setupPresetButtons();
    initAutocomplete();
    
    // Modifier l'écouteur pour searchClientByMeter
    const searchClientByMeterBtn = document.getElementById('searchClientByMeter');
    if (searchClientByMeterBtn) {
        searchClientByMeterBtn.remove(); // On supprime le bouton car l'autocomplétion le remplace
    }
    // Entrée montant/kwh
    document.getElementById('rechargeAmount').addEventListener('input', calculateKwh);
    document.getElementById('rechargeKwh').addEventListener('input', calculateAmount);
    // Boutons d'action rapide
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleQuickAction(action);
        });
    });
    
    // Recherche client
    document.getElementById('clientSearch').addEventListener('input', function(e) {
        const searchTerm = e.target.value;
        const results = searchClients(searchTerm);
        displayClients(results);
    });
    // Génération token
    document.getElementById('generateTokenBtn').addEventListener('click', generateToken);
    document.getElementById('rechargeAmount').addEventListener('input', calculateKwh);
    // document.getElementById('searchClientByMeter').addEventListener('click', searchClientByMeter);
    
    // Synchronisation
    document.getElementById('syncBtn').addEventListener('click', synchronizeData);
    
    // Connexion
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.querySelector('[data-action="exportData"]').addEventListener('click', exportData);
    document.getElementById('addClientBtn').addEventListener('click', showAddClientModal);


}
window.searchClients = function(searchTerm) {
    const results = searchClients(searchTerm);
    displayClients(results);
};
// Fonctions de navigation
function switchPage(pageId) {
    // Mettre à jour le menu
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === pageId) {
            item.classList.add('active');
        }
    });
    
    // Afficher la page correspondante
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    document.getElementById(pageId + 'Page').classList.add('active');
}
// Fonctions pour les actions rapides
function handleQuickAction(action) {
    console.log('Action rapide:', action);
    
    switch(action) {
        case 'addClient':
            showAddClientModal();
            break;
            
        case 'generateToken':
            switchPage('tokens');
            // Mettre le focus sur le champ de recherche
            setTimeout(() => {
                document.getElementById('meterNumber').focus();
            }, 100);
            break;
            
        case 'viewReports':
            switchPage('reporting');
            break;
            
        case 'exportData':
            exportData();
            break;
            
        case 'viewAlerts':
            showAlerts();
            break;
            
        case 'syncNow':
            synchronizeData();
            break;
            
        default:
            console.warn('Action non reconnue:', action);
    }
}
// Fonctions de gestion des données
async function loadDashboardData() {
    try {
        const stats = await getDashboardStats();
        
        // Formater avec séparateurs de milliers pour Ariary
        const formatAriary = (amount) => {
            return parseInt(amount).toLocaleString('fr-FR') + ' Ar';
        };
        
        document.getElementById('salesToday').textContent = formatAriary(stats.salesToday);
        document.getElementById('kwhToday').textContent = `${parseFloat(stats.kwhToday).toFixed(3)} kWh`;
        document.getElementById('activeTokens').textContent = stats.activeTokens;
        document.getElementById('usedTokens').textContent = `${stats.usedTokens} utilisés`;
        document.getElementById('totalClients').textContent = stats.totalClients;
        document.getElementById('alertsCount').textContent = stats.alertsCount;
        document.getElementById('pendingSync').textContent = `${stats.pendingSync} en attente`;
        
    } catch (error) {
        console.error('Erreur chargement dashboard:', error);
    }
}
// Dans la fonction loadClients()
async function loadClients() {
    try {
        console.log('Chargement des clients...');
        const clients = await getClientsFromDB();
        console.log(`${clients.length} clients chargés`, clients);
        displayClients(clients);
    } catch (error) {
        console.error('Erreur chargement clients:', error);
        // Afficher un message d'erreur dans le tableau
        const tbody = document.getElementById('clientsTableBody');
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #e74c3c; padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                    <p>Erreur lors du chargement des clients</p>
                    <p><small>${error.message}</small></p>
                    <button class="btn-primary" onclick="location.reload()">
                        <i class="fas fa-redo"></i> Réessayer
                    </button>
                </td>
            </tr>
        `;
    }
}

function displayClients(clients) {
    const tbody = document.getElementById('clientsTableBody');
    tbody.innerHTML = '';
    
    if (clients.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="6" style="text-align: center; padding: 40px;">
                <i class="fas fa-users" style="font-size: 3rem; color: #ccc; margin-bottom: 15px;"></i>
                <p>Aucun client trouvé</p>
                <button class="btn-primary" onclick="showAddClientModal()">
                    <i class="fas fa-user-plus"></i> Ajouter votre premier client
                </button>
            </td>
        `;
        tbody.appendChild(row);
        return;
    }
    
    clients.forEach(client => {
        // Récupérer les valeurs du client avec des valeurs par défaut
        const nom = client.nom || 'N/A';
        const prenom = client.prenom || 'N/A';
        const numeroCompteur = client.numeroCompteur || 'N/A';
        const typeContrat = client.typeContrat || 'standard';
        const soldeValue = parseFloat(client.solde) || 0;
        const consommationValue = parseFloat(client.consommationTotale) || 0;
        const dernierRecharge = client.dernierRecharge;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${nom}</td>
            <td>${prenom}</td>
            <td><strong>${numeroCompteur}</strong></td>
            <td><span class="contract-type">${typeContrat}</span></td>
            <td>
                ${dernierRecharge ? formatDate(dernierRecharge) : 'Jamais'}
                ${soldeValue > 0 ? `<br><small>Solde: ${soldeValue.toLocaleString('fr-FR')} Ar</small>` : ''}
                <br><small>Consommation: ${consommationValue.toFixed(3)} kWh</small>
            </td>
            <td>
                <button class="btn-small" onclick="editClient('${client.id}')" title="Modifier">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-small btn-danger" onclick="deleteClient('${client.id}')" title="Supprimer">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="btn-small" onclick="viewClientDetails('${client.id}')" title="Voir détails">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}
// Fonctions de génération de token

function updateTarifDisplay() {
    // Afficher le tarif en cours
    const amount = parseFloat(document.getElementById('rechargeAmount').value) || 0;
    const kwh = parseFloat(document.getElementById('rechargeKwh').value) || 0;
    
    document.getElementById('tarifInfo').innerHTML = `
        <small>Tarif: 500 Ar/kWh | ${amount.toLocaleString()} Ar = ${kwh.toFixed(3)} kWh</small>
    `;
}

// Dans la fonction searchClientByMeter()
async function searchClientByMeter() {
    const meterNumber = document.getElementById('meterNumber').value.trim();
    if (!meterNumber) return;
    
    const client = await findClientByMeter(meterNumber);
    if (client) {
        document.getElementById('clientInfo').style.display = 'block';
        document.getElementById('foundClientName').textContent = 
            `${client.prenom} ${client.nom}`;
        document.getElementById('foundClientAddress').textContent = client.adresse;
    } else {
        document.getElementById('clientInfo').style.display = 'none';
        showNotification('Compteur non trouvé');
    }
}
// Ajouter une fonction pour gérer l'ajout de client
async function addNewClient(clientData) {
    try {
        const client = await saveClient(clientData);
        await loadClients(); // Recharger la liste
        return client;
    } catch (error) {
        console.error('Erreur ajout client:', error);
        showNotification('Erreur: ' + error.message);
        throw error;
    }
}

async function generateToken() {
    const meterNumber = document.getElementById('meterNumber').value;
    const amount = document.getElementById('rechargeAmount').value;
    const kwh = document.getElementById('rechargeKwh').value;
    
    if (!meterNumber || !amount || amount <= 0) {
        showNotification('Veuillez remplir tous les champs obligatoires avec un montant valide');
        return;
    }
    
    // Validation du montant minimum (au moins 500 Ar = 1 kWh)
    if (amount < 500) {
        showNotification('Le montant minimum est de 500 Ariary (1 kWh)');
        return;
    }
    
    try {
        // Vérifier si le client existe
        const client = await findClientByMeter(meterNumber);
        if (!client) {
            if (confirm('Compteur non trouvé. Voulez-vous créer un nouveau client avec ce numéro de compteur?')) {
                // Ouvrir modal création client pré-remplie
                showAddClientModalWithMeter(meterNumber);
                return;
            } else {
                return;
            }
        }
        
        // Générer un token sécurisé
        const token = generateSecureToken(meterNumber, amount);
        
        // Afficher le résultat
        document.getElementById('tokenResult').style.display = 'block';
        document.getElementById('generatedToken').textContent = formatToken(token);
        document.getElementById('tokenMeter').textContent = meterNumber;
        document.getElementById('tokenAmount').textContent = `${parseInt(amount).toLocaleString()} Ar`;
        document.getElementById('tokenKwh').textContent = `${parseFloat(kwh).toFixed(3)} kWh`;
        document.getElementById('tokenDate').textContent = new Date().toLocaleString('fr-FR');
        document.getElementById('tokenTarif').textContent = `500 Ar/kWh`;
        
        // Sauvegarder en local
        await saveTokenToLocal({
            token: token,
            meter: meterNumber,
            amount: parseInt(amount),
            kwh: parseFloat(kwh),
            date: new Date().toISOString(),
            status: 'unused',
            clientId: client.id,
            generatedBy: currentUser ? currentUser.name : 'system'
        });
        
        // Sauvegarder la transaction
        await saveTransaction({
            clientId: client.id,
            meter: meterNumber,
            token: token,
            amount: parseInt(amount),
            kwh: parseFloat(kwh),
            type: 'recharge',
            description: 'Recharge prépayée électricité'
        });
        
        // Ajouter à la synchronisation
        await saveToSyncQueue('token', {
            token: token,
            meter: meterNumber,
            amount: parseInt(amount),
            kwh: parseFloat(kwh),
            clientId: client.id,
            tarif: 500
        });
        
        // Mettre à jour le dashboard
        await loadDashboardData();
        
        // Journaliser
        await saveLogToLocal({
            action: 'generation_token',
            details: `Token généré: ${parseInt(amount).toLocaleString()} Ar (${parseFloat(kwh).toFixed(3)} kWh) pour ${meterNumber}`
        });
        
        console.log('Token généré et sauvegardé:', token);
        
        // Option d'envoi automatique si en ligne
        if (navigator.onLine && document.getElementById('sendNotification').checked) {
            setTimeout(() => {
                sendTokenToClient(token, meterNumber, amount, kwh, client);
            }, 1000);
        }
        
    } catch (error) {
        console.error('Erreur génération token:', error);
        showNotification('Erreur: ' + error.message);
    }
}
function showAddClientModalWithMeter(meterNumber) {
    showAddClientModal();
    
    // Pré-remplir le champ compteur après un court délai
    setTimeout(() => {
        const compteurField = document.getElementById('clientCompteur');
        if (compteurField) {
            compteurField.value = meterNumber;
        }
    }, 100);
}

function generateSecureToken(meterNumber, amount) {
    // Algorithme de génération de token sécurisé
    const timestamp = Date.now();
    const secret = 'SECRET_KEY'; // À remplacer par la clé réelle
    const data = `${meterNumber}-${amount}-${timestamp}-${secret}`;
    
    // Hash simple (à améliorer avec crypto)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash = hash & hash;
    }
    
    return Math.abs(hash).toString().padStart(16, '0');
    
}
function setupPresetButtons() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const amount = this.getAttribute('data-amount');
            document.getElementById('rechargeAmount').value = amount;
            calculateKwh();
        });
    });
}
function formatToken(token) {
    // Formater le token en groupes de 4
    return token.match(/.{1,4}/g).join('-');
}
function copyToClipboard(elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Token copié dans le presse-papier', 'success');
    }).catch(err => {
        console.error('Erreur copie:', err);
        showNotification('Erreur lors de la copie', 'error');
    });
}
function printToken() {
    const tokenContent = document.getElementById('tokenResult').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Token de Recharge</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .token { font-size: 24px; font-weight: bold; margin: 20px 0; }
                .details { margin: 20px 0; }
                .footer { margin-top: 50px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <h2>Token de Recharge Électricité</h2>
            <div class="token">${document.getElementById('generatedToken').textContent}</div>
            <div class="details">
                <p>Compteur: ${document.getElementById('tokenMeter').textContent}</p>
                <p>Montant: ${document.getElementById('tokenAmount').textContent}</p>
                <p>Énergie: ${document.getElementById('tokenKwh').textContent}</p>
                <p>Date: ${document.getElementById('tokenDate').textContent}</p>
            </div>
            <div class="footer">
                <p>Tarif: 500 Ariary/kWh</p>
                <p>Ce token est valable jusqu'à utilisation</p>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}
async function sendTokenManually() {
    if (!navigator.onLine) {
        showNotification('Pas de connexion Internet. Impossible d\'envoyer le token.', 'info');
        return;
    }
    
    // TODO: Implémenter l'envoi par SMS/email
    showNotification('Fonction d\'envoi à implémenter avec l\'API SMS/Email', 'info');
}
// Gestion hors ligne/en ligne
function updateOnlineStatus() {
    isOnline = navigator.onLine;
    const statusElement = document.getElementById('onlineStatus');
    
    if (isOnline) {
        statusElement.textContent = 'En ligne';
        statusElement.classList.add('online');
        statusElement.classList.remove('offline');
        
        // Synchroniser automatiquement si revenu en ligne
        if (pendingSync.length > 0) {
            synchronizeData();
        }
    } else {
        statusElement.textContent = 'Hors ligne';
        statusElement.classList.remove('online');
        statusElement.classList.add('offline');
    }
}

async function synchronizeData() {
    try {
        if (!navigator.onLine) {
            showNotification('Pas de connexion Internet disponible', 'error');
            return;
        }
        
        if (!window.firebaseService) {
            showNotification('Service Firebase non disponible', 'warning');
            return;
        }
        
        // Afficher un indicateur de chargement
        const syncBtn = document.getElementById('syncBtn');
        const originalText = syncBtn.innerHTML;
        syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Synchronisation...';
        syncBtn.disabled = true;
        
        // Récupérer la file d'attente
        const queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
        let syncedCount = 0;
        let errorCount = 0;
        let failedItems = [];
        
        console.log(`🔄 Début synchronisation: ${queue.length} éléments en file d'attente`);
        
        // Traiter chaque élément de la file d'attente
        for (const item of queue) {
            try {
                let result;
                
                switch (item.type) {
                    case 'client':
                        result = await window.firebaseService.saveClientToFirebase(item.data);
                        break;
                        
                    case 'token':
                        result = await window.firebaseService.saveTokenToFirebase(item.data);
                        break;
                        
                    case 'delete_client':
                        result = await window.firebaseService.deleteClientFromFirebase(item.data.clientId);
                        break;
                        
                    case 'log':
                        result = await window.firebaseService.logAction(item.data.action, item.data.details);
                        break;
                        
                    default:
                        console.warn('Type de synchronisation non géré:', item.type);
                        continue;
                }
                
                if (result && result.success !== false) {
                    syncedCount++;
                    console.log(`✅ Synchronisé: ${item.type}`);
                } else {
                    errorCount++;
                    item.attempts = (item.attempts || 0) + 1;
                    
                    // Garder les échecs pour réessayer plus tard (max 3 tentatives)
                    if (item.attempts < 3) {
                        failedItems.push(item);
                    } else {
                        console.warn(`❌ Abandon après 3 tentatives: ${item.type}`);
                    }
                    
                    console.warn(`❌ Échec synchronisation ${item.type}:`, result?.error);
                }
                
            } catch (itemError) {
                errorCount++;
                console.error(`❌ Erreur synchronisation ${item.type}:`, itemError);
                failedItems.push(item);
            }
        }
        
        // Mettre à jour la file d'attente avec les échecs
        localStorage.setItem('syncQueue', JSON.stringify(failedItems));
        
        // Mettre à jour l'interface
        document.getElementById('lastSync').textContent = new Date().toLocaleTimeString();
        
        if (syncedCount > 0) {
            showNotification(`Synchronisation réussie: ${syncedCount} éléments`, 'success');
        }
        
        if (errorCount > 0) {
            showNotification(`${errorCount} éléments en erreur`, 'warning');
        }
        
        if (syncedCount === 0 && errorCount === 0) {
            showNotification('Aucun élément à synchroniser', 'info');
        }
        
        // Mettre à jour les données affichées
        await loadDashboardData();
        await loadClients();
        await loadAllMeters();
        
    } catch (error) {
        console.error('Erreur synchronisation:', error);
        showNotification('Erreur lors de la synchronisation: ' + error.message, 'error');
    } finally {
        // Réactiver le bouton
        const syncBtn = document.getElementById('syncBtn');
        if (syncBtn) {
            syncBtn.innerHTML = originalText;
            syncBtn.disabled = false;
        }
    }
}

// Fonctions utilitaires
function formatDate(dateString) {
    if (!dateString) return 'Jamais';
    
    try {
        const date = new Date(dateString);
        
        // Vérifier si la date est valide
        if (isNaN(date.getTime())) {
            return 'Date invalide';
        }
        
        return date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.error('Erreur formatage date:', error, dateString);
        return 'Date invalide';
    }
}

// Gestion authentification (simplifiée)
function checkAuth() {
    const user = localStorage.getItem('currentUser');
    if (user) {
        currentUser = JSON.parse(user);
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('loginModal').style.display = 'none';
    } else {
        document.getElementById('loginModal').style.display = 'flex';
    }
}

// ==================== GESTION DES LOGS ET SYNCHRO ====================

// Fonction pour journaliser les actions
async function logAction(action, details) {
    try {
        const logEntry = {
            user: currentUser ? currentUser.name : 'inconnu',
            action: action,
            details: details,
            timestamp: new Date().toISOString(),
            online: isOnline,
            userAgent: navigator.userAgent
        };
        
        // 1. Sauvegarder localement
        await saveLogToLocal(logEntry);
        
        // 2. Synchroniser avec Firebase si disponible et en ligne
        if (window.firebaseService && isOnline) {
            try {
                // Vérifier si l'utilisateur est authentifié
                if (window.firebaseService.currentUserId && window.firebaseService.currentUserId()) {
                    await window.firebaseService.logAction(action, details);
                    console.log('Log envoyé à Firebase:', action);
                } else {
                    // Utilisateur non authentifié, mettre en file d'attente
                    await saveToSyncQueue('log', logEntry);
                }
            } catch (firebaseError) {
                console.warn('Erreur Firebase log, mise en file d\'attente:', firebaseError);
                await saveToSyncQueue('log', logEntry);
            }
        } else {
            // Hors ligne, mettre en file d'attente
            await saveToSyncQueue('log', logEntry);
        }
        
        return logEntry;
    } catch (error) {
        console.error('Erreur dans logAction:', error);
        return null;
    }
}

// Fonction de compatibilité (si d'autres parties du code l'utilisent)
function addToPendingSync(type, data) {
    console.warn('addToPendingSync est dépréciée, utilisez saveToSyncQueue');
    return saveToSyncQueue(type, data);
}

// ==================== AUTHENTIFICATION ====================

async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('userRole').value;
    
    if (!username || !password) {
        showNotification('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    try {
        // Essayer d'abord l'authentification Firebase
        if (window.firebaseService) {
            // Pour Firebase, on utilise l'email comme username
            const email = username.includes('@') ? username : `${username}@compteur-nlf.com`;
            
            const result = await window.firebaseService.loginUser(email, password);
            
            if (result.success) {
                currentUser = {
                    name: result.user.displayName || username,
                    role: result.user.role || role,
                    email: email,
                    firebaseUid: result.user.uid
                };
                
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                document.getElementById('userName').textContent = currentUser.name;
                document.getElementById('loginModal').style.display = 'none';
                
                // Journaliser avec Firebase
                await window.firebaseService.logAction('connexion', `Utilisateur ${username} connecté via Firebase`);
                
                showNotification('Connexion réussie!', 'success');
                
                // Recharger les données avec synchronisation
                setTimeout(async () => {
                    await loadDashboardData();
                    await loadClients();
                    await loadAllMeters();
                }, 500);
                
                return;
            }
        }
        
        // Fallback: authentification locale (pour développement/hors ligne)
        currentUser = {
            name: username,
            role: role
        };
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('loginModal').style.display = 'none';
        
        // Journaliser localement
        await logAction('connexion', `Utilisateur ${username} connecté (mode local)`);
        
        showNotification('Mode local activé', 'info');
        
    } catch (error) {
        console.error('Erreur connexion:', error);
        showNotification('Échec de la connexion: ' + error.message, 'error');
    }
}

async function handleLogout() {
    try {
        // Déconnexion Firebase si disponible
        if (window.firebaseService && currentUser?.firebaseUid) {
            await window.firebaseService.logoutUser();
        }
        
        // Journaliser la déconnexion
        await logAction('deconnexion', `Utilisateur ${currentUser?.name || 'inconnu'} déconnecté`);
        
    } catch (error) {
        console.error('Erreur déconnexion Firebase:', error);
    } finally {
        // Nettoyer localement
        localStorage.removeItem('currentUser');
        currentUser = null;
        document.getElementById('loginModal').style.display = 'flex';
        document.getElementById('userName').textContent = 'Non connecté';
        
        showNotification('Déconnecté avec succès', 'success');
    }
}
// Fonctions pour la modal d'ajout de client
function showAddClientModal() {
    // Créer le contenu de la modal
    const modalContent = `
        <div class="modal" id="addClientModal" style="display: flex;">
            <div class="modal-content">
                <h2><i class="fas fa-user-plus"></i> Ajouter un Client</h2>
                <form id="clientForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="clientNom">Nom *</label>
                            <input type="text" id="clientNom" required>
                        </div>
                        <div class="form-group">
                            <label for="clientPrenom">Prénom *</label>
                            <input type="text" id="clientPrenom" required>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="clientAdresse">Adresse *</label>
                        <input type="text" id="clientAdresse" required>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="clientCompteur">Numéro Compteur *</label>
                            <input type="text" id="clientCompteur" required>
                        </div>
                        <div class="form-group">
                            <label for="clientType">Type Contrat</label>
                            <select id="clientType">
                                <option value="standard">Standard</option>
                                <option value="premium">Premium</option>
                                <option value="entreprise">Entreprise</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="clientEmail">Email</label>
                            <input type="email" id="clientEmail">
                        </div>
                        <div class="form-group">
                            <label for="clientPhone">Téléphone</label>
                            <input type="tel" id="clientPhone">
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="closeModal('addClientModal')">
                            Annuler
                        </button>
                        <button type="submit" class="btn-primary">
                            <i class="fas fa-save"></i> Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Ajouter la modal au DOM
    document.body.insertAdjacentHTML('beforeend', modalContent);
    
    // Ajouter l'événement submit
    document.getElementById('clientForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        await handleAddClient();
    });
}

async function handleAddClient() {
    try {
        const clientData = {
            nom: document.getElementById('clientNom').value,
            prenom: document.getElementById('clientPrenom').value,
            adresse: document.getElementById('clientAdresse').value,
            numeroCompteur: document.getElementById('clientCompteur').value,
            typeContrat: document.getElementById('clientType').value,
            email: document.getElementById('clientEmail').value,
            telephone: document.getElementById('clientPhone').value,
            solde: 0,
            consommationTotale: 0
        };
        
        const client = await addNewClient(clientData);
        
        // Fermer la modal
        closeModal('addClientModal');
        
        // Mettre à jour le dashboard
        await loadDashboardData(); // ← AJOUTER CETTE LIGNE
        
        // Afficher message de succès
        showNotification(`Client ${client.prenom} ${client.nom} ajouté avec succès!`, 'success');
        
    } catch (error) {
        console.error('Erreur ajout client:', error);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
    }
}

async function searchClients(searchTerm) {
    try {
        // Utiliser la fonction de recherche
        const results = searchClients(searchTerm);
        displayClients(results);
    } catch (error) {
        console.error('Erreur recherche:', error);
    }
}

// Fonction d'export des données
async function exportData() {
    try {
        // Récupérer toutes les données
        const clients = await getClientsFromDB();
        const tokens = await getTokensFromDB();
        const transactions = getTransactionsFromLS();
        const logs = getLogsFromLS();
        
        const exportData = {
            exportedAt: new Date().toISOString(),
            clients: clients,
            tokens: tokens,
            transactions: transactions,
            logs: logs
        };
        
        // Créer un blob JSON
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        // Créer un lien de téléchargement
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export_compteurs_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Données exportées avec succès!', 'success');
        
    } catch (error) {
        console.error('Erreur export:', error);
        showNotification('Erreur lors de l\'export', 'alert');
    }
}
async function editClient(clientId) {
    try {
        const client = await findClientById(clientId);
        if (!client) {
            showNotification('Client non trouvé', 'info');
            return;
        }
        
        // Créer le formulaire de modification
        showEditClientModal(client);
        
        // Option: charger aussi depuis Firebase si en ligne
        if (window.firebaseService && navigator.onLine && client.firebaseId) {
            try {
                // Récupérer les données fraîches de Firebase
                const clientsResult = await window.firebaseService.getClientsFromFirebase();
                if (clientsResult.success) {
                    const firebaseClient = clientsResult.clients.find(c => 
                        c.id === client.firebaseId || c.localId === clientId
                    );
                    
                    if (firebaseClient) {
                        // Mettre à jour l'affichage avec données Firebase
                        console.log('Données Firebase chargées pour édition:', firebaseClient);
                    }
                }
            } catch (error) {
                console.warn('Impossible de charger depuis Firebase:', error);
            }
        }
        
    } catch (error) {
        console.error('Erreur édition client:', error);
        showNotification('Erreur lors de la récupération du client', 'alert');
    }
}
function showEditClientModal(client) {
    // Créer le contenu de la modal
    const modalContent = `
        <div class="modal" id="editClientModal" style="display: flex;">
            <div class="modal-content">
                <h2><i class="fas fa-edit"></i> Modifier le Client</h2>
                <form id="editClientForm">
                    <input type="hidden" id="editClientId" value="${client.id}">
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editClientNom">Nom *</label>
                            <input type="text" id="editClientNom" value="${client.nom || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="editClientPrenom">Prénom *</label>
                            <input type="text" id="editClientPrenom" value="${client.prenom || ''}" required>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="editClientAdresse">Adresse *</label>
                        <input type="text" id="editClientAdresse" value="${client.adresse || ''}" required>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editClientCompteur">Numéro Compteur *</label>
                            <input type="text" id="editClientCompteur" value="${client.numeroCompteur || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="editClientType">Type Contrat</label>
                            <select id="editClientType">
                                <option value="standard" ${client.typeContrat === 'standard' ? 'selected' : ''}>Standard</option>
                                <option value="premium" ${client.typeContrat === 'premium' ? 'selected' : ''}>Premium</option>
                                <option value="entreprise" ${client.typeContrat === 'entreprise' ? 'selected' : ''}>Entreprise</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editClientEmail">Email</label>
                            <input type="email" id="editClientEmail" value="${client.email || ''}">
                        </div>
                        <div class="form-group">
                            <label for="editClientPhone">Téléphone</label>
                            <input type="tel" id="editClientPhone" value="${client.telephone || ''}">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editClientSolde">Solde actuel (Ar)</label>
                            <input type="number" id="editClientSolde" value="${client.solde || 0}" step="0.01" min="0">
                        </div>
                        <div class="form-group">
                            <label for="editClientConsommation">Consommation totale (kWh)</label>
                            <input type="number" id="editClientConsommation" value="${client.consommationTotale || 0}" step="0.01" min="0">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="editClientStatut">Statut</label>
                        <select id="editClientStatut">
                            <option value="actif" ${client.statut === 'actif' ? 'selected' : ''}>Actif</option>
                            <option value="inactif" ${client.statut === 'inactif' ? 'selected' : ''}>Inactif</option>
                            <option value="suspendu" ${client.statut === 'suspendu' ? 'selected' : ''}>Suspendu</option>
                        </select>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="closeModal('editClientModal')">
                            Annuler
                        </button>
                        <button type="submit" class="btn-primary">
                            <i class="fas fa-save"></i> Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Ajouter la modal au DOM
    document.body.insertAdjacentHTML('beforeend', modalContent);
    
    // Ajouter l'événement submit
    document.getElementById('editClientForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        await handleUpdateClient(client.id);
    });
}
async function handleUpdateClient(clientId) {
    try {
        const clientData = {
            id: clientId,
            nom: document.getElementById('editClientNom').value,
            prenom: document.getElementById('editClientPrenom').value,
            adresse: document.getElementById('editClientAdresse').value,
            numeroCompteur: document.getElementById('editClientCompteur').value,
            typeContrat: document.getElementById('editClientType').value,
            email: document.getElementById('editClientEmail').value,
            telephone: document.getElementById('editClientPhone').value,
            solde: parseFloat(document.getElementById('editClientSolde').value) || 0,
            consommationTotale: parseFloat(document.getElementById('editClientConsommation').value) || 0,
            statut: document.getElementById('editClientStatut').value,
            updatedAt: new Date().toISOString() // Important pour la synchro
        };
        
        // Vérifier si le numéro de compteur a changé
        const originalClient = await findClientById(clientId);
        if (originalClient.numeroCompteur !== clientData.numeroCompteur) {
            // Vérifier si le nouveau numéro existe déjà
            const existingClient = await findClientByMeter(clientData.numeroCompteur);
            if (existingClient && existingClient.id !== clientId) {
                showNotification('Ce numéro de compteur est déjà utilisé par un autre client', 'alert');
                return;
            }
        }
        
        // Sauvegarder (cette fonction gère déjà la synchro Firebase)
        const updatedClient = await saveClient(clientData);
        
        // Fermer la modal
        closeModal('editClientModal');
        
        // Recharger la liste des clients
        await loadClients();
        
        // Journaliser l'action
        await saveLogToLocal({
            action: 'modification_client',
            details: `Client modifié: ${updatedClient.prenom} ${updatedClient.nom}`
        });
        
        // Journaliser Firebase si disponible
        if (window.firebaseService) {
            await window.firebaseService.logAction(
                'modification_client',
                `Client modifié: ${updatedClient.prenom} ${updatedClient.nom} (${updatedClient.numeroCompteur})`
            );
        }
        
        showNotification('Client mis à jour avec succès!', 'success');
        
    } catch (error) {
        console.error('Erreur mise à jour client:', error);
        showNotification('Erreur: ' + error.message, 'alert');
    }
}
async function deleteClient(clientId) {
    try {
        // Demander confirmation
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce client ? Cette action est irréversible.')) {
            return;
        }
        
        // Récupérer le client pour affichage et avoir son ID Firebase
        const client = await findClientById(clientId);
        if (!client) {
            showNotification('Client non trouvé', 'info');
            return;
        }
        
        // Vérifier s'il y a des tokens actifs
        const tokens = await getTokensFromDB();
        const clientTokens = tokens.filter(t => t.clientId === clientId && t.status === 'unused');
        
        if (clientTokens.length > 0) {
            showNotification(`Impossible de supprimer ce client. Il a ${clientTokens.length} token(s) non utilisé(s).`, 'info');
            return;
        }
        
        // 1. Supprimer le client localement d'abord
        const localResult = await deleteClientFromDB(clientId);
        
        if (localResult) {
            // 2. Si en ligne et Firebase disponible, supprimer aussi sur Firebase
            let firebaseResult = null;
            if (navigator.onLine && window.firebaseService && client.firebaseId) {
                try {
                    firebaseResult = await window.firebaseService.deleteClientFromFirebase(client.firebaseId);
                    
                    if (!firebaseResult.success) {
                        console.warn('⚠️ Client supprimé localement mais erreur Firebase:', firebaseResult.error);
                        // Marquer pour resynchronisation
                        await saveToSyncQueue('delete_client', {
                            clientId: client.firebaseId,
                            type: 'client'
                        });
                    }
                } catch (firebaseError) {
                    console.error('Erreur suppression Firebase:', firebaseError);
                    // Mettre en file d'attente pour suppression ultérieure
                    await saveToSyncQueue('delete_client', {
                        clientId: client.firebaseId,
                        type: 'client'
                    });
                }
            } else if (client.firebaseId) {
                // Hors ligne, mettre en file d'attente
                await saveToSyncQueue('delete_client', {
                    clientId: client.firebaseId,
                    type: 'client'
                });
            }
            
            // Recharger la liste des clients
            await loadClients();
            
            // Mettre à jour le dashboard
            await loadDashboardData();
            
            // Journaliser l'action
            await saveLogToLocal({
                action: 'suppression_client',
                details: `Client supprimé: ${client.prenom} ${client.nom} (${client.numeroCompteur})`,
                firebaseId: client.firebaseId || null,
                firebaseSuccess: firebaseResult ? firebaseResult.success : false
            });
            
            // Journaliser Firebase si disponible et suppression réussie
            if (window.firebaseService && navigator.onLine && firebaseResult && firebaseResult.success) {
                await window.firebaseService.logAction(
                    'suppression_client',
                    `Client supprimé: ${client.prenom} ${client.nom} (${client.numeroCompteur})`
                );
            }
            
            showNotification(`Client ${client.prenom} ${client.nom} supprimé avec succès`, 'success');
            
        } else {
            showNotification('Erreur lors de la suppression locale', 'info');
        }
        
    } catch (error) {
        console.error('Erreur suppression client:', error);
        showNotification('Erreur lors de la suppression du client: ' + error.message, 'info');
    }
}

async function deleteClientFromDB(clientId) {
    try {
        const clients = getClientsFromLS();
        const clientToDelete = clients.find(client => client.id === clientId);
        
        if (!clientToDelete) {
            console.error('Client non trouvé en local:', clientId);
            return false;
        }
        
        // Sauvegarder les infos pour la file d'attente si nécessaire
        const deletionRecord = {
            type: 'delete_client',
            clientId: clientToDelete.firebaseId || clientToDelete.id,
            clientData: {
                nom: clientToDelete.nom,
                prenom: clientToDelete.prenom,
                numeroCompteur: clientToDelete.numeroCompteur
            },
            timestamp: new Date().toISOString(),
            pending: true
        };
        
        // Sauvegarder dans file d'attente si Firebase ID existe
        if (clientToDelete.firebaseId) {
            await saveToSyncQueue('delete', deletionRecord);
        }
        
        // Supprimer localement
        const filteredClients = clients.filter(client => client.id !== clientId);
        localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(filteredClients));
        
        // Supprimer aussi les tokens associés
        const tokens = getTokensFromLS();
        const filteredTokens = tokens.filter(token => token.clientId !== clientId);
        localStorage.setItem(LS_KEYS.TOKENS, JSON.stringify(filteredTokens));
        
        console.log('✅ Client supprimé localement:', clientId);
        return true;
        
    } catch (error) {
        console.error('Erreur suppression client DB:', error);
        throw error;
    }
}
async function viewClientDetails(clientId) {
    try {
        const client = await findClientById(clientId);
        if (!client) {
            showNotification('Client non trouvé', 'info');
            return;
        }
        
        const transactions = await getClientTransactions(clientId);
        const tokens = await getTokensFromDB();
        const clientTokens = tokens.filter(t => t.clientId === clientId);
        
        // Créer la modal de détails
        showClientDetailsModal(client, transactions, clientTokens);
    } catch (error) {
        console.error('Erreur détails client:', error);
        showNotification('Erreur lors du chargement des détails', 'info');
    }
}

function showClientDetailsModal(client, transactions, tokens) {
    // Formater les transactions
    let transactionsHtml = '';
    if (transactions.length === 0) {
        transactionsHtml = '<p>Aucune transaction</p>';
    } else {
        transactionsHtml = transactions.slice(0, 5).map(trans => `
            <div class="transaction-item">
                <strong>${formatDate(trans.date)}</strong>
                <div>${trans.type}: ${trans.amount} Ar (${trans.kwh} kWh)</div>
                <small>${trans.description || ''}</small>
            </div>
        `).join('');
        
        if (transactions.length > 5) {
            transactionsHtml += `<p>... et ${transactions.length - 5} autres transactions</p>`;
        }
    }
    
    // Formater les tokens
    let tokensHtml = '';
    if (tokens.length === 0) {
        tokensHtml = '<p>Aucun token généré</p>';
    } else {
        const unusedTokens = tokens.filter(t => t.status === 'unused');
        const usedTokens = tokens.filter(t => t.status === 'used');
        
        tokensHtml = `
            <p>Total tokens: ${tokens.length}</p>
            <p>Tokens non utilisés: <span class="status unused">${unusedTokens.length}</span></p>
            <p>Tokens utilisés: <span class="status used">${usedTokens.length}</span></p>
        `;
    }
    
    const modalContent = `
        <div class="modal" id="clientDetailsModal" style="display: flex;">
            <div class="modal-content">
                <h2><i class="fas fa-user-circle"></i> Détails du Client</h2>
                
                <div class="client-info-card">
                    <h3>${client.prenom} ${client.nom}</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <strong>Compteur:</strong> ${client.numeroCompteur}
                        </div>
                        <div class="info-item">
                            <strong>Type Contrat:</strong> <span class="contract-type">${client.typeContrat}</span>
                        </div>
                        <div class="info-item">
                            <strong>Adresse:</strong> ${client.adresse}
                        </div>
                        <div class="info-item">
                            <strong>Statut:</strong> <span class="status ${client.statut}">${client.statut}</span>
                        </div>
                        <div class="info-item">
                            <strong>Solde actuel:</strong> ${parseFloat(client.solde || 0).toFixed(2)} Ar
                        </div>
                        <div class="info-item">
                            <strong>Consommation totale:</strong> ${parseFloat(client.consommationTotale || 0).toFixed(2)} kWh
                        </div>
                        ${client.email ? `<div class="info-item"><strong>Email:</strong> ${client.email}</div>` : ''}
                        ${client.telephone ? `<div class="info-item"><strong>Téléphone:</strong> ${client.telephone}</div>` : ''}
                    </div>
                </div>
                
                <div class="details-section">
                    <h3><i class="fas fa-history"></i> Dernières Transactions</h3>
                    <div class="transactions-list">
                        ${transactionsHtml}
                    </div>
                </div>
                
                <div class="details-section">
                    <h3><i class="fas fa-key"></i> Tokens</h3>
                    <div class="tokens-summary">
                        ${tokensHtml}
                    </div>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="closeModal('clientDetailsModal')">
                        Fermer
                    </button>
                    <button type="button" class="btn-primary" onclick="generateTokenForClient('${client.id}')">
                        <i class="fas fa-key"></i> Générer un Token
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Ajouter la modal au DOM
    document.body.insertAdjacentHTML('beforeend', modalContent);
}
function generateTokenForClient(clientId) {
    // Fermer la modal des détails
    closeModal('clientDetailsModal');
    
    // Aller à la page de génération de token
    switchPage('tokens');
    
    // Remplir automatiquement le numéro de compteur
    findClientById(clientId).then(client => {
        if (client && client.numeroCompteur) {
            document.getElementById('meterNumber').value = client.numeroCompteur;
            // Déclencher la recherche automatique
            searchClientByMeter();
        }
    });
}
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Animation
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

console.log('App.js chargé');
console.log('LocalStorage disponible:', typeof localStorage !== 'undefined');
console.log('Données initiales:', {
    clients: localStorage.getItem('gestion_compteurs_clients'),
    tokens: localStorage.getItem('gestion_compteurs_tokens')
});
function initAutocomplete() {
    const meterInput = document.getElementById('meterNumber');
    
    if (!meterInput) return;
    
    // Charger les compteurs au démarrage
    loadAllMeters();
    
    // Écouter les frappes clavier
    meterInput.addEventListener('input', handleMeterInput);
    meterInput.addEventListener('keydown', handleMeterKeydown);
    meterInput.addEventListener('focus', handleMeterFocus);
    meterInput.addEventListener('blur', () => {
        setTimeout(() => hideSuggestions(), 200);
    });
    
    // Bouton de rafraîchissement
    const refreshBtn = document.getElementById('refreshMeters');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAllMeters);
    }
    
    // Remplir le datalist
    updateMeterDatalist();
}

// Charger tous les numéros de compteur
// Modifier la fonction loadAllMeters pour ajouter une animation
async function loadAllMeters() {
    const refreshBtn = document.getElementById('refreshMeters');
    
    // Animation
    if (refreshBtn) {
        refreshBtn.classList.add('spinning');
        refreshBtn.disabled = true;
    }
    
    try {
        const clients = await getClientsFromDB();
        allMeters = clients.map(client => ({
            meter: client.numeroCompteur,
            clientName: `${client.prenom} ${client.nom}`,
            clientId: client.id,
            solde: parseFloat(client.solde) || 0,
            typeContrat: client.typeContrat,
            adresse: client.adresse,
            consommationTotale: parseFloat(client.consommationTotale) || 0,
            dernierRecharge: client.dernierRecharge
        })).filter(item => item.meter && item.meter.trim() !== '');
        
        console.log(`${allMeters.length} compteurs chargés`);
        
        // Mettre à jour le datalist
        updateMeterDatalist();
        
        // Afficher notification
        showNotification(`${allMeters.length} compteurs disponibles`, 'success');
        
    } catch (error) {
        console.error('Erreur chargement compteurs:', error);
        allMeters = [];
        showNotification('Erreur chargement compteurs', 'error');
    } finally {
        // Arrêter l'animation
        if (refreshBtn) {
            refreshBtn.classList.remove('spinning');
            refreshBtn.disabled = false;
        }
    }
}
// Mettre à jour le datalist HTML
function updateMeterDatalist() {
    const datalist = document.getElementById('meterList');
    if (!datalist) return;
    
    datalist.innerHTML = '';
    allMeters.forEach(item => {
        const option = document.createElement('option');
        option.value = item.meter;
        option.textContent = `${item.meter} - ${item.clientName}`;
        datalist.appendChild(option);
    });
}

// Gérer la saisie dans le champ compteur
function handleMeterInput(e) {
    const searchTerm = e.target.value.trim();
    
    if (searchTerm.length === 0) {
        hideSuggestions();
        clearMeterInfo();
        return;
    }
    
    // Filtrer les suggestions
    currentMeterSuggestions = allMeters.filter(item =>
        item.meter.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Afficher les suggestions
    showSuggestions(searchTerm);
    
    // Vérifier si le compteur existe exactement
    const exactMatch = allMeters.find(item => 
        item.meter.toLowerCase() === searchTerm.toLowerCase()
    );
    
    if (exactMatch) {
        displayMeterInfo(exactMatch);
        document.getElementById('clientInfo').style.display = 'block';
        document.getElementById('foundClientName').textContent = exactMatch.clientName;
        document.getElementById('foundClientAddress').textContent = exactMatch.adresse;
        document.getElementById('foundClientSolde').textContent = `Solde: ${exactMatch.solde.toLocaleString('fr-FR')} Ar`;
    } else {
        clearMeterInfo();
        document.getElementById('clientInfo').style.display = 'none';
    }
}
// Gérer les touches clavier
function handleMeterKeydown(e) {
    const suggestions = document.querySelectorAll('.suggestion-item');
    let activeIndex = Array.from(suggestions).findIndex(item => 
        item.classList.contains('active')
    );
    
    switch(e.key) {
        case 'ArrowDown':
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
            updateActiveSuggestion(activeIndex);
            break;
            
        case 'ArrowUp':
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            updateActiveSuggestion(activeIndex);
            break;
            
        case 'Enter':
            e.preventDefault();
            const activeSuggestion = document.querySelector('.suggestion-item.active');
            if (activeSuggestion) {
                selectMeterFromSuggestion(activeSuggestion);
            }
            break;
            
        case 'Escape':
            hideSuggestions();
            break;
    }
}

// Gérer le focus
function handleMeterFocus() {
    const value = document.getElementById('meterNumber').value.trim();
    if (value.length > 0) {
        handleMeterInput({ target: document.getElementById('meterNumber') });
    }
}

// Afficher les suggestions
function showSuggestions(searchTerm) {
    hideSuggestions();
    
    if (currentMeterSuggestions.length === 0) {
        return;
    }
    
    const container = document.createElement('div');
    container.className = 'autocomplete-suggestions show';
    container.id = 'autocompleteSuggestions';
    
    currentMeterSuggestions.forEach((item, index) => {
        const suggestion = document.createElement('div');
        suggestion.className = 'suggestion-item';
        suggestion.dataset.index = index;
        suggestion.dataset.meter = item.meter;
        suggestion.dataset.clientId = item.clientId;
        
        suggestion.innerHTML = `
            <div>
                <span class="suggestion-meter">${highlightMatch(item.meter, searchTerm)}</span>
                <br>
                <small class="suggestion-client">${highlightMatch(item.clientName, searchTerm)}</small>
            </div>
            <div class="suggestion-solde">${item.solde.toLocaleString('fr-FR')} Ar</div>
        `;
        
        suggestion.addEventListener('click', () => selectMeterFromSuggestion(suggestion));
        suggestion.addEventListener('mouseenter', () => updateActiveSuggestion(index));
        
        container.appendChild(suggestion);
    });
    
    // Ajouter un footer avec statistiques
    const footer = document.createElement('div');
    footer.className = 'suggestion-footer';
    footer.style.padding = '8px 15px';
    footer.style.fontSize = '0.8rem';
    footer.style.color = '#666';
    footer.style.borderTop = '1px solid #eee';
    footer.style.backgroundColor = '#f9f9f9';
    footer.textContent = `${currentMeterSuggestions.length} résultat(s)`;
    container.appendChild(footer);
    
    document.querySelector('.autocomplete-container').appendChild(container);
    
    // Activer la première suggestion
    if (currentMeterSuggestions.length > 0) {
        updateActiveSuggestion(0);
    }
}

// Mettre en surbrillance les correspondances
function highlightMatch(text, searchTerm) {
    if (!searchTerm) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

// Mettre à jour la suggestion active
function updateActiveSuggestion(index) {
    const suggestions = document.querySelectorAll('.suggestion-item');
    suggestions.forEach(item => item.classList.remove('active'));
    
    if (suggestions[index]) {
        suggestions[index].classList.add('active');
        suggestions[index].scrollIntoView({ block: 'nearest' });
    }
}

// Sélectionner un compteur depuis les suggestions
function selectMeterFromSuggestion(suggestionElement) {
    const meter = suggestionElement.dataset.meter;
    const clientId = suggestionElement.dataset.clientId;
    
    document.getElementById('meterNumber').value = meter;
    hideSuggestions();
    
    // Charger les informations du client
    loadClientInfo(clientId, meter);
}
async function loadClientInfo(clientId, meter) {
    try {
        const client = await findClientById(clientId);
        if (client) {
            document.getElementById('clientInfo').style.display = 'block';
            document.getElementById('foundClientName').textContent = 
                `${client.prenom} ${client.nom}`;
            document.getElementById('foundClientAddress').textContent = client.adresse;
            document.getElementById('foundClientSolde').textContent = 
                `Solde: ${parseFloat(client.solde || 0).toLocaleString('fr-FR')} Ar`;
            document.getElementById('foundClientConsommation').textContent = 
                `Consommation totale: ${parseFloat(client.consommationTotale || 0).toFixed(3)} kWh`;
            
            displayMeterInfo({
                meter: meter,
                clientName: `${client.prenom} ${client.nom}`,
                clientId: client.id,
                solde: parseFloat(client.solde) || 0,
                typeContrat: client.typeContrat,
                adresse: client.adresse,
                consommationTotale: parseFloat(client.consommationTotale) || 0,
                dernierRecharge: client.dernierRecharge,
                email: client.email,
                telephone: client.telephone
            });
        }
    } catch (error) {
        console.error('Erreur chargement infos client:', error);
    }
}

// Afficher les informations du compteur
function displayMeterInfo(meterInfo) {
    const statsDiv = document.getElementById('meterStats');
    if (statsDiv) {
        statsDiv.innerHTML = `
            <div class="meter-details">
                <span class="meter-info">
                    <i class="fas fa-user"></i> ${meterInfo.clientName}
                </span>
                <span class="meter-info">
                    <i class="fas fa-home"></i> ${meterInfo.adresse}
                </span>
                <span class="meter-info">
                    <i class="fas fa-file-contract"></i> ${meterInfo.typeContrat}
                </span>
                <span class="meter-info">
                    <i class="fas fa-coins"></i> ${meterInfo.solde.toLocaleString('fr-FR')} Ar
                </span>
            </div>
        `;
    }
}

// Effacer les informations du compteur
function clearMeterInfo() {
    const statsDiv = document.getElementById('meterStats');
    if (statsDiv) {
        statsDiv.innerHTML = '';
    }
}

// Cacher les suggestions
function hideSuggestions() {
    const suggestions = document.getElementById('autocompleteSuggestions');
    if (suggestions) {
        suggestions.remove();
    }
}

function viewClientFromToken() {
    const meterNumber = document.getElementById('meterNumber').value.trim();
    if (!meterNumber) return;
    
    // Trouver le client par le numéro de compteur
    const meterInfo = allMeters.find(item => item.meter === meterNumber);
    if (meterInfo && meterInfo.clientId) {
        viewClientDetails(meterInfo.clientId);
    }
}
// Nouvelle fonction pour charger les données initiales

// Exporter les fonctions globalement
window.editClient = editClient;
window.deleteClient = deleteClient;
window.viewClientDetails = viewClientDetails;
window.showAddClientModal = showAddClientModal;
window.closeModal = closeModal;
window.switchPage = switchPage;
// Ajouter au setupEventListeners()
