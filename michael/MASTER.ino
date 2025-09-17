
///////////////////////// Code write by Jean fortuno //////////////////////////

//        mise à jour 25/09/2024
// __________________________________________WARNING 
/*
TACHE NON FINI: 25/09/2024
-Réception variable envoyé par les slaves
 */

#include <ESP8266WiFi.h>
#include <ESPAsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <espnow.h>

#define L_Switch D2
#define L_Switch1 D3
#define maintient D7
#define ledPin D4

String value;
bool lws_status;
bool old_lws_status;
bool lws_status1;
bool old_lws_status1;
const char* ssid = "Fortico2";
const char* password = "Fortico.2";

bool ledState = 0;
bool receivedLedState;

bool alarmState;// pour l'alarme

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// Define the MAC address of the slave ESP8266
uint8_t slaveMacAddr[] = {0x52, 0x02, 0x91, 0x5A, 0x22, 0xEA};  // Slave 3


// Limitation du nombre de clients WebSocket
const int maxClients = 10;

const char index_html[] PROGMEM = R"rawliteral(
/////html

)rawliteral";

//________________________Slave_Receve
void OnDataRecv(uint8_t *mac, uint8_t *data, uint8_t len) {
  

  // ______________Slave 3__________
 if (memcmp(mac, slaveMacAddr, 6) == 0) {
    memcpy(&receivedLedState, data, sizeof(receivedLedState));
    Serial.print("État de la LED de l'esclave 3 reçu : ");
      if (receivedLedState== HIGH) {
      Serial.println("A1");
      value = "A1";
    } else {
      Serial.println("B1");
      value = "B1";
    }
  }
  notifyClients();
}//___________________fin slave recev

void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);
  pinMode(maintient, OUTPUT);
  pinMode(L_Switch, INPUT_PULLUP);
  pinMode(L_Switch1, INPUT_PULLUP);

  WiFi.mode(WIFI_STA);
  WiFi.softAP(ssid, password);
  IPAddress apIP(192, 168, 4, 1);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));

  Serial.println("Création du point d'accès Wi-Fi...");
  Serial.println("Point d'accès Wi-Fi créé !");
  Serial.print("Adresse IP du point d'accès : ");
  Serial.println(WiFi.softAPIP());
  if (esp_now_init() != 0) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }
  else Serial.println("ESP-NOW ok");
  //____________________________________________ pour définir les roles des modules
  esp_now_set_self_role(ESP_NOW_ROLE_CONTROLLER);

  esp_now_add_peer(slaveMacAddr, ESP_NOW_ROLE_SLAVE, 1, NULL, 0);

  esp_now_register_recv_cb(OnDataRecv);

  initWebSocket();

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send_P(200, "text/html", index_html, processor);
  });

  server.begin();
}

void loop() {
  digitalWrite(maintient, HIGH);
  lws_status = digitalRead(L_Switch);
  lws_status1 = digitalRead(L_Switch1);

  if (lws_status != old_lws_status) {
    ledState = !ledState;
    notifyClients();
    old_lws_status = lws_status;
  }
  else if (lws_status1 != old_lws_status1) {
    ledState = !ledState;
    notifyClients();
    old_lws_status1 = lws_status1;
  }

  ws.cleanupClients();
  digitalWrite(ledPin, ledState);
//Serial.println(value);

if (ledState == HIGH) value = '1';
else value = '0';
}
//_____________________________________fonction pour notifier les clients
void notifyClients() {
  ws.textAll(String(value));

}

void handleWebSocketMessage(void *arg, uint8_t *data, size_t len) {
  AwsFrameInfo *info = (AwsFrameInfo*)arg;
  if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
    data[len] = 0;
     String message = String((char *)data);
    // controle All
    if (strcmp((char*)data, "toggleAll") == 0) {
      ledState = !ledState;
      notifyClients();
       uint8_t msg[] = {0xFF};  // Message to toggle LED on slave
      esp_now_send(slaveMacAddr, msg, sizeof(msg));

    }
     else if (strcmp((char*)data, "toggle") == 0) {
      ledState = !ledState;
      notifyClients();
    }
    //___________________________fonction de mise à jour
     else if(strcmp((char*)data, "firsttoggle") == 0){
     //_________________________bouton3
    //__________________________AlarmSysteme
      if (alarmState== HIGH) {
      value = "OFF";
      notifyClients();
    } else {
      value = "ON";
      notifyClients();
    }
    
      notifyClients();
    }
    
    else if (strcmp((char*)data, "toggle_slave1") == 0) {
      uint8_t msg[] = {0xFF};  // Message to toggle LED on slave
      esp_now_send(slaveMacAddr, msg, sizeof(msg));
      Serial.println("envoyer au slave");
    }
     else if (message == "formatageSlave") {

      notifyClients();
      uint8_t msg[] = { 0xEF };
      esp_now_send(slaveMacAddr, msg, sizeof(msg));
    }
    }
   } 
    //____________________________________Code pour le vérou
   

void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type,
             void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
      if (ws.count() >= maxClients) {
        client->close();
        Serial.println("Client disconnected: maximum clients reached");
      }
      break;
    case WS_EVT_DISCONNECT:
      Serial.printf("WebSocket client #%u disconnected\n", client->id());
      break;
    case WS_EVT_DATA:
      handleWebSocketMessage(arg, data, len);
      break;
    case WS_EVT_PONG:
    case WS_EVT_ERROR:
      Serial.printf("WebSocket error: client #%u\n", client->id());
      break;
  }
}

void initWebSocket() {
  ws.onEvent(onEvent);
  server.addHandler(&ws);
}

String processor(const String& var) {
  if (var == "STATE") {
    return (ledState) ? "OFF" : "ON";
  }
  return String();
}
