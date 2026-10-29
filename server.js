require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const store = require('./lib/dataStore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Status & Health ---
app.get('/api/status', async (req, res) => {
  try {
    const status = await store.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Initialize sheet headers
app.post('/api/init-sheet', async (req, res) => {
  try {
    if (!store.isSheetsConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'Google Sheets is not configured in environment variables.',
      });
    }
    const result = await store.sheetsService.verifyAndInitialize();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Items Endpoints ---
app.get('/api/items', async (req, res) => {
  try {
    const items = await store.getItemsWithStock();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const { id, name, category, unit, lowStockThreshold, status, initialStock } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Item name is required.' });
    }
    const newItem = await store.createItem({
      id,
      name,
      category,
      unit,
      lowStockThreshold,
      status,
      initialStock,
    });
    res.status(201).json({ success: true, data: newItem });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.patch('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = await store.updateItem(id, updates);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- Transactions Endpoints ---
app.get('/api/transactions', async (req, res) => {
  try {
    let txns = await store.getAllTransactions();
    const { itemId, type, startDate, endDate, recipient, search } = req.query;

    if (itemId) {
      txns = txns.filter(t => t.itemId.toLowerCase() === itemId.toLowerCase());
    }
    if (type && type !== 'all') {
      txns = txns.filter(t => t.type.toLowerCase() === type.toLowerCase());
    }
    if (startDate) {
      txns = txns.filter(t => t.date >= startDate);
    }
    if (endDate) {
      txns = txns.filter(t => t.date <= endDate);
    }
    if (recipient) {
      const q = recipient.toLowerCase();
      txns = txns.filter(t => (t.recipient || '').toLowerCase().includes(q));
    }
    if (search) {
      const q = search.toLowerCase();
      txns = txns.filter(
        t =>
          (t.id || '').toLowerCase().includes(q) ||
          (t.itemId || '').toLowerCase().includes(q) ||
          (t.recipient || '').toLowerCase().includes(q) ||
          (t.eventReason || '').toLowerCase().includes(q) ||
          (t.notes || '').toLowerCase().includes(q)
      );
    }

    // Sort newest transactions first
    txns.sort((a, b) => {
      const dateA = a.date + (a.timestamp || '');
      const dateB = b.date + (b.timestamp || '');
      return dateB.localeCompare(dateA);
    });

    res.json({ success: true, data: txns });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/transactions/receipt', async (req, res) => {
  try {
    const { itemId, quantity, date, notes } = req.body;
    const txn = await store.recordReceipt({ itemId, quantity, date, notes });
    res.status(201).json({ success: true, data: txn });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/transactions/distribution', async (req, res) => {
  try {
    const { itemId, quantity, date, recipient, eventReason, notes } = req.body;
    const txn = await store.recordDistribution({ itemId, quantity, date, recipient, eventReason, notes });
    res.status(201).json({ success: true, data: txn });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/transactions/adjustment', async (req, res) => {
  try {
    const { itemId, quantity, date, eventReason, notes } = req.body;
    const txn = await store.recordAdjustment({ itemId, quantity, date, eventReason, notes });
    res.status(201).json({ success: true, data: txn });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/transactions/:id/reverse', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const txn = await store.reverseTransaction(id, reason);
    res.status(201).json({ success: true, data: txn });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Fallback to index.html for SPA routes
app.use((req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(200).send('Brands & Comms Inventory API');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  Brands & Comms Inventory Server`);
    console.log(`  Running at: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
