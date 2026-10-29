const { google } = require('googleapis');

/**
 * Google Sheets Service Wrapper
 * Manages authentication and CRUD operations for:
 * - Items tab
 * - Transactions tab
 */
class GoogleSheetsService {
  constructor(config = {}) {
    let rawId = config.spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID || '';
    if (rawId.includes('/d/')) {
      const match = rawId.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) rawId = match[1];
    }
    this.spreadsheetId = rawId.trim();
    this.sheets = null;
    this.auth = null;
    this.isConfigured = false;
    this.initAuth(config);
  }

  initAuth(config = {}) {
    const keyPath = config.keyPath || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.SERVICE_ACCOUNT_KEY_PATH;
    const clientEmail = config.clientEmail || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = config.privateKey || process.env.GOOGLE_PRIVATE_KEY || '';
    if (privateKey) {
      privateKey = privateKey.trim();
      if ((privateKey.startsWith('"') && privateKey.endsWith('"')) ||
          (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
        privateKey = privateKey.slice(1, -1);
      }
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

    try {
      if (clientEmail && privateKey) {
        // Authenticate with environment variables directly
        this.auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey,
          scopes,
        });
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        this.isConfigured = Boolean(this.spreadsheetId);
      } else if (keyPath) {
        // Authenticate via service account JSON file
        this.auth = new google.auth.GoogleAuth({
          keyFile: keyPath,
          scopes,
        });
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        this.isConfigured = Boolean(this.spreadsheetId);
      } else {
        this.isConfigured = false;
      }
    } catch (err) {
      console.warn('Google Sheets authentication initialization warning:', err.message);
      this.isConfigured = false;
    }
  }

  /**
   * Check connection and ensure required tabs and headers exist.
   */
  async verifyAndInitialize() {
    if (!this.isConfigured) {
      return {
        connected: false,
        message: 'Google Sheets is not configured. Missing credentials or spreadsheet ID.',
      };
    }

    try {
      const meta = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const existingSheets = (meta.data.sheets || []).map(s => s.properties.title);
      const requiredTabs = ['Items', 'Transactions'];
      const missingTabs = requiredTabs.filter(t => !existingSheets.includes(t));

      if (missingTabs.length > 0) {
        const requests = missingTabs.map(title => ({
          addSheet: { properties: { title } },
        }));
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests },
        });
      }

      // Check and write header rows if missing
      await this.ensureHeaders();

      return {
        connected: true,
        title: meta.data.properties?.title || 'Inventory Spreadsheet',
        spreadsheetId: this.spreadsheetId,
        sheets: [...existingSheets, ...missingTabs],
      };
    } catch (err) {
      return {
        connected: false,
        message: err.message,
      };
    }
  }

  async ensureHeaders() {
    const itemHeaders = ['Item ID', 'Item Name', 'Category', 'Unit of Measure', 'Low-Stock Threshold', 'Status'];
    const txnHeaders = ['Transaction ID', 'Date', 'Item ID', 'Transaction Type', 'Quantity', 'Recipient', 'Event/Reason', 'Notes', 'Timestamp'];

    // Check Items headers
    const itemData = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Items!A1:F1',
    });
    if (!itemData.data.values || itemData.data.values.length === 0 || itemData.data.values[0].length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Items!A1:F1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [itemHeaders] },
      });
    }

    // Check Transactions headers
    const txnData = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Transactions!A1:I1',
    });
    if (!txnData.data.values || txnData.data.values.length === 0 || txnData.data.values[0].length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Transactions!A1:I1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [txnHeaders] },
      });
    }
  }

  /**
   * Fetch all items from the Items tab
   */
  async getItems() {
    if (!this.isConfigured) return [];
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Items!A2:F',
      });
      const rows = res.data.values || [];
      return rows.map(r => ({
        id: (r[0] || '').toString().trim(),
        name: (r[1] || '').toString().trim(),
        category: (r[2] || '').toString().trim(),
        unit: (r[3] || '').toString().trim(),
        lowStockThreshold: Number(r[4]) || 0,
        status: (r[5] || 'Active').toString().trim(),
      })).filter(item => item.id && item.name);
    } catch (err) {
      console.error('Error fetching items from Google Sheets:', err.message);
      throw err;
    }
  }

  /**
   * Add a new item to Items tab
   */
  async addItem(item) {
    if (!this.isConfigured) throw new Error('Google Sheets is not configured');
    const row = [
      item.id,
      item.name,
      item.category || 'General',
      item.unit || 'pcs',
      Number(item.lowStockThreshold) || 0,
      item.status || 'Active',
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: 'Items!A:F',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row],
      },
    });

    return item;
  }

  /**
   * Update an existing item in Items tab
   */
  async updateItem(id, updates) {
    if (!this.isConfigured) throw new Error('Google Sheets is not configured');
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Items!A2:F',
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => (r[0] || '').toString().trim() === id.toString().trim());

    if (rowIndex === -1) {
      throw new Error(`Item ${id} not found`);
    }

    const currentRow = rows[rowIndex];
    const updatedRow = [
      id,
      updates.name !== undefined ? updates.name : currentRow[1],
      updates.category !== undefined ? updates.category : currentRow[2],
      updates.unit !== undefined ? updates.unit : currentRow[3],
      updates.lowStockThreshold !== undefined ? Number(updates.lowStockThreshold) : Number(currentRow[4]),
      updates.status !== undefined ? updates.status : currentRow[5],
    ];

    const actualSheetRow = rowIndex + 2; // +2 for 1-based index and header row
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `Items!A${actualSheetRow}:F${actualSheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [updatedRow],
      },
    });

    return {
      id,
      name: updatedRow[1],
      category: updatedRow[2],
      unit: updatedRow[3],
      lowStockThreshold: Number(updatedRow[4]),
      status: updatedRow[5],
    };
  }

  /**
   * Delete an item row from Items tab
   */
  async deleteItem(id) {
    if (!this.isConfigured) throw new Error('Google Sheets is not configured');

    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const itemsSheetObj = (meta.data.sheets || []).find(s => s.properties.title === 'Items');
    if (!itemsSheetObj) {
      throw new Error("Items sheet tab not found");
    }
    const sheetId = itemsSheetObj.properties.sheetId;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Items!A2:F',
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => (r[0] || '').toString().trim() === id.toString().trim());

    if (rowIndex === -1) {
      throw new Error(`Item ${id} not found`);
    }

    // rowIndex in A2:F corresponds to row index (rowIndex + 1) in 0-based index
    const startRowIndex = rowIndex + 1;
    const endRowIndex = startRowIndex + 1;

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: startRowIndex,
                endIndex: endRowIndex,
              },
            },
          },
        ],
      },
    });

    return { id, success: true };
  }

  /**
   * Fetch all transactions from Transactions tab
   */
  async getTransactions() {
    if (!this.isConfigured) return [];
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Transactions!A2:I',
      });
      const rows = res.data.values || [];
      return rows.map(r => ({
        id: (r[0] || '').toString().trim(),
        date: (r[1] || '').toString().trim(),
        itemId: (r[2] || '').toString().trim(),
        type: (r[3] || '').toString().trim(),
        quantity: Number(r[4]) || 0,
        recipient: (r[5] || '').toString().trim(),
        eventReason: (r[6] || '').toString().trim(),
        notes: (r[7] || '').toString().trim(),
        timestamp: (r[8] || '').toString().trim(),
      })).filter(t => t.id && t.itemId);
    } catch (err) {
      console.error('Error fetching transactions from Google Sheets:', err.message);
      throw err;
    }
  }

  /**
   * Append a new transaction
   */
  async addTransaction(txn) {
    if (!this.isConfigured) throw new Error('Google Sheets is not configured');
    const row = [
      txn.id,
      txn.date,
      txn.itemId,
      txn.type,
      txn.quantity,
      txn.recipient || '',
      txn.eventReason || '',
      txn.notes || '',
      txn.timestamp || new Date().toISOString(),
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: 'Transactions!A:I',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row],
      },
    });

    return txn;
  }
}

module.exports = GoogleSheetsService;

