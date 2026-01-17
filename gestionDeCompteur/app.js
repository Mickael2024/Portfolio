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

async function initApp() {
    try {
        console.log('Initialisation de l\'application...');
        
        // Initialiser LocalStorage
        await initDatabase();
        console.log('Base de données initialisée');
        
        // Charger les données
        await loadDashboardData();
        console.log('Dashboard chargé');
        
        await loadClients();
        console.log('Clients chargés');
          // Charger tous les compteurs
          await loadAllMeters();
          console.log('Compteurs chargés');
        // Initialiser l'interface
        updateOnlineStatus();
        
        console.log('Application initialisée avec succès');
        
    } catch (error) {
        console.error('Erreur initialisation:', error);
        
        // Afficher une erreur à l'utilisateur
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div style="text-align: center; padding: 50px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 4rem; color: #e74c3c; margin-bottom: 20px;"></i>
                    <h2>Erreur d'initialisation</h2>
                    <p>Impossible de démarrer l'application.</p>
                    <p><small>${error.message}</small></p>
                    <div style="margin-top: 30px;">
                        <button class="btn-primary" onclick="location.reload()">
                            <i class="fas fa-redo"></i> Réessayer
                        </button>
                    </div>
                </div>
            `;
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
      if (token.length < 10) {
        return token.padStart(10, '0');
    } else {
        return token.substring(0, 10);
    }
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
    if (!isOnline) {
        showNotification('Pas de connexion Internet disponible', 'info');
        return;
    }
    
    try {
        // TODO: Implémenter la synchronisation avec Firebase
        console.log('Synchronisation en cours...');
        
        // Simuler la synchronisation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        pendingSync = [];
        document.getElementById('lastSync').textContent = new Date().toLocaleTimeString();
        
        showNotification('Synchronisation terminée avec succès!', 'info');
        
    } catch (error) {
        console.error('Erreur synchronisation:', error);
        showNotification('Erreur lors de la synchronisation', 'alert');
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

function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('userRole').value;
    
    // TODO: Implémenter l'authentification réelle
    if (username && password) {
        currentUser = {
            name: username,
            role: role
        };
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('loginModal').style.display = 'none';
        
        // Journaliser l'action
        logAction('connexion', `Utilisateur ${username} connecté`);
    }
}

function handleLogout() {
    localStorage.removeItem('currentUser');
    currentUser = null;
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('userName').textContent = 'Non connecté';
}

function logAction(action, details) {
    const log = {
        user: currentUser ? currentUser.name : 'inconnu',
        action: action,
        details: details,
        timestamp: new Date().toISOString(),
        online: isOnline
    };
    
    // Sauvegarder localement
    saveLogToLocal(log);
    
    // Ajouter à la synchronisation
    addToPendingSync('log', log);
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
            statut: document.getElementById('editClientStatut').value
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
        
        // Récupérer le client pour affichage
        const client = await findClientById(clientId);
        if (!client) {
            showNotification('Client non trouvé', 'info');
            return;
        }
        
        // Vérifier s'il y a des transactions actives
        const tokens = await getTokensFromDB();
        const clientTokens = tokens.filter(t => t.clientId === clientId && t.status === 'unused');
        
        if (clientTokens.length > 0) {
            showNotification(`Impossible de supprimer ce client. Il a ${clientTokens.length} token(s) non utilisé(s).`, 'info');
            return;
        }
        
        // Supprimer le client
        const success = await deleteClientFromDB(clientId);
        
        if (success) {
            // Recharger la liste des clients
            await loadClients();
            
            // Mettre à jour le dashboard
            await loadDashboardData();
            
            // Journaliser l'action
            await saveLogToLocal({
                action: 'suppression_client',
                details: `Client supprimé: ${client.prenom} ${client.nom} (${client.numeroCompteur})`
            });
            
            showNotification(`Client ${client.prenom} ${client.nom} supprimé avec succès`, 'success');
        }
    } catch (error) {
        console.error('Erreur suppression client:', error);
        showNotification('Erreur lors de la suppression du client', 'info');
    }
}
async function deleteClientFromDB(clientId) {
    try {
        const clients = getClientsFromLS();
        const filteredClients = clients.filter(client => client.id !== clientId);
        localStorage.setItem(LS_KEYS.CLIENTS, JSON.stringify(filteredClients));
        
        // Supprimer aussi les tokens associés ?
         const tokens = getTokensFromLS();
         const filteredTokens = tokens.filter(token => token.clientId !== clientId);
         localStorage.setItem(LS_KEYS.TOKENS, JSON.stringify(filteredTokens));
        
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
// Exporter les fonctions globalement
window.editClient = editClient;
window.deleteClient = deleteClient;
window.viewClientDetails = viewClientDetails;
window.showAddClientModal = showAddClientModal;
window.closeModal = closeModal;
window.switchPage = switchPage;
// Ajouter au setupEventListeners()
