# WhatsApp Bot (Baileys)

A WhatsApp automation bot built with [Baileys](https://github.com/WhiskeySockets/Baileys) that connects to your WhatsApp account and forwards incoming messages to a backend of your choice (n8n, Make.com, Zapier, a custom API, etc.). The backend can send replies back through the bot.

## How It Works

```
WhatsApp message → Bot → Your backend (n8n / FastAPI / Zapier / Make.com)
                                     ↓
                        Backend decides the reply
                                     ↓
                  Backend calls the bot's /send endpoint → WhatsApp
```

The bot exposes:
- A **web page** at `/` — shows a QR code to link your WhatsApp account, and shows connection status once linked.
- A **POST endpoint** at `/send` — your backend calls this to send a WhatsApp reply.
- It also **forwards every incoming WhatsApp message** to a webhook URL you configure.

## Prerequisites

- Node.js 20 or higher
- A WhatsApp account (recommended: a secondary/test number, not your primary number)
- A backend to process messages: n8n, Make.com, Zapier, a custom API (FastAPI, Express, etc.), or anything that can receive a webhook and call an HTTP endpoint
- A hosting platform to deploy the bot (Render, Railway, Fly.io, etc.)

## Setup

### 1. Clone and install

```bash
git clone <this-repo-url>
cd whatsapp-bot
npm install
```

### 2. Set your backend webhook URL

Open `index.js` and update this line with your backend's webhook URL — this is where every incoming WhatsApp message will be sent:

```javascript
const N8N_WEBHOOK_URL = 'https://your-backend-url.com/webhook/whatsapp'
```

This works with any backend — n8n, Make.com, Zapier, a custom FastAPI/Express server, etc. The variable name mentions n8n, but you can point it anywhere.

### 3. Run locally (optional, for testing)

```bash
node index.js
```

Open `http://localhost:3000` in your browser, scan the QR code with WhatsApp (**Settings > Linked Devices > Link a Device**), and confirm the page shows "Connected."

## Deployment

This bot can be deployed to any Node.js-compatible hosting platform (Render, Railway, Fly.io, etc.). General steps:

1. Push this code to a GitHub repository.
2. Create a new **Web Service** on your hosting platform and connect it to the repo.
3. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
4. Deploy. Once live, open the hosted URL in your browser (e.g. `https://your-app.onrender.com`) — a QR code will appear.
5. Scan the QR code with WhatsApp to link the account. The page will update to show "Connected" once linked.

> **Note on free-tier hosting:** Most free hosting plans use temporary storage. If the service restarts or redeploys, the saved WhatsApp session may be lost, and you'll need to open the hosted URL again and re-scan the QR code. For a persistent session across restarts, use a plan with persistent disk/volume storage.

## Connecting a Backend

### Option A: n8n

1. Add a **Webhook** node as the trigger:
   - **HTTP Method:** POST
   - **Path:** anything you like, e.g. `whatsapp`
   - Copy the **Production URL** (not the Test URL) once your workflow is activated — this is the URL you put in `N8N_WEBHOOK_URL` in `index.js`.
2. Build your logic after the webhook (e.g. an AI node, conditions, etc.).
3. Add an **HTTP Request** node to send the reply back to the bot:
   - **Method:** POST
   - **URL:** `https://your-bot-url.com/send`
   - **Body Content Type:** JSON
   - **Body:**
     ```json
     {
       "to": "{{ $json.body.from }}",
       "message": "Your reply text here"
     }
     ```
   - `from` is the sender's WhatsApp ID included in every message the bot forwards.
4. Activate the workflow so the Production URL stays live.

### Option B: Make.com

1. Create a scenario starting with a **Custom Webhook** module. Copy its URL into `N8N_WEBHOOK_URL`.
2. Add your processing logic (AI modules, routers, etc.).
3. Add an **HTTP > Make a Request** module to call the bot:
   - **URL:** `https://your-bot-url.com/send`
   - **Method:** POST
   - **Body type:** JSON
   - **Body:** `{ "to": "<sender id>", "message": "<your reply>" }`
4. Turn the scenario on.

### Option C: Zapier

1. Create a Zap with a **Webhooks by Zapier (Catch Hook)** trigger. Copy the generated URL into `N8N_WEBHOOK_URL`.
2. Add your processing steps.
3. Add a **Webhooks by Zapier (POST)** action:
   - **URL:** `https://your-bot-url.com/send`
   - **Payload Type:** JSON
   - **Data:** `to` = sender ID from the trigger step, `message` = your reply text
4. Publish the Zap.

### Option D: Custom Backend (FastAPI example)

If you'd rather run your own backend instead of an automation tool, here's a minimal FastAPI example that receives the forwarded message and returns a reply, which you can then send back to the bot.

**1. Set up the project:**

```bash
mkdir fastapi-backend
cd fastapi-backend
python -m venv venv
```

Activate the virtual environment:
- Windows: `venv\Scripts\activate`
- Mac/Linux: `source venv/bin/activate`

Install dependencies:

```bash
pip install fastapi uvicorn httpx
```

**2. Create `main.py`:**

```python
from fastapi import FastAPI
from pydantic import BaseModel
import httpx

app = FastAPI()

# The bot's /send endpoint (your deployed bot URL)
BOT_SEND_URL = "https://your-bot-url.com/send"

class IncomingMessage(BaseModel):
    from_: str
    senderName: str = ""
    messageText: str = ""

    class Config:
        fields = {"from_": "from"}

@app.post("/webhook/whatsapp")
async def handle_message(payload: dict):
    sender = payload.get("from")
    text = payload.get("messageText", "")

    print(f"Message from {sender}: {text}")

    reply_text = "This is an automated reply from the FastAPI backend."

    async with httpx.AsyncClient() as client:
        await client.post(BOT_SEND_URL, json={
            "to": sender,
            "message": reply_text
        })

    return {"status": "received"}

@app.get("/")
async def root():
    return {"status": "FastAPI backend is running"}
```

**3. Run it:**

```bash
uvicorn main:app --reload
```

**4. Point the bot at it:**

Deploy this FastAPI app (Render, Railway, etc.) and set its public URL as `N8N_WEBHOOK_URL` in `index.js`:

```javascript
const N8N_WEBHOOK_URL = 'https://your-fastapi-backend.com/webhook/whatsapp'
```

## API Reference (this bot)

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Shows the QR code to link WhatsApp, or connection status |
| `/send` | POST | Sends a WhatsApp message. Body: `{ "to": "<id>", "message": "<text>" }` |

## Notes

- Use a secondary/test WhatsApp number where possible — this connects through an unofficial method, so account restrictions are possible with high-volume or unsolicited messaging.
- Add reasonable delays and avoid messaging users who haven't messaged you first, to reduce risk.
- Keep `auth_info` out of version control (already handled by `.gitignore`) — it contains your session credentials.
