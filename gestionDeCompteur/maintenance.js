// Dans votre app.js, ajoutez ces fonctions

// Variables globales pour la maintenance
let mqttClient = null;
let mqttTopics = new Set();
let selectedMeterTopic = "";
let maintenanceLogs = [];

// Initialisation MQTT
function initMQTTMaintenance() {
    // Se connecter au broker MQTT HiveMQ
    const options = {
        username: "smart_l1",
        password: "Fortico1234",
        clientId: "compteur_admin_" + Math.random().toString(16).substring(2, 8)
    };
    
    mqttClient = mqtt.connect("wss://e59af3ed375b42f6ad6c44f423c06a66.s1.eu.hivemq.cloud:8884/mqtt", options);
    
    // Gestionnaire d'événements MQTT
    mqttClient.on("connect", function() {
        addMaintenanceLog("Connecté au broker MQTT", "success");
        mqttClient.subscribe("nlf/compteur/#");
        loadAvailableMeters();
    });
    
    mqttClient.on("message", function(topic, message) {
        const messageStr = message.toString();
        
        // Ajouter le topic à la liste s'il n'existe pas
        if (!mqttTopics.has(topic)) {
            mqttTopics.add(topic);
            updateMeterDropdown();
        }
        
        // Mettre à jour les logs et l'affichage
        addMaintenanceLog(`📩 ${topic}: ${messageStr}`, "received");
        
        if (topic === selectedMeterTopic) {
            updateMeterInfo(topic, messageStr);
            document.getElementById("mqttReceivedStatus").innerHTML = 
                `<i class="fas fa-broadcast-tower"></i><span>Dernier message: ${messageStr.substring(0, 50)}${messageStr.length > 50 ? '...' : ''}</span>`;
        }
        
        // Mettre à jour l'heure actuelle
        updateCurrentTime();
    });
    
    mqttClient.on("error", function(error) {
        addMaintenanceLog(`Erreur MQTT: ${error.message}`, "error");
    });
}

// Fonctions de maintenance
function subscribeToMeter() {
    const dropdown = document.getElementById("mqttTopicSelect");
    selectedMeterTopic = dropdown.value;
    
    if (selectedMeterTopic) {
        mqttClient.subscribe(selectedMeterTopic + "/status");
        mqttClient.subscribe(selectedMeterTopic + "/data");
        addMaintenanceLog(`Abonné à: ${selectedMeterTopic}`, "success");
        
        // Afficher les infos du compteur
        document.getElementById("meterInfo").style.display = "block";
        document.getElementById("infoMeterTopic").textContent = selectedMeterTopic;
        
        // Demander le statut
        mqttClient.publish(selectedMeterTopic + "/commands", "get_status");
    } else {
        showAlert("⚠️ Veuillez sélectionner un compteur !", "warning");
    }
}

function unsubscribeFromMeter() {
    if (selectedMeterTopic) {
        mqttClient.unsubscribe(selectedMeterTopic + "/status");
        mqttClient.unsubscribe(selectedMeterTopic + "/data");
        addMaintenanceLog(`Désabonné de: ${selectedMeterTopic}`, "warning");
        document.getElementById("meterInfo").style.display = "none";
        selectedMeterTopic = "";
    }
}

function sendMaintenanceCommand() {
    const command = document.getElementById("maintenanceCommand").value.trim();
    
    if (!selectedMeterTopic) {
        showAlert("⚠️ Veuillez d'abord sélectionner un compteur !", "warning");
        return;
    }
    
    if (!command) {
        showAlert("⚠️ Veuillez saisir une commande !", "warning");
        return;
    }
    
    mqttClient.publish(selectedMeterTopic + "/commands", command);
    addMaintenanceLog(`📤 ${selectedMeterTopic}: ${command}`, "sent");
    
    document.getElementById("mqttSentStatus").innerHTML = 
        `<i class="fas fa-paper-plane"></i><span>Commande envoyée: ${command}</span>`;
    
    document.getElementById("maintenanceCommand").value = "";
}

// Commandes prédéfinies
function sendRelayOn() {
    document.getElementById("maintenanceCommand").value = "relay_on";
    sendMaintenanceCommand();
}

function sendRelayOff() {
    document.getElementById("maintenanceCommand").value = "relay_off";
    sendMaintenanceCommand();
}

function showAddCreditModal() {
    const amount = prompt("Montant de crédit à ajouter (en Ariary):", "1000");
    if (amount && !isNaN(amount)) {
        document.getElementById("maintenanceCommand").value = `add_credit:${amount}`;
        sendMaintenanceCommand();
    }
}

function showCalibrationModal() {
    const coeff = prompt("Coefficients de calibration (format: V1.0C1.0P1.0):", "V1.0C1.0P1.0");
    if (coeff) {
        document.getElementById("maintenanceCommand").value = `SET_COEFF:${coeff}`;
        sendMaintenanceCommand();
    }
}

function updateFirmwareOTA() {
    const firmwareUrl = document.getElementById("firmwareUrl").value.trim();
    
    if (!selectedMeterTopic) {
        showAlert("⚠️ Veuillez d'abord sélectionner un compteur !", "warning");
        return;
    }
    
    if (!firmwareUrl) {
        showAlert("⚠️ Veuillez saisir une URL de firmware !", "warning");
        return;
    }
    
    if (!firmwareUrl.startsWith("http")) {
        showAlert("❌ URL de firmware invalide !", "error");
        return;
    }
    
    if (confirm("⚠️ Le compteur va redémarrer après la mise à jour. Continuer ?")) {
        mqttClient.publish(selectedMeterTopic + "/commands", firmwareUrl);
        addMaintenanceLog(`🔄 Mise à jour firmware envoyée: ${firmwareUrl}`, "info");
        showAlert("✅ Commande de mise à jour envoyée !", "success");
        document.getElementById("firmwareUrl").value = "";
    }
}

// Fonctions utilitaires
function loadAvailableMeters() {
    // Charger les compteurs depuis Firebase
    if (db) {
        db.collection("clients").get().then((querySnapshot) => {
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.meterNumber) {
                    const topic = `nlf/compteur/${data.meterNumber}`;
                    mqttTopics.add(topic);
                }
            });
            updateMeterDropdown();
        });
    }
}

function updateMeterDropdown() {
    const dropdown = document.getElementById("mqttTopicSelect");
    const currentValue = dropdown.value;
    dropdown.innerHTML = "";
    
    let defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "-- Sélectionnez un compteur --";
    dropdown.appendChild(defaultOption);
    
    mqttTopics.forEach(topic => {
        let option = document.createElement("option");
        option.value = topic;
        
        // Extraire le numéro de compteur du topic
        const meterNumber = topic.split('/').pop();
        const displayText = `Compteur ${meterNumber}`;
        
        option.textContent = displayText;
        option.title = topic;
        dropdown.appendChild(option);
    });
    
    if (mqttTopics.has(currentValue)) {
        dropdown.value = currentValue;
    }
}

function updateMeterInfo(topic, message) {
    try {
        const data = JSON.parse(message);
        document.getElementById("infoMeterId").textContent = data.id || "Inconnu";
        
        // Mettre à jour le statut
        const statusElement = document.getElementById("infoMeterStatus");
        if (data.credit !== undefined) {
            statusElement.innerHTML = `<span class="badge badge-success">En ligne (${data.credit} Ar)</span>`;
        }
        
        document.getElementById("infoMeterLastMessage").textContent = 
            message.length > 50 ? message.substring(0, 50) + "..." : message;
    } catch (e) {
        // Si le message n'est pas du JSON
        document.getElementById("infoMeterLastMessage").textContent = message;
    }
}

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
}

function updateMaintenanceLogDisplay() {
    const logsContainer = document.getElementById("maintenanceLogs");
    logsContainer.innerHTML = "";
    
    maintenanceLogs.forEach(log => {
        const icon = getMaintenanceLogIcon(log.type);
        const color = getMaintenanceLogColor(log.type);
        
        const logElement = document.createElement("div");
        logElement.className = "log-entry";
        logElement.style.padding = "8px";
        logElement.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
        logElement.innerHTML = `
            ${icon}
            <span style="color: ${color};">${log.message}</span>
            <span style="float: right; font-size: 11px; color: rgba(255,255,255,0.5);">${log.timestamp}</span>
        `;
        
        logsContainer.appendChild(logElement);
    });
    
    // Faire défiler vers le bas
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

function clearMaintenanceLogs() {
    if (confirm("Êtes-vous sûr de vouloir effacer tous les logs de maintenance ?")) {
        maintenanceLogs = [];
        updateMaintenanceLogDisplay();
        addMaintenanceLog("Logs effacés", "warning");
    }
}

function exportMaintenanceLogs() {
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
    
    addMaintenanceLog("Logs exportés", "success");
}

function getMaintenanceLogIcon(type) {
    switch(type) {
        case "success": return '<i class="fas fa-check-circle" style="color: var(--success-color); margin-right: 8px;"></i>';
        case "warning": return '<i class="fas fa-exclamation-triangle" style="color: var(--warning-color); margin-right: 8px;"></i>';
        case "error": return '<i class="fas fa-times-circle" style="color: var(--danger-color); margin-right: 8px;"></i>';
        case "received": return '<i class="fas fa-broadcast-tower" style="color: var(--accent); margin-right: 8px;"></i>';
        case "sent": return '<i class="fas fa-paper-plane" style="color: var(--success-color); margin-right: 8px;"></i>';
        default: return '<i class="fas fa-info-circle" style="color: var(--primary-color); margin-right: 8px;"></i>';
    }
}

function getMaintenanceLogColor(type) {
    switch(type) {
        case "success": return "var(--success-color)";
        case "warning": return "var(--warning-color)";
        case "error": return "var(--danger-color)";
        case "received": return "var(--accent)";
        case "sent": return "var(--success-color)";
        default: return "rgba(255, 255, 255, 0.7)";
    }
}

function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    document.getElementById("currentTime").textContent = timeString;
}
function showAlert(message, type = "info") {
    // Créer l'élément d'alerte
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.position = "fixed";
    alertDiv.style.top = "20px";
    alertDiv.style.right = "20px";
    alertDiv.style.padding = "15px 20px";
    alertDiv.style.borderRadius = "8px";
    alertDiv.style.color = "white";
    alertDiv.style.fontWeight = "600";
    alertDiv.style.zIndex = "10000";
    alertDiv.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    alertDiv.style.maxWidth = "400px";
    alertDiv.style.animation = "fadeIn 0.3s ease-in-out";
    alertDiv.style.display = "flex";
    alertDiv.style.alignItems = "center";
    alertDiv.style.gap = "10px";
    
    // Définir les couleurs selon le type
    switch(type) {
        case "success":
            alertDiv.style.background = "var(--success-color)";
            alertDiv.style.color = "var(--dark)";
            break;
        case "warning":
            alertDiv.style.background = "var(--warning-color)";
            alertDiv.style.color = "var(--dark)";
            break;
        case "error":
            alertDiv.style.background = "var(--danger-color)";
            alertDiv.style.color = "var(--light)";
            break;
        default:
            alertDiv.style.background = "var(--primary-color)";
            alertDiv.style.color = "var(--dark)";
    }
    
    // Icône selon le type
    let icon = '';
    switch(type) {
        case "success":
            icon = '<i class="fas fa-check-circle"></i>';
            break;
        case "warning":
            icon = '<i class="fas fa-exclamation-triangle"></i>';
            break;
        case "error":
            icon = '<i class="fas fa-times-circle"></i>';
            break;
        default:
            icon = '<i class="fas fa-info-circle"></i>';
    }
    
    alertDiv.innerHTML = `${icon} ${message}`;
    
    // Ajouter au document
    document.body.appendChild(alertDiv);
    
    // Supprimer après 3 secondes
    setTimeout(() => {
        alertDiv.style.animation = "fadeIn 0.3s ease-in-out reverse";
        setTimeout(() => {
            if (document.body.contains(alertDiv)) {
                document.body.removeChild(alertDiv);
            }
        }, 300);
    }, 3000);
}

// Initialiser la maintenance quand la page est active
document.addEventListener('DOMContentLoaded', function() {
    // Initialiser MQTT quand la page maintenance est activée
    document.addEventListener('pageChanged', function(e) {
        if (e.detail.page === 'maintenance') {
            if (!mqttClient) {
                initMQTTMaintenance();
            }
            // Mettre à jour l'heure toutes les secondes
            setInterval(updateCurrentTime, 1000);
        }
    });
});