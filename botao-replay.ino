/*
  Botão de Replay - ESP32 com portal de configuração via Wi-Fi
  ----------------------------------------------------------------
  Em vez de Wi-Fi/servidor fixos no código, este firmware abre um
  ponto de acesso próprio (ex: "BotaoReplay-Config") na primeira vez
  que liga (ou quando não consegue conectar ao Wi-Fi salvo). Você
  conecta o celular nesse ponto de acesso, uma página abre sozinha
  (portal cativo) pedindo: rede Wi-Fi + senha + IP do servidor local
  + porta + token de autorização (replay_token do Mini PC) + qual
  quadra é essa botoeira. Depois de salvar, o ESP32 reinicia já
  conectado, e guarda tudo na memória interna (não perde ao desligar).

  Para reconfigurar depois (ex: reinstalar em outro cliente/quadra):
  segure o BOTÃO FÍSICO DO PROJETO pressionado por 5 segundos seguidos
  enquanto o ESP32 já está ligado e funcionando normalmente — não
  precisa de nenhum botão da própria placa (BOOT/EN), já que esses
  ficam inacessíveis quando a botoeira estiver fechada dentro da caixa
  final instalada na quadra.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiManager.h>
#include <Preferences.h>

#define BOTAO_PIN 4

Preferences preferencias;
WiFiManager wm;

// Valores padrão/carregados da memória — o portal já vem preenchido
// com o último valor salvo, facilitando reconfiguração.
char servidorHost[40] = "192.168.1.100";
char servidorPorta[6] = "8080";
char quadraId[4] = "1";
char replayToken[65] = "";

bool precisaSalvarConfig = false;

bool botaoPressionado = false;
unsigned long ultimoTempoDebounce = 0;
const unsigned long tempoDebounce = 50; // 50ms — filtra ruído elétrico do contato físico

// Cooldown: tempo mínimo entre um replay e o próximo, mesmo que o
// aluno fique clicando várias vezes seguidas. Diferente do debounce
// acima (que é sobre RUÍDO ELÉTRICO em milissegundos), isso é sobre
// COMPORTAMENTO HUMANO em segundos — evita gerar vários replays
// quase idênticos da mesma jogada.
unsigned long ultimoEnvioReplay = 0;
const unsigned long tempoCooldownMs = 10000; // 10 segundos entre replays

// Long-press: segurar o botão por vários segundos SEGUIDOS, com o
// ESP32 já rodando normalmente, apaga o Wi-Fi salvo e reinicia — daí
// o portal de configuração abre sozinho no próximo boot. Esse é o
// método real de reconfiguração em campo, já que os botões físicos
// da própria placa (BOOT/EN) não ficam acessíveis com a botoeira
// fechada dentro da caixa final.
const unsigned long tempoSegurarParaResetMs = 5000; // 5 segundos
unsigned long inicioPressao = 0;
bool avisoJaMostrado = false;

// Protótipos das funções — declarados explicitamente aqui para
// garantir compilação correta em qualquer ambiente (Arduino IDE
// normalmente gera isso sozinho, mas é mais seguro declarar).
void callbackSalvarConfig();
void carregarConfigSalva();
void salvarConfig();
void enviarPostLocal();

// Chamado automaticamente pela WiFiManager quando o usuário salva o
// formulário do portal — só marca uma flag, o salvamento de verdade
// acontece no setup() depois que a conexão é confirmada.
void callbackSalvarConfig() {
  precisaSalvarConfig = true;
}

void carregarConfigSalva() {
  preferencias.begin("botao-replay", true); // true = somente leitura
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
  preferencias.begin("botao-replay", false); // false = leitura/escrita
  preferencias.putString("host", servidorHost);
  preferencias.putString("porta", servidorPorta);
  preferencias.putString("quadra", quadraId);
  preferencias.putString("token", replayToken);
  preferencias.end();
  Serial.println("Configuração salva na memória do ESP32.");
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(BOTAO_PIN, INPUT_PULLUP);

  carregarConfigSalva();

  // Se o botão estiver pressionado bem na inicialização, força reabrir
  // o portal — é o "modo reconfiguração" para quando for reinstalar
  // esta botoeira em outra quadra/cliente.
  bool forcarPortal = (digitalRead(BOTAO_PIN) == LOW);

  // Os campos que aparecem no formulário do portal, além dos campos
  // padrão de Wi-Fi (rede + senha) que a biblioteca já cuida sozinha.
  WiFiManagerParameter paramHost("host", "IP do servidor local", servidorHost, 40);
  WiFiManagerParameter paramPorta("porta", "Porta do servidor", servidorPorta, 6);
  WiFiManagerParameter paramQuadra("quadra", "ID da quadra (1, 2, 3...)", quadraId, 4);
  WiFiManagerParameter paramToken("token", "Token do servidor (replay_token)", replayToken, 64);

  wm.addParameter(&paramHost);
  wm.addParameter(&paramPorta);
  wm.addParameter(&paramQuadra);
  wm.addParameter(&paramToken);
  wm.setSaveConfigCallback(callbackSalvarConfig);
  wm.setConfigPortalTimeout(180); // desiste depois de 3 min sem ninguém configurar

  bool conectado;
  if (forcarPortal) {
    Serial.println("Botão pressionado na inicialização — abrindo portal de configuração...");
    conectado = wm.startConfigPortal("BotaoReplay-Config");
  } else {
    // autoConnect tenta o Wi-Fi salvo primeiro; só abre o portal
    // automaticamente se não conseguir conectar (ex: primeira vez).
    conectado = wm.autoConnect("BotaoReplay-Config");
  }

  if (!conectado) {
    Serial.println("Falha ao conectar e tempo do portal esgotado. Reiniciando...");
    delay(3000);
    ESP.restart();
  }

  Serial.println("\nConectado ao Wi-Fi!");
  Serial.print("IP do ESP32 na rede: ");
  Serial.println(WiFi.localIP());

  // Copia de volta os valores (possivelmente novos) digitados no portal
  strcpy(servidorHost, paramHost.getValue());
  strcpy(servidorPorta, paramPorta.getValue());
  strcpy(quadraId, paramQuadra.getValue());
  strncpy(replayToken, paramToken.getValue(), sizeof(replayToken) - 1);
  replayToken[sizeof(replayToken) - 1] = '\0';

  if (precisaSalvarConfig) {
    salvarConfig();
  }

  Serial.printf("Servidor configurado: %s:%s (quadra %s)\n", servidorHost, servidorPorta, quadraId);
  if (replayToken[0] == '\0') {
    Serial.println("Aviso: token de autorização vazio — o POST /replay será recusado (401).");
  }
}

void loop() {
  int leitura = digitalRead(BOTAO_PIN);
  unsigned long agora = millis();

  if (leitura == LOW) {
    // --- Botão pressionado ---
    if (!botaoPressionado) {
      // Início de uma nova pressão (só aceita depois do debounce
      // desde a última vez que o botão foi solto)
      if (agora - ultimoTempoDebounce > tempoDebounce) {
        botaoPressionado = true;
        inicioPressao = agora;
        avisoJaMostrado = false;
      }
    } else {
      // Já está pressionado — verifica se já virou pressão longa
      unsigned long duracaoPressao = agora - inicioPressao;

      if (!avisoJaMostrado && duracaoPressao > 2000) {
        Serial.println("Continue segurando para reconfigurar o Wi-Fi...");
        avisoJaMostrado = true;
      }

      if (duracaoPressao >= tempoSegurarParaResetMs) {
        Serial.println("\nBotão segurado por 5s — apagando configuração e reiniciando...");
        wm.resetSettings(); // apaga o Wi-Fi salvo pela WiFiManager
        delay(500);
        ESP.restart();
      }
    }
  } else {
    // --- Botão solto ---
    if (botaoPressionado) {
      unsigned long duracaoPressao = agora - inicioPressao;
      botaoPressionado = false;
      ultimoTempoDebounce = agora;

      // Só dispara o replay se foi um clique CURTO — se tivesse virado
      // pressão longa, o ESP.restart() já teria acontecido antes de
      // chegar aqui, então esse "else" nunca executa nesse caso.
      if (duracaoPressao < tempoSegurarParaResetMs) {
        if (agora - ultimoEnvioReplay >= tempoCooldownMs) {
          ultimoEnvioReplay = agora;
          Serial.println("\nBotão acionado na quadra!");
          enviarPostLocal();
        } else {
          unsigned long faltamMs = tempoCooldownMs - (agora - ultimoEnvioReplay);
          Serial.printf("\nBotão apertado, mas ainda em cooldown. Aguarde %lu s.\n", faltamMs / 1000 + 1);
        }
      }
    }
  }
}

void enviarPostLocal() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;

    // Timeout curto para o código não travar se a rede cair
    http.setTimeout(3000);

    String url = "http://" + String(servidorHost) + ":" + String(servidorPorta) + "/replay";
    http.begin(client, url);
    http.addHeader("Authorization", "Bearer " + String(replayToken));
    http.addHeader("Content-Type", "application/json");

    // Formato compatível com o endpoint /replay do servidor local
    String jsonDados = "{\"quadra_id\": " + String(quadraId) + ", \"acao\": \"replay\"}";

    int httpResponseCode = http.POST(jsonDados);

    if (httpResponseCode == 401) {
      Serial.println("POST recusado (401): token de autorização inválido");
    } else if (httpResponseCode > 0) {
      Serial.printf("POST enviado com sucesso! Código: %d\n", httpResponseCode);
    } else {
      Serial.printf("Erro ao enviar POST: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
  } else {
    Serial.println("Erro: Sem conexão Wi-Fi no momento do clique!");
    // Opcional: acender um LED vermelho de erro na botoeira aqui
  }
}
