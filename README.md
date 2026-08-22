# BrandMe Community Access

Shopify app that automatically grants and revokes access to Discourse communities based on product purchases and refunds.

## How It Works

1. Merchant maps a **Shopify collection** to a **Discourse community**.
2. Products in the collection are synced automatically.
3. On purchase, the app sends an HMAC-signed request to the mapped Discourse community.
4. The Discourse plugin processes access based on the customer:

   - If the user does not exist, it sends an invite with the relevant private group access when required.
   - If the user already exists, it adds them to the relevant group when required.

5. On refund, the corresponding group access is revoked.
6. Failed deliveries are queued and retried automatically.

## Tech Stack

- **Frontend:** React Router + Shopify Polaris Web Components
- **Backend:** Node.js + React Router
- **Database:** SQLite + Prisma ORM
- **Proxy/TLS:** Caddy
- **Deployment:** Docker Compose

## Deployment

```bash id="4b2k8q"
cp .env.example .env
# Configure .env

docker compose up --build -d
```

To deploy updates:

```bash id="e9w3kp"
git pull
docker compose up --build -d
```

## Architecture

```text id="z7m1nr"
Shopify
   │
   │ Webhooks
   ▼
BrandMe Community Access
   │
   ├── Prisma / SQLite
   │
   └── HMAC-signed request
              │
              ▼
       Discourse Plugin
              │
              ▼
     Invite / Group Access
```

Failed Discourse deliveries are queued and retried automatically with exponential backoff.

## Discourse Plugin

Requires the companion `discourse-brandme-community-access` plugin on each connected Discourse community.

The **Shopify app maps collections to communities**, while the **Discourse plugin maps products to groups** and manages user access.
