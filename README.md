<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# DR Salgados - Cardápio Digital

Cardápio digital premium interativo em tempo real para a lanchonete DR Salgados, com carrinho, pedidos via WhatsApp e painel administrativo completo.

## Run Locally

**Prerequisites:** Node.js (or Bun)

1. Install dependencies:
   `npm install` (or `bun install`)
2. Copy `.env.example` to `.env.local` and set your `GEMINI_API_KEY` (if using Gemini features)
3. Configure Firebase credentials in `firebase-applet-config.json` and in the Firebase config block inside `index.html` (search for `YOUR_FIREBASE_...`)
4. Run the app:
   `npm run dev`

## Important Security Notes

- Replace all placeholder values (`YOUR_FIREBASE_*`, etc.) with your own Firebase project credentials.
- Never commit real API keys, secrets, or production credentials.
- The default admin password is `1234` — change it immediately in production.
- Firestore rules in this project are currently open (`allow read, write: if true`). Restrict them for production use.
