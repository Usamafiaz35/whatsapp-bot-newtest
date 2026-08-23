const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const qrcode = require('qrcode')
const express = require('express')

const N8N_WEBHOOK_URL = 'https://shaziafiaz35.app.n8n.cloud/webhook/whatsapp'
const PORT = process.env.PORT || 3000

let globalSock = null
let currentQR = null
let connectionStatus = 'Connecting...'

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')

    const sock = makeWASocket({
        auth: state
    })

    globalSock = sock

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            currentQR = qr
            connectionStatus = 'Waiting for QR scan'
            console.log('QR code generated. Open the web page to scan it.')
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) &&
                lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut

            connectionStatus = 'Disconnected'
            console.log('Connection closed. Reconnecting:', shouldReconnect)

            if (shouldReconnect) {
                startBot()
            } else {
                console.log('Logged out. Please scan the QR code again.')
            }
        } else if (connection === 'open') {
            currentQR = null
            connectionStatus = 'Connected'
            console.log('WhatsApp connected successfully!')
        }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return

        const messageText =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''

        const payload = {
            from: msg.key.remoteJid,
            senderName: msg.pushName || '',
            messageText: messageText,
            timestamp: msg.messageTimestamp,
            rawMessage: msg
        }

        console.log('New message received, forwarding to n8n:', messageText)

        try {
            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            console.log('Forwarded to n8n, status:', response.status)
        } catch (error) {
            console.log('Error forwarding to n8n:', error.message)
        }
    })
}

startBot()

// ===== Web server: QR display page + send endpoint =====
const app = express()
app.use(express.json())

// Home page: shows QR code to scan, or connection status
app.get('/', async (req, res) => {
    if (connectionStatus === 'Connected') {
        return res.send(`
            <html>
                <head><title>WhatsApp Bot Status</title></head>
                <body style="font-family: sans-serif; text-align: center; margin-top: 100px;">
                    <h1 style="color: green;">✅ WhatsApp is Connected</h1>
                    <p>The bot is running and listening for messages.</p>
                </body>
            </html>
        `)
    }

    if (currentQR) {
        const qrImageDataUrl = await qrcode.toDataURL(currentQR)
        return res.send(`
            <html>
                <head>
                    <title>Scan QR Code</title>
                    <meta http-equiv="refresh" content="20">
                </head>
                <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                    <h1>Scan this QR code with WhatsApp</h1>
                    <p>WhatsApp > Linked Devices > Link a Device</p>
                    <img src="${qrImageDataUrl}" width="300" height="300" />
                    <p style="color: gray;">This page refreshes automatically every 20 seconds.</p>
                </body>
            </html>
        `)
    }

    res.send(`
        <html>
            <head><meta http-equiv="refresh" content="5"></head>
            <body style="font-family: sans-serif; text-align: center; margin-top: 100px;">
                <h1>Loading...</h1>
                <p>Status: ${connectionStatus}</p>
            </body>
        </html>
    `)
})

// Endpoint that n8n calls to send a reply message
app.post('/send', async (req, res) => {
    const { to, message } = req.body

    if (!to || !message) {
        return res.status(400).json({ error: 'Both "to" and "message" fields are required' })
    }

    try {
        await globalSock.sendMessage(to, { text: message })
        console.log('Reply sent to:', to)
        res.json({ success: true })
    } catch (error) {
        console.log('Error sending reply:', error.message)
        res.status(500).json({ error: error.message })
    }
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
