// Variables globales pour la maintenance
let mqttClient = null;
let mqttTopics = new Set();
let connectedMeters = new Map(); // Stocke les appareils connectés avec leur statut
let selectedMeterTopic = "";
let maintenanceLogs = [];
let detectedMeterTypes = new Map(); // Types de modules détectés


// Ajout: Map pour suivre les réponses des commandes
let pendingCommands = new Map();
let commandHistory = [];



// Initialisation MQTT
function initMQTTMaintenance() {
    console.log('🔄 Initialisation MQTT en cours...');
    
    // Vérifier si MQTT est disponible
    if (typeof mqtt === 'undefined') {
        console.error('❌ Bibliothèque MQTT non chargée!');
        addMaintenanceLog('Bibliothèque MQTT non chargée', 'error');
        return;
    }
    
    if (mqttClient && mqttClient.connected) {
        console.log('✅ MQTT déjà connecté');
        return;
    }
    
    // Se connecter au broker MQTT HiveMQ
    const options = {
        username: "smart_l1",
        password: "Fortico1234",
        clientId: "compteur_admin_" + Math.random().toString(16).substring(2, 8)
    };
    
    console.log('🌐 Connexion à MQTT avec clientId:', options.clientId);
    
    try {
        mqttClient = mqtt.connect("wss://e59af3ed375b42f6ad6c44f423c06a66.s1.eu.hivemq.cloud:8884/mqtt", options);
        
        // Gestionnaire d'événements MQTT
        mqttClient.on("connect", function() {
            console.log('✅ Connecté au broker MQTT !');
            addMaintenanceLog("Connecté au broker MQTT", "success");
            
            // S'abonner à TOUS les topics pour détection
            const topics = [
                "#",  // Tout
                "nlf/compteur/#",
                "nlf/meter/#",
                "compteur/#",
                "meter/#",
                "+/+/+",  // Tous les topics à 3 niveaux
                "nlf/+/+", // Tous les topics NLF
                "compteur/+/status",
                "compteur/+/data",
                "nlf/+/status"  // Nouveau: écouter les réponses sur status
            ];
            
            topics.forEach(topic => {
                mqttClient.subscribe(topic, { qos: 0 }, (err) => {
                    if (err) {
                        console.error(`❌ Erreur abonnement ${topic}:`, err);
                    } else {
                        console.log(`✅ Abonné à: ${topic}`);
                    }
                });
            });
            
            loadAvailableMeters();
            
            // Mettre à jour le statut de connexion
            updateConnectionStatus("success", "Connecté");
            
            // Activer le mode debug pour voir tous les messages
            setupMQTTDebug();
        });
        
        mqttClient.on("message", function(topic, message) {
            const messageStr = message.toString();
            
            // Traiter le message
            handleMqttMessage(topic, messageStr);
        });
        
        mqttClient.on("error", function(error) {
            console.error('❌ Erreur MQTT:', error);
            addMaintenanceLog(`Erreur MQTT: ${error.message}`, "error");
            updateConnectionStatus("error", "Erreur de connexion");
        });
        
        mqttClient.on("offline", function() {
            console.log('⚠️ Déconnecté du broker MQTT');
            addMaintenanceLog("Déconnecté du broker MQTT", "warning");
            updateConnectionStatus("warning", "Déconnecté");
        });
        
        mqttClient.on("end", function() {
            console.log('🔚 Connexion MQTT terminée');
            updateConnectionStatus("warning", "Déconnecté");
        });
        
    } catch (error) {
        console.error('❌ Exception lors de la connexion MQTT:', error);
        addMaintenanceLog(`Exception MQTT: ${error.message}`, "error");
    }
}

// NOUVELLE: Gestionnaire principal des messages MQTT
function handleMqttMessage(topic, messageStr) {
    console.log(`📩 [MQTT] ${topic}: ${messageStr.substring(0, 200)}`);
    
    // Détecter le type de module
    const meterType = detectMeterTypeFromTopic(topic);
    if (meterType && meterType !== 'inconnu') {
        detectedMeterTypes.set(topic, meterType);
        console.log(`🔍 Type détecté pour ${topic}: ${meterType}`);
    }
    
    // Ajouter le topic à la liste s'il n'existe pas
    if (!mqttTopics.has(topic)) {
        mqttTopics.add(topic);
        console.log(`➕ Nouveau topic ajouté: ${topic}`);
        updateMeterDropdown();
    }
    
    // Mettre à jour l'appareil comme étant en ligne
    updateConnectedMeter(topic, messageStr);
    
    // Journaliser les messages importants
    if (topic.includes('nlf') || topic.includes('compteur') || topic.includes('meter')) {
        addMaintenanceLog(`📩 ${topic}: ${messageStr.substring(0, 50)}`, "received");
    }
    
    // Traitement spécifique pour les messages JSON
    try {
        const data = JSON.parse(messageStr);
        console.log(`📊 Message JSON reçu:`, data);
        
        // Gestion des réponses aux commandes
        if (data.success !== undefined) {
            handleCommandResponse(topic, data);
        }
        
        // Gestion des données de compteur
        else if (data.type === 'meter_data' || data.type === 'compteur_prepaye' || data.hasOwnProperty('credit')) {
            handleMeterData(topic, data);
        }
        
        // Gestion des infos de configuration
        else if (data.type === 'config' || data.type === 'version_info' || data.type === 'wifi_info') {
            handleSystemInfo(topic, data);
        }
        
        // Gestion des réponses système
        else if (data.type === 'filesystem_info' || data.type === 'file_list' || data.type === 'help') {
            handleSystemResponse(topic, data);
        }
        
    } catch (e) {
        // Message non JSON, traiter comme texte
        handleTextMessage(topic, messageStr);
    }
    
    // Mettre à jour l'interface si c'est le topic sélectionné
    if (topic === selectedMeterTopic) {
        updateMeterInfo(topic, messageStr);
        document.getElementById("mqttReceivedStatus").innerHTML = 
            `<i class="fas fa-broadcast-tower"></i><span>Dernier message: ${messageStr.substring(0, 50)}${messageStr.length > 50 ? '...' : ''}</span>`;
    }
    
    // Mettre à jour la liste des modules
    updateConnectedMetersList();
    
    // Mettre à jour l'heure actuelle
    updateCurrentTime();
}

// NOUVELLE: Gérer les réponses aux commandes
function handleCommandResponse(topic, data) {
    const commandId = data.command || 'unknown';
    const success = data.success;
    const message = data.message || 'Pas de message';
    const timestamp = data.timestamp || Date.now();
    
    console.log(`📨 Réponse commande ${commandId}: ${success ? '✅' : '❌'} ${message}`);
    
    // Mettre à jour l'historique des commandes
    commandHistory.push({
        id: commandId,
        topic: topic,
        success: success,
        message: message,
        timestamp: new Date(timestamp).toLocaleTimeString(),
        response: data
    });
    
    // Limiter l'historique à 50 entrées
    if (commandHistory.length > 50) {
        commandHistory.shift();
    }
    
    // Afficher une notification
    if (success) {
        showAlert(`✅ ${message}`, "success");
        addMaintenanceLog(`✅ Réponse: ${message}`, "success");
    } else {
        showAlert(`❌ ${message}`, "error");
        addMaintenanceLog(`❌ Erreur: ${message}`, "error");
    }
    
    // Actions spéciales selon le type de réponse
    if (message.includes("Redémarrage") || message.includes("restart") || message.includes("reboot")) {
        addMaintenanceLog("🔄 Compteur en cours de redémarrage...", "warning");
        // Rafraîchir la liste après 5 secondes
        setTimeout(() => {
            if (selectedMeterTopic) {
                sendQuickCommand("get_status");
            }
        }, 5000);
    }
    
    else if (message.includes("OTA") || message.includes("mise à jour")) {
        addMaintenanceLog("🔄 Mise à jour OTA en cours...", "warning");
    }
    
    else if (message.includes("calibration") || message.includes("Calibration")) {
        addMaintenanceLog("⚙️ Calibration mise à jour", "info");
    }
    
    else if (message.includes("crédit") || message.includes("Credit")) {
        // Actualiser les données après ajout de crédit
        setTimeout(() => {
            if (selectedMeterTopic) {
                sendQuickCommand("get_data");
            }
        }, 1000);
    }
}

// NOUVELLE: Gérer les données du compteur
function handleMeterData(topic, data) {
    console.log(`📊 Données compteur reçues:`, data);
    
    // Mettre à jour l'affichage du compteur
    if (selectedMeterTopic === topic) {
        updateCompteurDisplay(data);
    }
    
    // Journaliser les données importantes
    const credit = data.credit ? `${data.credit.toFixed(2)} kWh` : 'N/A';
    const power = data.power ? `${data.power.toFixed(1)} W` : 'N/A';
    const voltage = data.voltage ? `${data.voltage.toFixed(1)} V` : 'N/A';
    const relay = data.relay ? "ON" : "OFF";
    
    addMaintenanceLog(`📊 Crédit: ${credit}, Puissance: ${power}, Tension: ${voltage}, Relais: ${relay}`, "info");
    
    // Mettre à jour les données dans connectedMeters
    if (connectedMeters.has(topic)) {
        const meter = connectedMeters.get(topic);
        meter.data = data;
        meter.lastSeen = new Date();
        connectedMeters.set(topic, meter);
    }
}

// NOUVELLE: Gérer les informations système
function handleSystemInfo(topic, data) {
    console.log(`ℹ️ Info système reçue:`, data);
    
    // Afficher dans une modal ou dans l'interface
    const infoType = data.type || 'info';
    const message = data.message || JSON.stringify(data, null, 2);
    
    addMaintenanceLog(`ℹ️ ${infoType}: ${message.substring(0, 100)}`, "info");
    
    // Si c'est la configuration, mettre à jour l'interface
    if (infoType === 'config' && selectedMeterTopic === topic) {
        updateConfigDisplay(data);
    }
}

// NOUVELLE: Gérer les réponses système
function handleSystemResponse(topic, data) {
    console.log(`📋 Réponse système:`, data.type);
    
    const infoType = data.type || 'system';
    
    if (infoType === 'filesystem_info') {
        const totalMB = (data.totalBytes / (1024 * 1024)).toFixed(2);
        const usedMB = (data.usedBytes / (1024 * 1024)).toFixed(2);
        const percentUsed = data.percentUsed || ((data.usedBytes * 100) / data.totalBytes).toFixed(1);
        
        addMaintenanceLog(`💾 FS: ${usedMB}/${totalMB} MB (${percentUsed}%)`, "info");
        
        // Afficher dans une modal si nécessaire
        if (showDetailedInfo) {
            showFilesystemInfo(data);
        }
    }
    
    else if (infoType === 'file_list') {
        const fileCount = data.files ? data.files.length : 0;
        addMaintenanceLog(`📁 ${fileCount} fichiers dans LittleFS`, "info");
    }
    
    else if (infoType === 'help') {
        const commands = data.available_commands || [];
        addMaintenanceLog(`❓ ${commands.length} commandes disponibles`, "info");
        
        // Afficher l'aide dans une modal
        showHelpModal(commands);
    }
}

// NOUVELLE: Gérer les messages texte
function handleTextMessage(topic, message) {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('restart') || lowerMsg.includes('reboot')) {
        addMaintenanceLog("🔄 Redémarrage détecté", "warning");
    }
    
    else if (lowerMsg.includes('ota success')) {
        addMaintenanceLog("✅ Mise à jour OTA réussie", "success");
        showAlert("✅ Mise à jour OTA réussie !", "success");
    }
    
    else if (lowerMsg.includes('ota failed')) {
        addMaintenanceLog("❌ Échec mise à jour OTA", "error");
        showAlert("❌ Échec mise à jour OTA", "error");
    }
    
    else if (lowerMsg.includes('credit') || lowerMsg.includes('kwh')) {
        addMaintenanceLog(`💰 ${message}`, "info");
    }
    
    else if (lowerMsg.includes('relay') && (lowerMsg.includes('on') || lowerMsg.includes('off'))) {
        addMaintenanceLog(`⚡ ${message}`, "info");
    }
    
    else {
        // Message texte générique
        if (message.length > 0 && message !== " ") {
            addMaintenanceLog(`📝 ${message.substring(0, 100)}`, "info");
        }
    }
}

// NOUVELLE: Mettre à jour l'affichage de la configuration
function updateConfigDisplay(data) {
    const configPanel = document.getElementById("configPanel");
    if (!configPanel) return;
    
    let html = `<h3><i class="fas fa-cog"></i> Configuration</h3>`;
    
    if (data.meter_id) {
        html += `<p><strong>ID Compteur:</strong> ${data.meter_id}</p>`;
    }
    
    if (data.version) {
        html += `<p><strong>Version:</strong> ${data.version}</p>`;
    }
    
    if (data.mac) {
        html += `<p><strong>MAC:</strong> ${data.mac}</p>`;
    }
    
    if (data.calibration) {
        html += `<div class="calibration-info">
            <h4><i class="fas fa-sliders-h"></i> Calibration</h4>
            <p><strong>Tension:</strong> ${data.calibration.voltage_coeff || 1.0}</p>
            <p><strong>Courant:</strong> ${data.calibration.current_coeff || 1.0}</p>
            <p><strong>Puissance:</strong> ${data.calibration.power_coeff || 1.0}</p>
            <p><strong>Calibré:</strong> ${data.calibration.calibrated ? '✅' : '❌'}</p>
        </div>`;
    }
    
    if (data.wifi) {
        html += `<div class="wifi-info">
            <h4><i class="fas fa-wifi"></i> WiFi</h4>
            <p><strong>Connecté:</strong> ${data.wifi.connected ? '✅' : '❌'}</p>
            ${data.wifi.ssid ? `<p><strong>SSID:</strong> ${data.wifi.ssid}</p>` : ''}
            ${data.wifi.rssi ? `<p><strong>RSSI:</strong> ${data.wifi.rssi} dBm</p>` : ''}
            <p><strong>AP:</strong> ${data.wifi.ap_ssid || 'N/A'}</p>
            <p><strong>Clients AP:</strong> ${data.wifi.ap_clients || 0}</p>
        </div>`;
    }
    
    if (data.system) {
        html += `<div class="system-info">
            <h4><i class="fas fa-microchip"></i> Système</h4>
            <p><strong>Heap libre:</strong> ${(data.system.free_heap / 1024).toFixed(1)} KB</p>
            <p><strong>MQTT:</strong> ${data.system.mqtt_connected ? '✅' : '❌'}</p>
            <p><strong>Firebase:</strong> ${data.system.firebase_connected ? '✅' : '❌'}</p>
        </div>`;
    }
    
    configPanel.innerHTML = html;
    configPanel.style.display = "block";
}

// NOUVELLE: Fonctions de commandes améliorées
function sendQuickCommand(command) {
    if (!selectedMeterTopic) {
        showAlert("⚠️ Sélectionnez d'abord un compteur !", "warning");
        return;
    }
    
    if (!mqttClient || !mqttClient.connected) {
        showAlert("❌ MQTT non connecté !", "error");
        return;
    }
    
    console.log(`⚡ Envoi commande à ${selectedMeterTopic}: ${command}`);
    
    // Enregistrer la commande dans l'historique
    const commandId = Date.now();
    pendingCommands.set(commandId, {
        command: command,
        timestamp: new Date(),
        topic: selectedMeterTopic
    });
    
    // Envoyer la commande
    mqttClient.publish(selectedMeterTopic, command);
    
    // Ajouter au log
    addMaintenanceLog(`⚡ Envoyé: ${command}`, "sent");
    
    // Animation de feedback
    const sentStatus = document.getElementById("mqttSentStatus");
    if (sentStatus) {
        sentStatus.innerHTML = `<i class="fas fa-paper-plane"></i><span>Commande envoyée: ${command}</span>`;
        sentStatus.classList.add("pulse");
        setTimeout(() => sentStatus.classList.remove("pulse"), 1000);
    }
    
    // Nettoyer les commandes en attente après 10 secondes
    setTimeout(() => {
        pendingCommands.delete(commandId);
    }, 10000);
}

// NOUVELLE: Commandes avec interface utilisateur
function sendRelayOn() {
    sendQuickCommand("relay_on");
}

function sendRelayOff() {
    sendQuickCommand("relay_off");
}

function toggleRelay() {
    sendQuickCommand("toggle_relay");
}

function showAddCreditModal() {
    const modalHtml = `
        <div class="modal" id="creditModal" style="display: flex;">
            <div class="modal-content">
                <h3><i class="fas fa-coins"></i> Ajouter du crédit</h3>
                <div class="form-group">
                    <label for="creditAmount">Montant (kWh)</label>
                    <input type="number" id="creditAmount" min="0.1" max="1000" step="0.1" value="5" placeholder="Ex: 5">
                </div>
                <div class="form-group">
                    <label for="creditComment">Commentaire (optionnel)</label>
                    <input type="text" id="creditComment" placeholder="Raison de l'ajout">
                </div>
                <div class="modal-buttons">
                    <button class="btn btn-secondary" onclick="closeModal('creditModal')">Annuler</button>
                    <button class="btn btn-success" onclick="confirmAddCredit()">Confirmer</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function confirmAddCredit() {
    const amount = document.getElementById("creditAmount").value;
    const comment = document.getElementById("creditComment").value;
    
    if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
        sendQuickCommand(`add_credit:${amount}`);
        addMaintenanceLog(`💰 Demande ajout crédit: ${amount} kWh${comment ? ` (${comment})` : ''}`, "info");
        closeModal('creditModal');
    } else {
        showAlert("❌ Montant invalide", "error");
    }
}

function showCalibrationModal() {
    const modalHtml = `
        <div class="modal" id="calibrationModal" style="display: flex;">
            <div class="modal-content">
                <h3><i class="fas fa-sliders-h"></i> Calibration</h3>
                <div class="form-group">
                    <label for="calibVoltage">Coefficient Tension (V)</label>
                    <input type="number" id="calibVoltage" min="0.5" max="2.0" step="0.001" value="1.000">
                </div>
                <div class="form-group">
                    <label for="calibCurrent">Coefficient Courant (C)</label>
                    <input type="number" id="calibCurrent" min="0.5" max="2.0" step="0.001" value="1.000">
                </div>
                <div class="form-group">
                    <label for="calibPower">Coefficient Puissance (P)</label>
                    <input type="number" id="calibPower" min="0.5" max="2.0" step="0.001" value="1.000">
                </div>
                <div class="modal-buttons">
                    <button class="btn btn-secondary" onclick="closeModal('calibrationModal')">Annuler</button>
                    <button class="btn btn-warning" onclick="resetCalibrationForm()">Par défaut</button>
                    <button class="btn btn-success" onclick="confirmCalibration()">Appliquer</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function resetCalibrationForm() {
    document.getElementById("calibVoltage").value = "1.000";
    document.getElementById("calibCurrent").value = "1.000";
    document.getElementById("calibPower").value = "1.000";
}

function confirmCalibration() {
    const v = document.getElementById("calibVoltage").value;
    const c = document.getElementById("calibCurrent").value;
    const p = document.getElementById("calibPower").value;
    
    if (v && c && p) {
        const command = `SET_COEFF:V${v}C${c}P${p}`;
        sendQuickCommand(command);
        addMaintenanceLog(`⚙️ Calibration: V${v} C${c} P${p}`, "info");
        closeModal('calibrationModal');
    }
}

function showResetModal() {
    if (confirm("⚠️ Réinitialiser le compteur aux paramètres d'usine ?\n\nCette action va :\n• Effacer tout le crédit\n• Réinitialiser la calibration\n• Supprimer l'historique\n\nÊtes-vous certain ?")) {
        if (confirm("⚠️ DERNIÈRE CHANCE !\nTapez 'RESET' pour confirmer :") === "RESET") {
            sendQuickCommand('factory_reset');
        }
    }
}

function showFormatModal() {
    if (confirm("⚠️ FORMATAGE COMPLET !\n\nCette action va :\n• Effacer TOUTES les données\n• Formater le système de fichiers\n• Redémarrer le compteur\n\nÊtes-vous ABSOLUMENT certain ?")) {
        sendQuickCommand('format_littlefs');
    }
}

function showSystemInfo() {
    sendQuickCommand("get_config");
    sendQuickCommand("get_version");
    sendQuickCommand("get_wifi_info");
    sendQuickCommand("get_filesystem_info");
}

function showCommandHistory() {
    const modalHtml = `
        <div class="modal" id="historyModal" style="display: flex;">
            <div class="modal-content" style="max-width: 800px;">
                <h3><i class="fas fa-history"></i> Historique des Commandes</h3>
                <div style="max-height: 400px; overflow-y: auto; margin: 15px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="padding: 8px; border-bottom: 1px solid #ccc; text-align: left;">Heure</th>
                                <th style="padding: 8px; border-bottom: 1px solid #ccc; text-align: left;">Commande</th>
                                <th style="padding: 8px; border-bottom: 1px solid #ccc; text-align: left;">Statut</th>
                                <th style="padding: 8px; border-bottom: 1px solid #ccc; text-align: left;">Message</th>
                            </tr>
                        </thead>
                        <tbody id="commandHistoryBody">
                            ${commandHistory.map(cmd => `
                                <tr>
                                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${cmd.timestamp}</td>
                                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${cmd.id}</td>
                                    <td style="padding: 8px; border-bottom: 1px solid #eee;">
                                        <span class="badge ${cmd.success ? 'badge-success' : 'badge-danger'}">
                                            ${cmd.success ? '✅' : '❌'}
                                        </span>
                                    </td>
                                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${cmd.message}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="modal-buttons">
                    <button class="btn btn-secondary" onclick="closeModal('historyModal')">Fermer</button>
                    <button class="btn btn-danger" onclick="clearCommandHistory()">Effacer l'historique</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function clearCommandHistory() {
    commandHistory = [];
    showAlert("✅ Historique effacé", "success");
    closeModal('historyModal');
}

// NOUVELLE: Fonctions utilitaires
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
    }
}

function showAlert(message, type = "info") {
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease-out;
    `;
    
    switch(type) {
        case "success":
            alertDiv.style.background = "var(--success)";
            break;
        case "warning":
            alertDiv.style.background = "var(--warning)";
            break;
        case "error":
            alertDiv.style.background = "var(--danger)";
            break;
        default:
            alertDiv.style.background = "var(--primary)";
    }
    
    alertDiv.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 
                         type === 'warning' ? 'exclamation-triangle' : 
                         type === 'error' ? 'times-circle' : 'info-circle'}" 
           style="margin-right: 10px;"></i>
        ${message}
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.style.animation = "slideOut 0.3s ease-in";
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 300);
    }, 3000);
}

// NOUVELLE: Styles pour les animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .alert-success {
        background: var(--success) !important;
        color: white !important;
    }
    
    .alert-warning {
        background: var(--warning) !important;
        color: white !important;
    }
    
    .alert-error {
        background: var(--danger) !important;
        color: white !important;
    }
    
    .alert-info {
        background: var(--primary) !important;
        color: white !important;
    }
`;
document.head.appendChild(style);

// Gardez les autres fonctions existantes (detectMeterTypeFromTopic, extractMeterIdFromTopic, etc.)
// mais ajoutez ces nouvelles fonctions à la fin

// Exporter les nouvelles fonctions
window.toggleRelay = toggleRelay;
window.showAddCreditModal = showAddCreditModal;
window.showCalibrationModal = showCalibrationModal;
window.showResetModal = showResetModal;
window.showFormatModal = showFormatModal;
window.showSystemInfo = showSystemInfo;
window.showCommandHistory = showCommandHistory;
window.sendQuickCommand = sendQuickCommand;
// Fonction pour déboguer tous les messages MQTT
function setupMQTTDebug() {
    if (!mqttClient) return;
    
    console.log('🔧 Configuration du mode debug MQTT');
    
    // S'abonner à absolument tout
    mqttClient.subscribe("#", { qos: 0 }, (err) => {
        if (err) {
            console.error('❌ Impossible de s\'abonner à #:', err);
        } else {
            console.log('✅ Debug: Abonné à tous les topics (#)');
        }
    });
}

// Fonction pour détecter le type de module depuis le topic
function detectMeterTypeFromTopic(topic) {
    console.log(`🔍 Analyse du topic: "${topic}"`);
    
    const topicLower = topic.toLowerCase();
    
    // Détection PRIORITAIRE pour compteurs NLF
    if (topicLower.includes('nlf') || topicLower.includes('compteur') || topicLower.includes('meter')) {
        console.log(`✅ Topic semble être un compteur: ${topic}`);
        
        if (topicLower.includes('nlf/compteur') || topicLower.includes('nlf/meter')) {
            console.log(`🎯 Compteur NLF détecté: ${topic}`);
            return 'compteur_nlf';
        }
        return 'compteur';
    }
    
    // Vérifier la structure
    const parts = topic.split('/');
    console.log(`Parties du topic:`, parts);
    
    // Recherche de patterns communs
    if (parts.length >= 2) {
        if (parts[0].toLowerCase() === 'nlf') {
            console.log(`🎯 Structure NLF détectée: ${topic}`);
            return 'compteur_nlf';
        }
        
        // Vérifier si contient un numéro de compteur (chiffres)
        const lastPart = parts[parts.length - 1];
        if (/^\d+$/.test(lastPart)) {
            console.log(`🔢 Numéro détecté dans topic: ${lastPart}`);
            return 'compteur';
        }
    }
    
    console.log(`❓ Topic non reconnu comme compteur: ${topic}`);
    return 'inconnu';
}

// Fonction pour extraire l'ID du compteur depuis le topic
function extractMeterIdFromTopic(topic) {
    const parts = topic.split('/');
    console.log(`📋 Extraction ID depuis ${topic}:`, parts);
    
    if (parts.length >= 3 && parts[0].toLowerCase() === 'nlf') {
        const id = parts[2] || 'inconnu';
        console.log(`🔢 ID NLF extrait: ${id}`);
        return id;
    }
    
    const lastPart = parts.pop() || 'inconnu';
    console.log(`🔢 ID générique extrait: ${lastPart}`);
    return lastPart;
}

// Fonction pour traiter les messages des compteurs NLF
function processNlfMeterMessage(topic, message) {
    try {
        const data = JSON.parse(message);
        console.log(`📊 Message JSON de ${topic}:`, data);
        
        // Vérifier si c'est un message de compteur NLF
        if (data.type === 'compteur_prepaye' || data.hasOwnProperty('credit') || 
            data.hasOwnProperty('power') || data.hasOwnProperty('relay')) {
            
            console.log(`✅ Message de compteur NLF détecté:`, data);
            
            // Mettre à jour les données du compteur
            if (selectedMeterTopic === topic) {
                updateCompteurDisplay(data);
            }
            
            // Journaliser avec les données importantes
            const credit = data.credit ? `${data.credit}kWh` : 'N/A';
            const power = data.power ? `${data.power}W` : 'N/A';
            addLog(`📊 ${topic}: ${credit}, ${power}, Relay: ${data.relay ? 'ON' : 'OFF'}`, "received");
            
            return true;
        }
    } catch (e) {
        // Ce n'est pas du JSON, ou JSON invalide
        console.log(`❌ ${topic}: Pas du JSON valide:`, message.substring(0, 100));
        
        // Vérifier si c'est un message texte simple
        if (message.includes('credit') || message.includes('kWh') || 
            message.includes('power') || message.includes('relay')) {
            console.log(`✅ ${topic}: Message texte de compteur détecté`);
            return true;
        }
    }
    return false;
}

// Mettre à jour l'appareil connecté
function updateConnectedMeter(topic, message) {
    const meterId = extractMeterIdFromTopic(topic);
    const meterType = detectedMeterTypes.get(topic) || 'inconnu';
    
    console.log(`🔄 Mise à jour appareil ${topic}: ${meterId} (${meterType})`);
    
    connectedMeters.set(topic, {
        id: meterId,
        type: meterType,
        lastMessage: message,
        lastSeen: new Date(),
        online: true,
        data: tryParseMeterData(message)
    });
    
    // Mettre à jour immédiatement la liste
    updateConnectedMetersList();
}

// Parser les données du compteur
function tryParseMeterData(message) {
    try {
        return JSON.parse(message);
    } catch (e) {
        // Si ce n'est pas du JSON, essayer d'extraire des informations
        if (message.includes('credit') || message.includes('kWh') || 
            message.includes('power') || message.includes('relay')) {
            return { raw: message };
        }
        return null;
    }
}

// Mettre à jour la liste des appareils connectés
function updateConnectedMetersList() {
    console.log(`📊 Mise à jour liste appareils (${connectedMeters.size} appareils)`);
    
    const metersListContainer = document.getElementById("connectedMetersList");
    if (!metersListContainer) {
        console.log('🆕 Création du conteneur connectedMetersList');
        // Créer le conteneur s'il n'existe pas
        const maintenanceTab = document.getElementById("maintenance");
        if (maintenanceTab) {
            const metersListHTML = `
                <div class="maintenance-section" style="margin-top: 20px;">
                    <div class="maintenance-title">
                        <i class="fas fa-network-wired"></i> Appareils Connectés
                    </div>
                    <div id="connectedMetersList" style="max-height: 300px; overflow-y: auto; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <!-- Liste générée dynamiquement -->
                    </div>
                </div>
            `;
            maintenanceTab.insertAdjacentHTML('beforeend', metersListHTML);
        }
    }
    
    // Nettoyer la liste
    const container = document.getElementById("connectedMetersList");
    if (!container) return;
    
    container.innerHTML = '';
    
    // Mettre à jour l'état des appareils (marquer comme hors ligne si > 60 secondes)
    const now = new Date();
    let onlineCount = 0;
    let totalCount = 0;
    
    connectedMeters.forEach((meter, topic) => {
        totalCount++;
        const timeDiff = (now - meter.lastSeen) / 1000; // en secondes
        meter.online = timeDiff < 60; // 60 secondes de timeout
        
        if (meter.online) onlineCount++;
        
        // Créer l'élément de liste
        const meterItem = document.createElement("div");
        meterItem.className = "module-item";
        meterItem.style.cursor = "pointer";
        meterItem.style.padding = "10px";
        meterItem.style.marginBottom = "5px";
        meterItem.style.background = topic === selectedMeterTopic ? "rgba(52, 152, 219, 0.2)" : "rgba(255,255,255,0.05)";
        meterItem.style.borderRadius = "5px";
        meterItem.style.borderLeft = topic === selectedMeterTopic ? "3px solid #3498db" : "3px solid transparent";
        meterItem.onclick = () => selectMeterForMaintenance(topic);
        
        if (topic === selectedMeterTopic) {
            meterItem.classList.add("active");
        }
        
        // Préparer l'affichage
        const meterName = meter.id || topic.split('/').pop();
        const statusBadge = meter.online ? 
            '<span class="badge badge-success" style="font-size: 10px; padding: 2px 5px;">En ligne</span>' : 
            '<span class="badge badge-warning" style="font-size: 10px; padding: 2px 5px;">Hors ligne</span>';
        
        const typeBadge = meter.type !== 'inconnu' ? 
            `<span class="badge" style="background: ${getMeterTypeColor(meter.type)}; font-size: 10px; padding: 2px 5px;">${meter.type}</span>` : '';
        
        const lastSeen = meter.online ? 
            'Maintenant' : 
            `${Math.floor(timeDiff / 60)} min ${Math.floor(timeDiff % 60)} sec`;
        
        meterItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong><i class="fas fa-microchip"></i> ${meterName}</strong>
                    ${typeBadge}
                    ${statusBadge}
                </div>
                <small style="color: rgba(255,255,255,0.5); font-size: 11px;">${lastSeen}</small>
            </div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 5px; word-break: break-all;">
                ${topic}
            </div>
            ${meter.data && (meter.data.credit || meter.data.raw) ? 
                `<div style="font-size: 10px; color: var(--success); margin-top: 3px;">
                    <i class="fas fa-bolt"></i> ${meter.data.credit ? meter.data.credit + 'kWh' : 'Données brutes'} | ${meter.data.power || '0'}W
                </div>` : ''}
        `;
        
        container.appendChild(meterItem);
    });
    
    // Afficher le nombre d'appareils
    const titleElement = document.querySelector('.maintenance-title');
    if (titleElement && titleElement.textContent.includes('Appareils Connectés')) {
        titleElement.innerHTML = `
            <i class="fas fa-network-wired"></i> Appareils Connectés 
            <span class="badge badge-success" style="font-size: 11px;">${onlineCount} en ligne</span>
            <span class="badge" style="font-size: 11px;">${totalCount} total</span>
        `;
    }
    
    console.log(`📈 Appareils: ${onlineCount} en ligne / ${totalCount} total`);
}

// Fonction pour sélectionner un compteur depuis la liste
function selectMeterForMaintenance(topic) {
    console.log(`🎯 Sélection du compteur: ${topic}`);
    const dropdown = document.getElementById("mqttTopicSelect");
    dropdown.value = topic;
    selectedMeterTopic = topic;
    subscribeToMeter();
    updateConnectedMetersList();
}

// Fonction pour obtenir la couleur selon le type
function getMeterTypeColor(type) {
    const colors = {
        'compteur_nlf': '#3498db',
        'compteur': '#2980b9',
        'capteur': '#2ecc71',
        'relai': '#e74c3c',
        'smartswich': '#9b59b6',
        'mybike': '#f39c12',
        'inconnu': '#95a5a6'
    };
    return colors[type] || colors['inconnu'];
}

// Fonctions de maintenance existantes modifiées
function subscribeToMeter() {
    const dropdown = document.getElementById("mqttTopicSelect");
    selectedMeterTopic = dropdown.value;
    
    if (selectedMeterTopic) {
        console.log(`🔗 Abonnement à: ${selectedMeterTopic}`);
        
        mqttClient.subscribe(selectedMeterTopic);
        mqttClient.subscribe(selectedMeterTopic + "/status");
        mqttClient.subscribe(selectedMeterTopic + "/data");
        addMaintenanceLog(`Abonné à: ${selectedMeterTopic}`, "success");
        
        // Afficher les infos du compteur
        document.getElementById("meterInfo").style.display = "block";
        document.getElementById("infoMeterTopic").textContent = selectedMeterTopic;
        
        // Détecter et afficher le type
        const meterType = detectedMeterTypes.get(selectedMeterTopic);
        if (meterType) {
            document.getElementById("infoMeterType").textContent = meterType;
        }
        
        // Demander le statut si c'est un compteur NLF
        if (meterType === 'compteur_nlf') {
            mqttClient.publish(selectedMeterTopic, "get_status");
        }
        
        // Mettre à jour le statut de connexion
        updateConnectionStatus("success", `Connecté à: ${selectedMeterTopic}`);
        
        // Mettre à jour la liste
        updateConnectedMetersList();
    } else {
        showAlert("⚠️ Veuillez sélectionner un compteur !", "warning");
    }
}

// Mettre à jour l'affichage du compteur NLF
function updateCompteurDisplay(data) {
    console.log('🔄 Mise à jour affichage compteur:', data);
    
    const creditElement = document.getElementById("compteurCredit");
    const powerElement = document.getElementById("compteurPower");
    const voltageElement = document.getElementById("compteurVoltage");
    const currentElement = document.getElementById("compteurCurrent");
    const relayElement = document.getElementById("compteurRelay");
    
    if (creditElement) {
        creditElement.textContent = data.credit ? data.credit.toFixed(2) : "0";
    }
    
    if (powerElement) {
        powerElement.textContent = data.power ? data.power.toFixed(1) : "0";
    }
    
    if (voltageElement) {
        voltageElement.textContent = 
            data.v ? data.v.toFixed(1) : data.voltage ? data.voltage.toFixed(1) : "0";
    }
    
    if (currentElement) {
        currentElement.textContent = 
            data.c ? data.c.toFixed(2) : data.current ? data.current.toFixed(2) : "0";
    }
    
    if (relayElement && data.relay !== undefined) {
        relayElement.textContent = data.relay ? "ON" : "OFF";
        relayElement.className = data.relay ? "badge badge-success" : "badge badge-danger";
    }
}

// Modifier updateMeterInfo pour gérer différents types de messages
function updateMeterInfo(topic, message) {
    try {
        const data = JSON.parse(message);
        console.log(`📋 Mise à jour infos compteur ${topic}:`, data);
        
        document.getElementById("infoMeterId").textContent = data.id || extractMeterIdFromTopic(topic);
        
        // Mettre à jour le statut
        const statusElement = document.getElementById("infoMeterStatus");
        if (data.credit !== undefined) {
            statusElement.innerHTML = `<span class="badge badge-success">En ligne (${data.credit} kWh)</span>`;
        } else if (data.status) {
            statusElement.innerHTML = `<span class="badge badge-success">${data.status}</span>`;
        }
        
        document.getElementById("infoMeterLastMessage").textContent = 
            message.length > 50 ? message.substring(0, 50) + "..." : message;
            
        // Mettre à jour le type si détecté
        const meterType = detectedMeterTypes.get(topic);
        if (meterType) {
            document.getElementById("infoMeterType").textContent = meterType;
        }
    } catch (e) {
        // Si le message n'est pas du JSON
        console.log(`📋 Mise à jour infos (texte) ${topic}: ${message.substring(0, 50)}`);
        document.getElementById("infoMeterLastMessage").textContent = message;
        
        // Essayer d'extraire des informations du texte
        if (message.includes('ONLINE') || message.includes('online')) {
            document.getElementById("infoMeterStatus").innerHTML = 
                `<span class="badge badge-success">En ligne</span>`;
        }
    }
}

// Mettre à jour le statut de connexion
function updateConnectionStatus(status = "success", message = "") {
    const statusElement = document.getElementById("connectionStatus");
    if (!statusElement) {
        console.log('⚠️ Element connectionStatus non trouvé');
        return;
    }
    
    let badgeClass, statusText;
    
    switch(status) {
        case "success":
            badgeClass = "badge-success";
            statusText = message || "Connecté";
            break;
        case "warning":
            badgeClass = "badge-warning";
            statusText = message || "Déconnecté";
            break;
        case "error":
            badgeClass = "badge-danger";
            statusText = message || "Erreur";
            break;
        default:
            badgeClass = "badge-warning";
            statusText = message || "Inconnu";
    }
    
    statusElement.className = `badge ${badgeClass}`;
    statusElement.textContent = statusText;
    console.log(`📡 Statut connexion: ${statusText}`);
}

// Modifier loadAvailableMeters pour inclure les appareils détectés
function loadAvailableMeters() {
    console.log('📥 Chargement des compteurs disponibles...');
    
    // Charger les compteurs depuis Firebase si disponible
    if (typeof db !== 'undefined' && db) {
        console.log('🔥 Chargement depuis Firebase...');
        db.collection("clients").get().then((querySnapshot) => {
            console.log(`📋 ${querySnapshot.size} clients trouvés dans Firebase`);
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.meterNumber) {
                    console.log(`🔢 Compteur Firebase: ${data.meterNumber}`);
                    const topics = [
                        `nlf/compteur/${data.meterNumber}`,
                        `nlf/meter/${data.meterNumber}`,
                        `compteur/${data.meterNumber}`,
                        data.meterNumber.toString()
                    ];
                    
                    topics.forEach(topic => {
                        if (!mqttTopics.has(topic)) {
                            mqttTopics.add(topic);
                            console.log(`➕ Topic ajouté depuis Firebase: ${topic}`);
                            // Pré-abonner pour détection
                            if (mqttClient && mqttClient.connected) {
                                mqttClient.subscribe(topic);
                            }
                        }
                    });
                }
            });
            updateMeterDropdown();
        }).catch(error => {
            console.error("❌ Erreur Firebase:", error);
            addMaintenanceLog("Impossible de charger les compteurs depuis Firebase", "warning");
        });
    }
    
    // Scanner les topics communs
    const commonTopics = [
        "nlf/compteur/+",
        "nlf/meter/+", 
        "compteur/+",
        "device/+",
        "meter/+"
    ];
    
    commonTopics.forEach(topic => {
        if (mqttClient && mqttClient.connected) {
            mqttClient.subscribe(topic);
            console.log(`📡 Abonné au topic commun: ${topic}`);
        }
    });
}

// Ajouter cette fonction pour nettoyer les appareils inactifs
function cleanupInactiveMeters() {
    const now = new Date();
    let removedCount = 0;
    
    connectedMeters.forEach((meter, topic) => {
        const timeDiff = (now - meter.lastSeen) / 1000; // en secondes
        if (timeDiff > 300) { // 5 minutes d'inactivité
            connectedMeters.delete(topic);
            removedCount++;
        }
    });
    
    if (removedCount > 0) {
        updateConnectedMetersList();
        addMaintenanceLog(`${removedCount} appareil(s) inactif(s) nettoyé(s)`, "warning");
    }
}

// Initialiser le nettoyage périodique
setInterval(cleanupInactiveMeters, 60000); // Toutes les minutes

// Fonction pour envoyer des commandes rapides
function sendQuickCommand(command) {
    if (!selectedMeterTopic) {
        showAlert("⚠️ Sélectionnez d'abord un compteur !", "warning");
        return;
    }
    
    console.log(`⚡ Envoi commande à ${selectedMeterTopic}: ${command}`);
    mqttClient.publish(selectedMeterTopic, command);
    addMaintenanceLog(`⚡ Commande rapide: ${command}`, "sent");
    
    // Animation de feedback
    const sentStatus = document.getElementById("mqttSentStatus");
    if (sentStatus) {
        sentStatus.innerHTML = `<i class="fas fa-paper-plane"></i><span>Commande envoyée: ${command}</span>`;
        sentStatus.classList.add("pulse");
        setTimeout(() => sentStatus.classList.remove("pulse"), 1000);
    }
}

// Ajouter les fonctions pour les compteurs NLF
function toggleRelay() {
    sendQuickCommand('relay_toggle');
}

function addCreditToMeter() {
    const amount = prompt("Montant de crédit à ajouter (en kWh):", "5");
    if (amount && !isNaN(amount)) {
        sendQuickCommand(`add_credit:${amount}`);
    }
}

function openCalibrationModal() {
    const coeff = prompt("Coefficients de calibration (format: V1.0C1.0P1.0):", "V1.0C1.0P1.0");
    if (coeff) {
        sendQuickCommand(`SET_COEFF:${coeff}`);
    }
}

function resetMeter() {
    if (confirm("Réinitialiser le compteur aux paramètres d'usine ?")) {
        sendQuickCommand('factory_reset');
    }
}

// Ajouter cette fonction pour mettre à jour le dropdown avec les types
function updateMeterDropdown() {
    console.log(`📋 Mise à jour dropdown avec ${mqttTopics.size} topics`);
    
    const dropdown = document.getElementById("mqttTopicSelect");
    if (!dropdown) {
        console.error('❌ Dropdown mqttTopicSelect non trouvé!');
        return;
    }
    
    const currentValue = dropdown.value;
    dropdown.innerHTML = "";
    
    let defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "-- Sélectionnez un compteur --";
    dropdown.appendChild(defaultOption);
    
    // Ajouter d'abord les appareils connectés
    connectedMeters.forEach((meter, topic) => {
        if (!mqttTopics.has(topic)) {
            mqttTopics.add(topic);
        }
    });
    
    // Trier les topics par type détecté
    const sortedTopics = Array.from(mqttTopics).sort((a, b) => {
        const typeA = detectedMeterTypes.get(a) || 'inconnu';
        const typeB = detectedMeterTypes.get(b) || 'inconnu';
        return typeA.localeCompare(typeB);
    });
    
    sortedTopics.forEach(topic => {
        let option = document.createElement("option");
        option.value = topic;
        
        // Extraire le numéro de compteur du topic
        const meterNumber = topic.split('/').pop();
        const meterType = detectedMeterTypes.get(topic);
        const typeDisplay = meterType ? ` [${meterType}]` : '';
        const displayText = meterType === 'compteur_nlf' ? 
            `Compteur NLF ${meterNumber}` : 
            `Compteur ${meterNumber}${typeDisplay}`;
        
        option.textContent = displayText;
        option.title = `${topic}${meterType ? ` (Type: ${meterType})` : ''}`;
        dropdown.appendChild(option);
    });
    
    if (mqttTopics.has(currentValue)) {
        dropdown.value = currentValue;
    }
    
    console.log(`✅ Dropdown mis à jour avec ${sortedTopics.length} options`);
}

// Renommer addMaintenanceLog pour éviter les conflits
function addMaintenanceLog(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { message, type, timestamp };
    maintenanceLogs.push(logEntry);
    
    // Limiter à 50 logs
    if (maintenanceLogs.length > 50) {
        maintenanceLogs.shift();
    }
    
    // Mettre à jour l'affichage
    updateMaintenanceLogDisplay();
    
    // Afficher dans la console
    console.log(`📝 [${type.toUpperCase()}] ${message}`);
}

// Mettre à jour l'affichage des logs
function updateMaintenanceLogDisplay() {
    const logsContainer = document.getElementById("maintenanceLogs");
    if (!logsContainer) return;
    
    logsContainer.innerHTML = '';
    
    maintenanceLogs.slice(-10).forEach(log => { // Afficher les 10 derniers
        const logElement = document.createElement("div");
        logElement.className = "log-entry";
        logElement.style.padding = "5px";
        logElement.style.marginBottom = "3px";
        logElement.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
        
        const icon = getLogIcon(log.type);
        const color = getLogColor(log.type);
        
        logElement.innerHTML = `
            ${icon}
            <span style="color: ${color}; font-size: 12px;">${log.message}</span>
            <span style="float: right; font-size: 10px; color: rgba(255,255,255,0.5);">${log.timestamp}</span>
        `;
        
        logsContainer.appendChild(logElement);
    });
    
    // Faire défiler vers le bas
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Fonction de log générique (pour compatibilité)
function addLog(message, type = "info") {
    addMaintenanceLog(message, type);
}

// Fonctions utilitaires
function getLogIcon(type) {
    switch(type) {
        case "success": return '<i class="fas fa-check-circle" style="color: var(--success); margin-right: 5px;"></i>';
        case "warning": return '<i class="fas fa-exclamation-triangle" style="color: var(--warning); margin-right: 5px;"></i>';
        case "error": return '<i class="fas fa-times-circle" style="color: var(--danger); margin-right: 5px;"></i>';
        case "received": return '<i class="fas fa-broadcast-tower" style="color: var(--accent); margin-right: 5px;"></i>';
        case "sent": return '<i class="fas fa-paper-plane" style="color: var(--success); margin-right: 5px;"></i>';
        default: return '<i class="fas fa-info-circle" style="color: var(--primary); margin-right: 5px;"></i>';
    }
}

function getLogColor(type) {
    switch(type) {
        case "success": return "var(--success)";
        case "warning": return "var(--warning)";
        case "error": return "var(--danger)";
        case "received": return "var(--accent)";
        case "sent": return "var(--success)";
        default: return "rgba(255, 255, 255, 0.7)";
    }
}

function showAlert(message, type = "info") {
    console.log(`⚠️ Alert: ${message} (${type})`);
    // Implémentez votre fonction d'alerte ici
    alert(`${type.toUpperCase()}: ${message}`);
}

function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const timeElement = document.getElementById("currentTime");
    if (timeElement) {
        timeElement.textContent = timeString;
    }
}

// Initialiser MQTT au chargement
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM chargé - Initialisation maintenance');
    
    // Vérifier si on est sur la page maintenance
    const maintenancePage = document.getElementById('maintenancePage');
    console.log('Page maintenance trouvée?', !!maintenancePage);
    console.log('Page maintenance active?', maintenancePage?.classList.contains('active'));
    
    // Initialiser MQTT immédiatement si sur la page maintenance
    if (maintenancePage && maintenancePage.classList.contains('active')) {
        console.log('📍 Sur la page maintenance - Initialisation MQTT');
        setTimeout(() => {
            if (!mqttClient) {
                console.log('🔌 Lancement connexion MQTT...');
                initMQTTMaintenance();
            }
        }, 1000);
    }
    
    // Écouter les changements de page via le menu
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function() {
            const page = this.getAttribute('data-page');
            console.log(`📄 Changement page: ${page}`);
            
            if (page === 'maintenance') {
                console.log('🎯 Page maintenance sélectionnée');
                setTimeout(() => {
                    if (!mqttClient) {
                        console.log('🔌 Démarrage MQTT depuis menu...');
                        initMQTTMaintenance();
                    } else if (!mqttClient.connected) {
                        console.log('🔄 Reconnexion MQTT...');
                        // Tentative de reconnexion
                        try {
                            mqttClient.end();
                            mqttClient = null;
                            setTimeout(initMQTTMaintenance, 1000);
                        } catch (e) {
                            console.error('❌ Erreur reconnexion:', e);
                        }
                    }
                }, 500);
            }
        });
    });
    
    // Initialiser MQTT après 3 secondes de sécurité (au cas où)
    setTimeout(() => {
        const maintenancePage = document.getElementById('maintenancePage');
        if (maintenancePage && maintenancePage.classList.contains('active') && !mqttClient) {
            console.log('⏰ Initialisation MQTT différée (sécurité)');
            initMQTTMaintenance();
        }
    }, 3000);
    
    // Mettre à jour l'heure
    setInterval(updateCurrentTime, 1000);
    
    // Mettre à jour la liste des appareils toutes les 5 secondes
    setInterval(updateConnectedMetersList, 5000);
});

// Exporter les fonctions nécessaires
window.initMQTTMaintenance = initMQTTMaintenance;
window.subscribeToMeter = subscribeToMeter;
window.unsubscribeFromMeter = function() {
    if (selectedMeterTopic && mqttClient) {
        mqttClient.unsubscribe(selectedMeterTopic);
        addMaintenanceLog(`Désabonné de: ${selectedMeterTopic}`, "warning");
        selectedMeterTopic = "";
    }
};
window.sendMaintenanceCommand = function() {
    const command = document.getElementById("maintenanceCommand").value;
    if (command && selectedMeterTopic) {
        sendQuickCommand(command);
        document.getElementById("maintenanceCommand").value = "";
    }
};
window.sendRelayOn = function() { sendQuickCommand('relay_on'); };
window.sendRelayOff = function() { sendQuickCommand('relay_off'); };
window.showAddCreditModal = addCreditToMeter;
window.showCalibrationModal = openCalibrationModal;
window.updateFirmwareOTA = function() {
    const url = document.getElementById("firmwareUrl").value;
    if (url) {
        sendQuickCommand(`UPDATE_FIRMWARE:${url}`);
    }
};
window.clearMaintenanceLogs = function() {
    maintenanceLogs = [];
    updateMaintenanceLogDisplay();
};
window.exportMaintenanceLogs = function() {
    const logText = maintenanceLogs.map(log => 
        `[${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maintenance_logs_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
};