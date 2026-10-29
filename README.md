# Brands & Comms Inventory Management Web App

A clean, responsive, single-user inventory management web app designed specifically for the Brands and Communications department. It uses **Google Sheets** as the secure, centralized cloud database while providing an intuitive web interface for managing stock on desktop and mobile.

---

## Features

- **Real-Time Stock Calculation**: Current inventory is calculated dynamically from transaction history:
  - **Receipts (+)** add stock.
  - **Distributions (-)** subtract stock.
  - **Adjustments (±)** correct stock by the stated amount.
- **Strict Stock Guard**: Distributions and negative adjustments are mathematically prevented from reducing stock below zero, both on the client and server.
- **Low-Stock & Out-of-Stock Alerts**: Visual badges instantly flag items at or below their reorder threshold or at zero units.
- **Transaction History & Mistake Correction**:
  - Full audit trail filterable by item, transaction type, date range, recipient, and event/reason.
  - **One-click Reversals**: Correct typos or mistaken entries by automatically recording an offsetting adjustment, preserving the full history without ever deleting past logs.
- **Desktop & Mobile Responsive**: Optimized touch controls, quick action shortcuts, and CSV export.
- **Zero Made-Up Records**: Starts completely clean. If the spreadsheet is empty, an "Add Your First Item" flow gets you started in seconds.
- **Secure by Design**: Google credentials remain strictly on the backend/server environment variables and are never exposed to browser code.

---

## Google Sheet Architecture

The app synchronizes with a Google Spreadsheet containing two tabs:

### 1. `Items` Tab
One row per inventory item:
| Column | Header | Description |
|---|---|---|
| A | `Item ID` | Unique ID (e.g., `ITEM-001`, `SWAG-MUG-01`) |
| B | `Item Name` | Descriptive name (e.g., `Matte Black Tote Bags`) |
| C | `Category` | Category (e.g., `Apparel`, `Drinkware`, `Stationery`) |
| D | `Unit of Measure` | Unit (e.g., `pcs`, `boxes`, `rolls`, `packs`) |
| E | `Low-Stock Threshold` | Alert count (e.g., `10`) |
| F | `Status` | `Active` or `Inactive` |

### 2. `Transactions` Tab
One row per transaction:
| Column | Header | Description |
|---|---|---|
| A | `Transaction ID` | Unique ID (e.g., `REC-20261029-XXXX`, `DIS-20261029-XXXX`) |
| B | `Date` | Date formatted as `YYYY-MM-DD` |
| C | `Item ID` | ID linking to the `Items` tab |
| D | `Transaction Type` | `Receipt`, `Distribution`, or `Adjustment` |
| E | `Quantity` | Positive integer for Receipts & Distributions; signed for Adjustments |
| F | `Recipient` | Who received the items (required for distributions) |
| G | `Event/Reason` | Event or purpose (e.g., `Brand Gala 2026`, `Audit Correction`) |
| H | `Notes` | Optional delivery notes, PO numbers, or comments |
| I | `Timestamp` | ISO 8601 creation timestamp |

---

## Step-by-Step Google Sheets Setup Guide

### Step 1: Create your Spreadsheet
1. Open [sheets.new](https://sheets.new) in your browser.
2. Title the sheet: **`Brands & Comms Inventory`**.
3. Note the **Spreadsheet ID** from the URL bar:
   ```
   https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                   (This is your Sheet ID)
   ```

### Step 2: Create a Google Cloud Service Account
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `brands-inventory`).
3. Enable the **Google Sheets API**:
   - Go to **APIs & Services > Library**.
   - Search for **Google Sheets API** and click **Enable**.
4. Create the Service Account:
   - Go to **IAM & Admin > Service Accounts**.
   - Click **Create Service Account**.
   - Name it (e.g., `inventory-manager`) and click **Done**.
5. Generate a Key:
   - Click on the created service account.
   - Go to the **Keys** tab > **Add Key** > **Create new key**.
   - Select **JSON** and download the file.
6. **Important — Share the Spreadsheet**:
   - Copy the service account's email address (looks like: `inventory-manager@your-project.iam.gserviceaccount.com`).
   - Open your Google Sheet, click the green **Share** button in the top right.
   - Paste the service account email and give it **Editor** permissions.

---

## Installation & Local Setup

### 1. Clone & Install Dependencies
```bash
git clone <your-repo-url>
cd "brands inventory"
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Open `.env` and configure your credentials:

#### Option A: Using the JSON Key File (Recommended for Local Dev)
Place your downloaded Google Cloud service account JSON file into the project root (e.g., `credentials.json`):
```env
PORT=3000
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
```

#### Option B: Using Direct Environment Variables (Recommended for Cloud Hosting)
```env
PORT=3000
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=inventory-manager@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIB...your private key...\n-----END PRIVATE KEY-----\n"
```

> **Note**: If no Google Sheets credentials are configured, the application automatically runs in a zero-config **Local Fallback Mode** (`data/local-inventory.json`), allowing you to test everything locally immediately!

---

## Running the App

### Start the production server:
```bash
npm start
```

### Start in development mode (with auto-reload):
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## Initializing Sheet Headers

When you launch the app with your Google Sheet credentials for the first time:
1. Navigate to the **Google Sheets Setup** tab in the web interface.
2. Click **"Initialize Sheet Tabs & Headers"**.
3. The app will automatically create both `Items` and `Transactions` tabs and set up all header columns in your Google Sheet!

---

## Deploying to Production

You can deploy this Node.js app to any modern hosting provider:

### Deploying to Render / Railway / Fly.io / Heroku:
1. Connect your Git repository.
2. Build command: `npm install`
3. Start command: `node server.js`
4. In the host's **Environment Variables** settings, add:
   - `GOOGLE_SPREADSHEET_ID`: Your Google Sheet ID.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Service account email.
   - `GOOGLE_PRIVATE_KEY`: Private key string (including `-----BEGIN PRIVATE KEY-----` and `\n` line breaks).

---

## Testing

Run the automated integration and stock rule test suite:
```bash
node test/verify.js
```
This tests:
- Stock deduction and receipt arithmetic.
- Zero-stock distribution prevention.
- Over-distribution prevention.
- Low-stock threshold triggers.
- Mistake corrections and audit-safe reversals.

