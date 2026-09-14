/*
  Botão de Replay - ESP32 com deep sleep e portal de configuração
  ----------------------------------------------------------------
  O ESP32 dorme a maior parte do tempo para economizar as pilhas.
  Acorda só quando o botão da quadra é pressionado (clique = replay)
  ou 1x por dia (heartbeat: avisa o Mini PC que a botoeira está viva).
  Depois da tarefa, desliga o Wi-Fi e volta a dormir.

  Na primeira vez (ou sem Wi-Fi salvo), abre o ponto de acesso
  "BotaoReplay-Config". Conecte o celular, preencha rede + senha +
  IP/porta do servidor + token + ID da quadra. A config fica na
  memória interna.

  Para reconfigurar em campo: segure o BOTÃO DA QUADRA por 5 segundos
  no clique que acorda a placa. Falha de Wi-Fi num clique/heartbeat
  NÃO abre o portal — só dorme de novo, para não gastar bateria.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <esp_sleep.h>
#include <driver/rtc_io.h>
#include <sys/time.h>

#define BOTAO_PIN 4
#define HEARTBEAT_US (24ULL * 60ULL * 60ULL * 1000000ULL)

Preferences preferencias;
WiFiManager wm;

// Valores padrão/carregados da memória — o portal já vem preenchido
// com o último valor salvo, facilitando reconfiguração.
char servidorHost[40] = "192.168.1.100";
char servidorPorta[6] = "8080";
char quadraId[4] = "1";
char replayToken[65] = "";

bool precisaSalvarConfig = false;

const unsigned long tempoDebounce = 50;
const uint32_t tempoCooldownSec = 10;
const unsigned long tempoSegurarParaResetMs = 5000;

// Relógio RTC sobrevive ao deep sleep (sem NTP). Usado só no cooldown
// entre cliques, para o millis() zerado a cada wake não liberar disparo.
RTC_DATA_ATTR uint32_t ultimoEnvioReplaySec = 0;

void callbackSalvarConfig();
void carregarConfigSalva();
void salvarConfig();
uint32_t rtcSegundos();
bool emCooldown();
void marcarCooldown();
void prepararPinoBotao();
void entrarDeepSleep();
bool botaoSeguradoParaReset();
bool conectarWifiRapido();
bool conectarComPortal(bool forcarPortal);
void copiarParametrosPortal(WiFiManagerParameter& paramHost,
                             WiFiManagerParameter& paramPorta,
                             WiFiManagerParameter& paramQuadra,
                             WiFiManagerParameter& paramToken);
void enviarPostLocal(const char* acao);

void callbackSalvarConfig() {
  precisaSalvarConfig = true;
}

void carregarConfigSalva() {
  preferencias.begin("botao-replay", true);
  String host = preferencias.getString("host", servidorHost);
  String porta = preferencias.getString("porta", servidorPorta);
  String quadra = preferencias.getString("quadra", quadraId);
  String token = preferencias.getString("token", replayToken);
  preferencias.end();

  host.toCharArray(servidorHost, sizeof(servidorHost));
  porta.toCharArray(servidorPorta, sizeof(servidorPorta));
  quadra.toCharArray(quadraId, sizeof(quadraId));
  token.toCharArray(replayToken, sizeof(replayToken));
}

void salvarConfig() {
  preferencias.begin("botao-replay", false);
  preferencias.putString("host", servidorHost);
  preferencias.putString("porta", servidorPorta);
  preferencias.putString("quadra", quadraId);
  preferencias.putString("token", replayToken);
  preferencias.end();
  Serial.println("Configuração salva na memória do ESP32.");
}

uint32_t rtcSegundos() {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return (uint32_t)tv.tv_sec;
}

bool emCooldown() {
  if (ultimoEnvioReplaySec == 0) {
    return false;
  }
  return (rtcSegundos() - ultimoEnvioReplaySec) < tempoCooldownSec;
}

void marcarCooldown() {
  ultimoEnvioReplaySec = rtcSegundos();
}

void prepararPinoBotao() {
  rtc_gpio_deinit((gpio_num_t)BOTAO_PIN);
  pinMode(BOTAO_PIN, INPUT_PULLUP);
}

void entrarDeepSleep() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  delay(50);

  rtc_gpio_init((gpio_num_t)BOTAO_PIN);
  rtc_gpio_set_direction((gpio_num_t)BOTAO_PIN, RTC_GPIO_MODE_INPUT_ONLY);
  rtc_gpio_pullup_en((gpio_num_t)BOTAO_PIN);
  rtc_gpio_pulldown_dis((gpio_num_t)BOTAO_PIN);
  esp_sleep_enable_ext0_wakeup((gpio_num_t)BOTAO_PIN, 0);
  esp_sleep_enable_timer_wakeup(HEARTBEAT_US);

  Serial.println("Entrando em deep sleep...");
  Serial.flush();
  esp_deep_sleep_start();
}

bool botaoSeguradoParaReset() {
  unsigned long inicio = millis();
  bool avisoJaMostrado = false;

  delay(tempoDebounce);

  while (digitalRead(BOTAO_PIN) == LOW) {
    unsigned long duracao = millis() - inicio;

    if (!avisoJaMostrado && duracao > 2000) {
      Serial.println("Continue segurando para reconfigurar o Wi-Fi...");
      avisoJaMostrado = true;
    }

    if (duracao >= tempoSegurarParaResetMs) {
      return true;
    }
    delay(10);
  }

  return false;
}

bool conectarWifiRapido() {
  WiFi.mode(WIFI_STA);
  WiFi.begin();

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    delay(200);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Falha ao conectar no Wi-Fi salvo. Voltando a dormir.");
    return false;
  }

  Serial.print("Conectado. IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

void copiarParametrosPortal(WiFiManagerParameter& paramHost,
                             WiFiManagerParameter& paramPorta,
                             WiFiManagerParameter& paramQuadra,
                             WiFiManagerParameter& paramToken) {
  strcpy(servidorHost, paramHost.getValue());
  strcpy(servidorPorta, paramPorta.getValue());
  strcpy(quadraId, paramQuadra.getValue());
  strncpy(replayToken, paramToken.getValue(), sizeof(replayToken) - 1);
  replayToken[sizeof(replayToken) - 1] = '\0';
}

bool conectarComPortal(bool forcarPortal) {
  WiFiManagerParameter paramHost("host", "IP do servidor local", servidorHost, 40);
  WiFiManagerParameter paramPorta("porta", "Porta do servidor", servidorPorta, 6);
  WiFiManagerParameter paramQuadra("quadra", "ID da quadra (1, 2, 3...)", quadraId, 4);
  WiFiManagerParameter paramToken("token", "Token do servidor (replay_token)", replayToken, 64);

  wm.addParameter(&paramHost);
  wm.addParameter(&paramPorta);
  wm.addParameter(&paramQuadra);
  wm.addParameter(&paramToken);
  wm.setSaveConfigCallback(callbackSalvarConfig);
  wm.setConfigPortalTimeout(180);

  bool conectado;
  if (forcarPortal) {
    Serial.println("Abrindo portal de configuração...");
    conectado = wm.startConfigPortal("BotaoReplay-Config");
  } else {
    conectado = wm.autoConnect("BotaoReplay-Config");
  }

  if (!conectado) {
    Serial.println("Falha ao conectar e tempo do portal esgotado. Dormindo...");
    return false;
  }

  Serial.println("\nConectado ao Wi-Fi!");
  Serial.print("IP do ESP32 na rede: ");
  Serial.println(WiFi.localIP());

  copiarParametrosPortal(paramHost, paramPorta, paramQuadra, paramToken);

  if (precisaSalvarConfig) {
    salvarConfig();
  }

  Serial.printf("Servidor configurado: %s:%s (quadra %s)\n", servidorHost, servidorPorta, quadraId);
  if (replayToken[0] == '\0') {
    Serial.println("Aviso: token de autorização vazio — o POST /replay será recusado (401).");
  }

  return true;
}

void enviarPostLocal(const char* acao) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Erro: Sem conexão Wi-Fi no momento do envio!");
    return;
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(3000);

  String url = "http://" + String(servidorHost) + ":" + String(servidorPorta) + "/replay";
  http.begin(client, url);
  http.addHeader("Authorization", "Bearer " + String(replayToken));
  http.addHeader("Content-Type", "application/json");

  String jsonDados = "{\"quadra_id\": " + String(quadraId) + ", \"acao\": \"" + String(acao) + "\"}";
  int httpResponseCode = http.POST(jsonDados);

  if (httpResponseCode == 401) {
    Serial.println("POST recusado (401): token de autorização inválido");
  } else if (httpResponseCode > 0) {
    Serial.printf("POST enviado com sucesso! Código: %d\n", httpResponseCode);
  } else {
    Serial.printf("Erro ao enviar POST: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(200);

  prepararPinoBotao();
  carregarConfigSalva();

  esp_sleep_wakeup_cause_t causa = esp_sleep_get_wakeup_cause();

  if (causa == ESP_SLEEP_WAKEUP_EXT0) {
    Serial.println("Wake: botão");

    if (botaoSeguradoParaReset()) {
      Serial.println("\nBotão segurado por 5s — apagando configuração...");
      wm.resetSettings();
      delay(500);
      conectarComPortal(true);
      entrarDeepSleep();
    }

    if (emCooldown()) {
      Serial.println("Botão apertado, mas ainda em cooldown. Dormindo.");
      entrarDeepSleep();
    }

    if (!conectarWifiRapido()) {
      entrarDeepSleep();
    }

    Serial.println("\nBotão acionado na quadra!");
    enviarPostLocal("replay");
    marcarCooldown();
    entrarDeepSleep();
  }

  if (causa == ESP_SLEEP_WAKEUP_TIMER) {
    Serial.println("Wake: heartbeat diário");

    if (!conectarWifiRapido()) {
      entrarDeepSleep();
    }

    enviarPostLocal("heartbeat");
    entrarDeepSleep();
  }

  // Power-on / reset: portal só na 1ª vez, Wi-Fi ausente, ou botão
  // já preso neste boot (reconfiguração com a caixa aberta).
  bool forcarPortal = (digitalRead(BOTAO_PIN) == LOW);
  if (forcarPortal) {
    Serial.println("Botão pressionado na inicialização — abrindo portal de configuração...");
  }

  conectarComPortal(forcarPortal);
  entrarDeepSleep();
}

void loop() {
  entrarDeepSleep();
}
