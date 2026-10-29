const fs = require('fs');
const path = require('path');
const GoogleSheetsService = require('./googleSheets');

class InventoryDataStore {
  constructor() {
    this.inMemoryData = { items: [], transactions: [] };
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    this.localFilePath = isServerless
      ? path.join('/tmp', 'local-inventory.json')
      : path.join(__dirname, '..', 'data', 'local-inventory.json');
    this.sheetsService = new GoogleSheetsService();
    this.initLocalStore();
  }

  initLocalStore() {
    try {
      const dir = path.dirname(this.localFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.localFilePath)) {
        fs.writeFileSync(
          this.localFilePath,
          JSON.stringify({ items: [], transactions: [] }, null, 2),
          'utf-8'
        );
      }
    } catch (err) {
      console.warn('Filesystem access fallback to in-memory store:', err.message);
    }
  }

  getLocalData() {
    try {
      if (fs.existsSync(this.localFilePath)) {
        const raw = fs.readFileSync(this.localFilePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      // fallback
    }
    return this.inMemoryData;
  }

  saveLocalData(data) {
    try {
      fs.writeFileSync(this.localFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      this.inMemoryData = data;
    }
  }

  isSheetsConfigured() {
    return this.sheetsService.isConfigured;
  }

  async getStatus() {
    if (this.sheetsService.isConfigured) {
      const verify = await this.sheetsService.verifyAndInitialize();
      return {
        mode: verify.connected ? 'google-sheets' : 'google-sheets-error',
        connected: verify.connected,
        message: verify.connected
          ? `Connected to Google Sheet "${verify.title}"`
          : `Google Sheets connection issue: ${verify.message}`,
        spreadsheetId: this.sheetsService.spreadsheetId,
      };
    } else {
      return {
        mode: 'local-fallback',
        connected: false,
        message: 'Running in local fallback mode (no Google Sheets credentials configured).',
        spreadsheetId: null,
      };
    }
  }

  // --- Core Read Methods ---

  async getAllItems() {
    if (this.sheetsService.isConfigured) {
      return await this.sheetsService.getItems();
    }
    const data = this.getLocalData();
    return data.items || [];
  }

  async getAllTransactions() {
    if (this.sheetsService.isConfigured) {
      return await this.sheetsService.getTransactions();
    }
    const data = this.getLocalData();
    return data.transactions || [];
  }

  /**
   * Calculates current stock for all items from transaction history.
   * Receipts add stock, distributions subtract stock, adjustments change by stated amount.
   */
  async getStockMap() {
    const transactions = await this.getAllTransactions();
    const stockMap = {};

    for (const t of transactions) {
      const id = t.itemId;
      if (!stockMap[id]) {
        stockMap[id] = {
          currentStock: 0,
          totalReceived: 0,
          totalDistributed: 0,
          totalAdjusted: 0,
        };
      }

      const qty = Number(t.quantity) || 0;
      if (t.type === 'Receipt') {
        stockMap[id].currentStock += qty;
        stockMap[id].totalReceived += qty;
      } else if (t.type === 'Distribution') {
        stockMap[id].currentStock -= qty;
        stockMap[id].totalDistributed += qty;
      } else if (t.type === 'Adjustment') {
        stockMap[id].currentStock += qty;
        stockMap[id].totalAdjusted += qty;
      }
    }

    return stockMap;
  }

  async getCurrentStock(itemId) {
    const map = await this.getStockMap();
    return map[itemId] ? map[itemId].currentStock : 0;
  }

  /**
   * Return items decorated with dynamic stock levels & low-stock alerts
   */
  async getItemsWithStock() {
    const [items, stockMap] = await Promise.all([
      this.getAllItems(),
      this.getStockMap(),
    ]);

    return items.map(item => {
      const stats = stockMap[item.id] || {
        currentStock: 0,
        totalReceived: 0,
        totalDistributed: 0,
        totalAdjusted: 0,
      };
      const stock = stats.currentStock;
      const threshold = Number(item.lowStockThreshold) || 0;

      return {
        ...item,
        currentStock: stock,
        totalReceived: stats.totalReceived,
        totalDistributed: stats.totalDistributed,
        totalAdjusted: stats.totalAdjusted,
        isOutOfStock: stock <= 0,
        isLowStock: stock > 0 && stock <= threshold,
      };
    });
  }

  // --- Core Write Methods ---

  async createItem(itemInput) {
    if (!itemInput.name || !itemInput.name.trim()) {
      throw new Error('Item name is required');
    }

    const items = await this.getAllItems();
    const cleanName = itemInput.name.trim();

    // Generate Item ID if not supplied or format existing
    let id = itemInput.id ? itemInput.id.trim().toUpperCase() : '';
    if (!id) {
      // Generate ID e.g. ITEM-001
      const count = items.length + 1;
      id = `ITEM-${String(count).padStart(3, '0')}`;
      while (items.some(i => i.id === id)) {
        id = `ITEM-${String(Math.floor(100 + Math.random() * 900))}`;
      }
    }

    if (items.some(i => i.id.toLowerCase() === id.toLowerCase())) {
      throw new Error(`An item with ID "${id}" already exists`);
    }

    const newItem = {
      id,
      name: cleanName,
      category: (itemInput.category || 'General').trim(),
      unit: (itemInput.unit || 'pcs').trim(),
      lowStockThreshold: Math.max(0, parseInt(itemInput.lowStockThreshold, 10) || 0),
      status: itemInput.status === 'Inactive' ? 'Inactive' : 'Active',
    };

    if (this.sheetsService.isConfigured) {
      await this.sheetsService.addItem(newItem);
    } else {
      const data = this.getLocalData();
      data.items.push(newItem);
      this.saveLocalData(data);
    }

    // If an initial stock was specified upon creation, log it as an initial Receipt
    if (itemInput.initialStock && Number(itemInput.initialStock) > 0) {
      await this.recordReceipt({
        itemId: newItem.id,
        quantity: Number(itemInput.initialStock),
        date: itemInput.date || new Date().toISOString().split('T')[0],
        notes: 'Initial inventory record on item creation',
      });
    }

    return newItem;
  }

  async updateItem(id, updates) {
    if (this.sheetsService.isConfigured) {
      return await this.sheetsService.updateItem(id, updates);
    }
    const data = this.getLocalData();
    const index = data.items.findIndex(i => i.id === id);
    if (index === -1) {
      throw new Error(`Item "${id}" not found`);
    }
    const current = data.items[index];
    const updated = {
      ...current,
      ...updates,
      id: current.id, // ID cannot be mutated
    };
    data.items[index] = updated;
    this.saveLocalData(data);
    return updated;
  }

  async deleteItem(id) {
    const items = await this.getAllItems();
    const item = items.find(i => i.id === id);
    if (!item) {
      throw new Error(`Item "${id}" not found`);
    }

    if (this.sheetsService.isConfigured) {
      await this.sheetsService.deleteItem(id);
    } else {
      const data = this.getLocalData();
      data.items = data.items.filter(i => i.id !== id);
      this.saveLocalData(data);
    }

    return item;
  }

  // --- Transactions ---

  generateTransactionId(prefix = 'TXN') {
    const d = new Date();
    const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${dateStr}-${rand}`;
  }

  async recordTransaction(txn) {
    if (this.sheetsService.isConfigured) {
      return await this.sheetsService.addTransaction(txn);
    }
    const data = this.getLocalData();
    data.transactions.push(txn);
    this.saveLocalData(data);
    return txn;
  }

  /**
   * Record items received (Receipt)
   */
  async recordReceipt({ itemId, quantity, date, notes }) {
    if (!itemId) throw new Error('Item is required');
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      throw new Error('Quantity received must be a positive integer');
    }

    const items = await this.getAllItems();
    const item = items.find(i => i.id === itemId);
    if (!item) {
      throw new Error(`Item "${itemId}" does not exist`);
    }

    const txn = {
      id: this.generateTransactionId('REC'),
      date: date || new Date().toISOString().split('T')[0],
      itemId,
      type: 'Receipt',
      quantity: qty,
      recipient: '',
      eventReason: 'Stock Received / Purchase',
      notes: (notes || '').trim(),
      timestamp: new Date().toISOString(),
    };

    return await this.recordTransaction(txn);
  }

  /**
   * Record items distributed
   * Validates:
   * - required fields: item, quantity, recipient, eventReason, date
   * - quantity must not reduce current stock below zero
   */
  async recordDistribution({ itemId, quantity, date, recipient, eventReason, notes }) {
    if (!itemId) throw new Error('Item is required');
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      throw new Error('Quantity distributed must be a positive integer');
    }
    if (!recipient || !recipient.trim()) {
      throw new Error('Recipient ("Who it was given to") is required');
    }
    if (!eventReason || !eventReason.trim()) {
      throw new Error('Event or Reason is required');
    }

    const items = await this.getAllItems();
    const item = items.find(i => i.id === itemId);
    if (!item) {
      throw new Error(`Item "${itemId}" does not exist`);
    }

    // Stock check
    const currentStock = await this.getCurrentStock(itemId);
    if (currentStock < qty) {
      throw new Error(
        `Cannot distribute ${qty} ${item.unit || 'units'}. Current available stock is only ${currentStock} ${item.unit || 'units'}.`
      );
    }

    const txn = {
      id: this.generateTransactionId('DIS'),
      date: date || new Date().toISOString().split('T')[0],
      itemId,
      type: 'Distribution',
      quantity: qty,
      recipient: recipient.trim(),
      eventReason: eventReason.trim(),
      notes: (notes || '').trim(),
      timestamp: new Date().toISOString(),
    };

    return await this.recordTransaction(txn);
  }

  /**
   * Record adjustment / correction
   * Signed quantity: positive to add stock, negative to subtract stock.
   * Ensures stock will not drop below zero if negative!
   */
  async recordAdjustment({ itemId, quantity, date, eventReason, notes }) {
    if (!itemId) throw new Error('Item is required');
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty === 0) {
      throw new Error('Adjustment quantity cannot be zero');
    }
    if (!eventReason || !eventReason.trim()) {
      throw new Error('Reason for adjustment is required');
    }

    const items = await this.getAllItems();
    const item = items.find(i => i.id === itemId);
    if (!item) {
      throw new Error(`Item "${itemId}" does not exist`);
    }

    // Check if negative adjustment causes stock to fall below zero
    const currentStock = await this.getCurrentStock(itemId);
    if (currentStock + qty < 0) {
      throw new Error(
        `Adjustment would reduce stock below zero. Current stock is ${currentStock} ${item.unit || 'units'}, but adjustment is ${qty}.`
      );
    }

    const txn = {
      id: this.generateTransactionId('ADJ'),
      date: date || new Date().toISOString().split('T')[0],
      itemId,
      type: 'Adjustment',
      quantity: qty,
      recipient: '',
      eventReason: eventReason.trim(),
      notes: (notes || '').trim(),
      timestamp: new Date().toISOString(),
    };

    return await this.recordTransaction(txn);
  }

  /**
   * Reverse a past transaction to correct a mistake while preserving original history.
   * If reversing a Distribution of 5: records an Adjustment of +5.
   * If reversing a Receipt of 10: records an Adjustment of -10 (validates stock >= 10).
   * If reversing an Adjustment: inverts the sign of quantity.
   */
  async reverseTransaction(transactionId, reason = '') {
    const transactions = await this.getAllTransactions();
    const original = transactions.find(t => t.id === transactionId);
    if (!original) {
      throw new Error(`Transaction "${transactionId}" not found`);
    }

    const items = await this.getAllItems();
    const item = items.find(i => i.id === original.itemId);
    const unit = item ? item.unit || 'units' : 'units';
    const itemName = item ? item.name : original.itemId;

    let adjustmentQty = 0;
    if (original.type === 'Distribution') {
      // Original subtracted stock, reversal adds it back
      adjustmentQty = Math.abs(Number(original.quantity));
    } else if (original.type === 'Receipt') {
      // Original added stock, reversal subtracts it
      adjustmentQty = -Math.abs(Number(original.quantity));
    } else if (original.type === 'Adjustment') {
      // Invert sign
      adjustmentQty = -Number(original.quantity);
    } else {
      throw new Error(`Unknown transaction type "${original.type}"`);
    }

    // Validate stock if reversing reduces stock
    const currentStock = await this.getCurrentStock(original.itemId);
    if (currentStock + adjustmentQty < 0) {
      throw new Error(
        `Cannot reverse transaction: Doing so would reduce stock for "${itemName}" below zero (Current stock: ${currentStock} ${unit}, needed: ${Math.abs(adjustmentQty)} ${unit}).`
      );
    }

    const reversalReason = reason.trim()
      ? `Reversal of ${original.id} (${reason.trim()})`
      : `Reversal of ${original.id} [${original.type}: ${original.eventReason || original.recipient || ''}]`;

    const notes = `Original transaction: ${original.id} (${original.type} of ${original.quantity} on ${original.date}). Preserved in history.`;

    const txn = {
      id: this.generateTransactionId('REV'),
      date: new Date().toISOString().split('T')[0],
      itemId: original.itemId,
      type: 'Adjustment',
      quantity: adjustmentQty,
      recipient: '',
      eventReason: reversalReason,
      notes,
      timestamp: new Date().toISOString(),
    };

    return await this.recordTransaction(txn);
  }
}

module.exports = new InventoryDataStore();

