// debug-mqtt.js
console.log('=== DEBUG MQTT ===');
console.log('window.mqtt disponible?', typeof mqtt !== 'undefined');
console.log('Page active:', document.querySelector('.page.active')?.id);

// Tester la connexion MQTT directement
function testMQTTConnection() {
    console.log('Test de connexion MQTT...');
    
    const options = {
        username: "smart_l1",
        password: "Fortico1234",
        clientId: "debug_" + Date.now()
    };
    
    const client = mqtt.connect("wss://e59af3ed375b42f6ad6c44f423c06a66.s1.eu.hivemq.cloud:8884/mqtt", options);
    
    client.on('connect', () => {
        console.log('✅ DEBUG: Connecté avec succès!');
        client.subscribe('#');
        client.end(); // Se déconnecter après le test
    });
    
    client.on('error', (err) => {
        console.error('❌ DEBUG: Erreur de connexion:', err);
    });
}

// Exécuter le test après 1 seconde
setTimeout(testMQTTConnection, 1000);