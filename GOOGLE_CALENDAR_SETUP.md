# Conectar o Google Agendas ao Plantão Pro

O código de conexão **já está pronto**. Para o botão "Conectar Google Agendas"
abrir a tela de permissão real do Google (em vez do modo demonstração), falta
apenas **criar as credenciais OAuth** no Google Cloud e colá-las no `.env`.

Tempo estimado: ~10 minutos. Não precisa de cartão de crédito.

---

## Passo 1 — Criar projeto no Google Cloud

1. Acesse https://console.cloud.google.com
2. No topo, clique no seletor de projeto → **Novo projeto**
3. Nome: `Plantao Pro` → **Criar**
4. Aguarde e selecione o projeto recém-criado

## Passo 2 — Habilitar a Google Calendar API

1. Menu (☰) → **APIs e serviços** → **Biblioteca**
2. Busque por **Google Calendar API**
3. Abra e clique em **Ativar**

## Passo 3 — Configurar a Tela de consentimento OAuth

1. **APIs e serviços** → **Tela de permissão OAuth**
2. Tipo de usuário: **Externo** → **Criar**
3. Preencha o mínimo:
   - **Nome do app**: `Plantão Pro`
   - **E-mail de suporte**: seu e-mail
   - **E-mail do desenvolvedor**: seu e-mail
4. **Salvar e continuar**
5. Em **Escopos**, clique **Adicionar escopos** → busque e marque:
   `.../auth/calendar.readonly` (somente leitura da agenda) → **Atualizar** → **Salvar e continuar**
6. Em **Usuários de teste**, clique **Adicionar usuários** e inclua
   **o seu e-mail do Google** (e de quem for testar). → **Salvar e continuar**

> Enquanto o app estiver em modo **"Testes"**, só os e-mails adicionados aqui
> conseguem conectar — e **sem precisar de verificação do Google**. Isso é
> suficiente para uso pessoal e validação (até 100 usuários).

## Passo 4 — Criar o OAuth Client ID

1. **APIs e serviços** → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**
2. Tipo de aplicativo: **Aplicativo da Web**
3. Nome: `Plantao Pro Web`
4. Em **Origens JavaScript autorizadas**, adicione **exatamente** as URLs de onde o app roda:
   - `http://localhost:5173` (desenvolvimento Vite)
   - a URL de produção quando publicar (ex.: `https://app.plantaopro.com.br`)
5. **Criar** → copie o **ID do cliente** (algo como
   `123456-abc.apps.googleusercontent.com`)

> ⚠️ **Não** precisa do "client secret" — o app usa o fluxo de token no
> navegador (Google Identity Services), que não expõe segredos.

## Passo 5 — Colar o Client ID no projeto

1. Na raiz do projeto, abra (ou crie) o arquivo **`.env`**
2. Adicione a linha:

```env
VITE_GOOGLE_CLIENT_ID=SEU_ID_AQUI.apps.googleusercontent.com
```

3. **Reinicie o servidor de desenvolvimento** (o Vite só lê o `.env` ao iniciar):

```bash
# Ctrl+C para parar e então:
npm run dev
```

## Passo 6 — Testar

1. Abra o app → aba **Calendário** → **Conectar Google Agendas**
2. Agora aparece o botão **"Conectar com o Google"** (em vez da demonstração)
3. Clique → abre o popup oficial do Google → escolha sua conta → **Permitir**
4. O app lê os eventos, identifica os plantões e mostra a lista para você importar

---

## Como funciona a conexão (resumo técnico)

```
[Você clica "Conectar com o Google"]
        ↓
Google Identity Services abre o popup de consentimento
        ↓
Usuário autoriza o escopo calendar.readonly
        ↓
App recebe um access token (fica só na memória do navegador)
        ↓
GET https://www.googleapis.com/calendar/v3/calendars/primary/events
        ↓
shiftParser.ts identifica quais eventos são plantões
        ↓
Você revisa e importa → vira plantão no Plantão Pro
```

- **Somente leitura**: o escopo `calendar.readonly` não permite alterar nem
  apagar nada na sua agenda do Google.
- **Privacidade**: o token não é salvo em disco nem enviado a nenhum servidor
  nosso; a leitura acontece direto no navegador → Google.

---

## Publicar para qualquer usuário (futuro)

Para liberar a conexão a **qualquer** pessoa (fora da lista de testes), será
preciso **publicar** o app na tela de consentimento. Como `calendar.readonly` é
um escopo **sensível**, o Google pede um processo de **verificação** (vídeo do
fluxo, política de privacidade publicada, domínio verificado). Isso só é
necessário quando for distribuir publicamente — para testes e uso próprio, o
modo "Testes" já resolve.

## Observação sobre o app mobile (Capacitor)

O fluxo acima funciona na versão **web/PWA**. No app empacotado com Capacitor
(WebView), o OAuth via popup pode exigir o plugin
`@capacitor/google-auth` ou abrir o consentimento no navegador do sistema.
Quando chegar a hora de empacotar para as lojas, adaptamos esse ponto — a
lógica de leitura e o parser (`shiftParser.ts`) permanecem idênticos.
