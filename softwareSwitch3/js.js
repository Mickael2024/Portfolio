document.addEventListener('DOMContentLoaded', function() {
    // Récupérer les éléments du DOM
    const wifiForm = document.getElementById('wifiForm');
    const ledSwitch = document.getElementById('ledSwitch');
    const ledStatus = document.getElementById('ledStatus');
    const wifiModeElement = document.getElementById('wifiMode');
    const ipAddressElement = document.getElementById('ipAddress');
    const macAddressElement = document.getElementById('macAddress');

    // Charger les informations du module
    fetch('/test')
        .then(response => response.text())
        .then(() => {
            // Si la connexion est OK, charger les infos
            updateModuleInfo();
        })
        .catch(error => {
            console.error('Erreur de connexion:', error);
        });

    // Gérer la soumission du formulaire WiFi
    wifiForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const ssid = document.getElementById('ssid').value;
        const password = document.getElementById('password').value;
        
        fetch(`/save?ssid=${encodeURIComponent(ssid)}&password=${encodeURIComponent(password)}`)
            .then(response => response.text())
            .then(data => {
                alert(data);
                if (data.includes("sauvegardée")) {
                    setTimeout(() => {
                        window.location.reload();
                    }, 3000);
                }
            })
            .catch(error => {
                console.error('Erreur:', error);
                alert('Erreur lors de la sauvegarde');
            });
    });

    // Gérer l'interrupteur LED
    ledSwitch.addEventListener('change', function() {
        const state = this.checked ? 'on' : 'off';
        
        fetch('/control', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `state=${state}`
        })
        .then(response => response.text())
        .then(data => {
            console.log(data);
            ledStatus.textContent = this.checked ? 'LED allumée' : 'LED éteinte';
        })
        .catch(error => {
            console.error('Erreur:', error);
            this.checked = !this.checked;
        });
    });

    // Mettre à jour les informations du module
    function updateModuleInfo() {
        fetch('/test')
            .then(() => {
                // Ces informations pourraient venir d'une API dédiée dans une version future
                wifiModeElement.textContent = window.location.hostname.includes('SmartSwitchC3') ? 'Point d\'accès' : 'Station WiFi';
                ipAddressElement.textContent = window.location.hostname;
                
                // Récupérer l'adresse MAC via le SSID
                const ssid = document.title.includes('SmartSwitchC3') ? 
                    document.title.split(' ')[0] : 'Non disponible';
                macAddressElement.textContent = ssid.split('-').pop() || 'Non disponible';
            });
    }
});