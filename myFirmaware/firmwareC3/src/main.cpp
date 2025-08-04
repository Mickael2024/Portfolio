#include <Arduino.h>
#define ledVert 0
void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(ledVert, OUTPUT);
  digitalWrite(ledVert, HIGH); // Allume la LED verte (inversé sur certaines cartes)
}

void loop() {
  digitalWrite(LED_BUILTIN, LOW); 
   // Allume la LED (inversé sur certaines cartes)
  delay(1000);
  digitalWrite(LED_BUILTIN, HIGH);  // Éteint la LED
  delay(1000);
  Serial.println("Hello from Huzzah!");
}