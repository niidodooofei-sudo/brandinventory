/**
 * Brands & Comms Inventory Management App
 * Client-side Controller & UI State
 */

// Application State
const state = {
  items: [],
  transactions: [],
  activeTab: 'tab-inventory',
  currentTxnType: 'Receipt',
  selectedReversalTxn: null,
  backendStatus: null,
};

// --- DOM References ---
const elements = {
  // Stats
  statTotalItems: document.getElementById('stat-total-items'),
  statTotalStock: document.getElementById('stat-total-stock'),
  statLowStock: document.getElementById('stat-low-stock'),
  statOutStock: document.getElementById('stat-out-stock'),
  cardTotalItems: document.getElementById('card-total-items'),
  cardTotalStock: document.getElementById('card-total-stock'),
  cardLowStock: document.getElementById('card-low-stock'),
  cardOutStock: document.getElementById('card-out-stock'),

  // Header & Status
  connectionPill: document.getElementById('connection-pill'),
  connectionText: document.getElementById('connection-text'),
  btnOpenAddItem: document.getElementById('btn-open-add-item'),

  // Tabs
  navTabs: document.querySelectorAll('.nav-tab'),
  tabPanels: document.querySelectorAll('.tab-panel'),

  // Inventory Table
  inventorySearch: document.getElementById('inventory-search'),
  filterCategory: document.getElementById('filter-category'),
  filterStockStatus: document.getElementById('filter-stock-status'),
  inventoryTbody: document.getElementById('inventory-tbody'),
  inventoryEmptyState: document.getElementById('inventory-empty-state'),

  // Transaction Recording
  typePills: document.querySelectorAll('.type-pill'),
  recordTxnForm: document.getElementById('record-txn-form'),
  txnItemSelect: document.getElementById('txn-item-select'),
  txnItemStockHint: document.getElementById('txn-item-stock-hint'),
  txnQuantity: document.getElementById('txn-quantity'),
  labelTxnQuantity: document.getElementById('label-txn-quantity'),
  hintTxnQuantity: document.getElementById('hint-txn-quantity'),
  txnDate: document.getElementById('txn-date'),
  groupAdjustmentMode: document.getElementById('group-adjustment-mode'),
  groupRecipient: document.getElementById('group-recipient'),
  txnRecipient: document.getElementById('txn-recipient'),
  groupEventReason: document.getElementById('group-event-reason'),
  labelEventReason: document.getElementById('label-event-reason'),
  txnEventReason: document.getElementById('txn-event-reason'),
  txnNotes: document.getElementById('txn-notes'),
  btnSubmitTxn: document.getElementById('btn-submit-txn'),

  // History Table & Filters
  historyFilterItem: document.getElementById('history-filter-item'),
  historyFilterType: document.getElementById('history-filter-type'),
  historyFilterStart: document.getElementById('history-filter-start'),
  historyFilterEnd: document.getElementById('history-filter-end'),
  historyFilterSearch: document.getElementById('history-filter-search'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  btnResetHistoryFilters: document.getElementById('btn-reset-history-filters'),
  historyTbody: document.getElementById('history-tbody'),
  historyEmptyState: document.getElementById('history-empty-state'),

  // Settings & Setup
  settingsStatusBadge: document.getElementById('settings-status-badge'),
  settingsStatusMsg: document.getElementById('settings-status-msg'),
  settingsStatusDetails: document.getElementById('settings-status-details'),
  btnRecheckConnection: document.getElementById('btn-recheck-connection'),
  btnInitHeaders: document.getElementById('btn-init-headers'),

  // Modals
  modalAddItem: document.getElementById('modal-add-item'),
  addItemForm: document.getElementById('add-item-form'),
  modalReverse: document.getElementById('modal-reverse'),
  revOriginalId: document.getElementById('rev-original-id'),
  revOriginalItem: document.getElementById('rev-original-item'),
  revOriginalTypeQty: document.getElementById('rev-original-type-qty'),
  revCurrentStock: document.getElementById('rev-current-stock'),
  revOffsetEffect: document.getElementById('rev-offset-effect'),
  revReasonInput: document.getElementById('rev-reason-input'),
  btnConfirmReversal: document.getElementById('btn-confirm-reversal'),

  // Delete Modal
  modalDeleteItem: document.getElementById('modal-delete-item'),
  delItemName: document.getElementById('del-item-name'),
  delItemId: document.getElementById('del-item-id'),
  delItemStock: document.getElementById('del-item-stock'),
  btnConfirmDeleteItem: document.getElementById('btn-confirm-delete-item'),

  // Toast Container
  toastContainer: document.getElementById('toast-container'),
};

// --- Toast System ---
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div>${escapeHtml(message)}</div>
  `;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[tag] || tag));
}

// --- Initialization ---
async function initApp() {
  // Set default dates
  const today = new Date().toISOString().split('T')[0];
  elements.txnDate.value = today;

  setupEventListeners();
  await checkStatus();
  await refreshData();
}

function setupEventListeners() {
  // Navigation Tabs
  elements.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Stat card click shortcuts
  elements.cardLowStock.addEventListener('click', () => {
    switchTab('tab-inventory');
    elements.filterStockStatus.value = 'low';
    renderInventory();
  });

  elements.cardOutStock.addEventListener('click', () => {
    switchTab('tab-inventory');
    elements.filterStockStatus.value = 'out';
    renderInventory();
  });

  elements.cardTotalItems.addEventListener('click', () => {
    switchTab('tab-inventory');
    elements.filterStockStatus.value = 'all';
    renderInventory();
  });

  elements.connectionPill.addEventListener('click', () => {
    switchTab('tab-settings');
  });

  // Search & Filters on Inventory
  elements.inventorySearch.addEventListener('input', renderInventory);
  elements.filterCategory.addEventListener('change', renderInventory);
  elements.filterStockStatus.addEventListener('change', renderInventory);

  // Add Item Modal
  elements.btnOpenAddItem.addEventListener('click', openAddItemModal);
  elements.addItemForm.addEventListener('submit', handleAddItemSubmit);

  // Transaction Type Switcher
  elements.typePills.forEach(pill => {
    pill.addEventListener('click', () => {
      setTransactionType(pill.dataset.type);
    });
  });

  // Item selector in transaction form
  elements.txnItemSelect.addEventListener('change', updateItemHintAndConstraints);
  elements.txnQuantity.addEventListener('input', validateLiveDistributionQuantity);

  // Transaction form submit
  elements.recordTxnForm.addEventListener('submit', handleTransactionSubmit);

  // History Filters
  elements.historyFilterItem.addEventListener('change', fetchAndRenderHistory);
  elements.historyFilterType.addEventListener('change', fetchAndRenderHistory);
  elements.historyFilterStart.addEventListener('change', fetchAndRenderHistory);
  elements.historyFilterEnd.addEventListener('change', fetchAndRenderHistory);
  elements.historyFilterSearch.addEventListener('input', debounce(fetchAndRenderHistory, 300));

  elements.btnResetHistoryFilters.addEventListener('click', () => {
    elements.historyFilterItem.value = 'all';
    elements.historyFilterType.value = 'all';
    elements.historyFilterStart.value = '';
    elements.historyFilterEnd.value = '';
    elements.historyFilterSearch.value = '';
    fetchAndRenderHistory();
  });

  elements.btnExportCsv.addEventListener('click', exportTransactionsCsv);

  // Reversal Confirmation
  elements.btnConfirmReversal.addEventListener('click', handleConfirmReversal);

  // Delete Item Confirmation
  elements.btnConfirmDeleteItem.addEventListener('click', handleConfirmDeleteItem);

  // Settings Actions
  elements.btnRecheckConnection.addEventListener('click', async () => {
    elements.btnRecheckConnection.disabled = true;
    elements.btnRecheckConnection.textContent = 'Testing...';
    await checkStatus();
    elements.btnRecheckConnection.disabled = false;
    elements.btnRecheckConnection.textContent = 'Test Connection';
  });

  elements.btnInitHeaders.addEventListener('click', handleInitializeHeaders);
}

function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// --- Status & Google Sheets Check ---
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.backendStatus = data;

    elements.connectionPill.className = 'status-pill';
    elements.settingsStatusBadge.className = 'status-badge';

    if (data.mode === 'google-sheets' && data.connected) {
      elements.connectionPill.classList.add('status-pill-connected');
      elements.connectionText.textContent = 'Google Sheets Connected';
      elements.settingsStatusBadge.classList.add('connected');
      elements.settingsStatusBadge.textContent = 'Connected';
      elements.settingsStatusMsg.textContent = data.message;
      elements.settingsStatusDetails.innerHTML = `
        <strong>Spreadsheet ID:</strong> <code>${escapeHtml(data.spreadsheetId)}</code><br>
        All updates are saved live to your Google Sheet tabs (<em>Items</em> and <em>Transactions</em>).
      `;
    } else if (data.mode === 'google-sheets-error') {
      elements.connectionPill.classList.add('status-pill-error');
      elements.connectionText.textContent = 'Google Sheets Config Error';
      elements.settingsStatusBadge.classList.add('error');
      elements.settingsStatusBadge.textContent = 'Connection Error';
      elements.settingsStatusMsg.textContent = data.message;
      elements.settingsStatusDetails.innerHTML = `
        <strong>Spreadsheet ID:</strong> <code>${escapeHtml(data.spreadsheetId || 'Not set')}</code><br>
        Check the Google Cloud service account permissions, spreadsheet sharing, or your private key.
      `;
    } else {
      // Local fallback mode
      elements.connectionPill.classList.add('status-pill-local');
      elements.connectionText.textContent = 'Local Storage Mode';
      elements.settingsStatusBadge.classList.add('fallback');
      elements.settingsStatusBadge.textContent = 'Local Fallback';
      elements.settingsStatusMsg.textContent = 'Running with local file storage.';
      elements.settingsStatusDetails.innerHTML = `
        Google Sheets environment credentials are not detected yet. 
        All actions work smoothly in local storage mode until you configure your Google Sheet!
      `;
    }
  } catch (err) {
    elements.connectionPill.className = 'status-pill status-pill-error';
    elements.connectionText.textContent = 'Server Offline';
  }
}

async function handleInitializeHeaders() {
  elements.btnInitHeaders.disabled = true;
  elements.btnInitHeaders.textContent = 'Initializing...';
  try {
    const res = await fetch('/api/init-sheet', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Items and Transactions tabs initialized with headers in Google Sheet!', 'success');
      await checkStatus();
    } else {
      showToast(data.error || 'Failed to initialize sheet tabs', 'error');
    }
  } catch (err) {
    showToast('Network error initializing sheet', 'error');
  } finally {
    elements.btnInitHeaders.disabled = false;
    elements.btnInitHeaders.textContent = 'Initialize Sheet Tabs & Headers';
  }
}

// --- Data Refresh ---
async function refreshData() {
  await fetchItems();
  await fetchAndRenderHistory();
}

async function fetchItems() {
  try {
    const res = await fetch('/api/items');
    const result = await res.json();
    if (result.success) {
      state.items = result.data || [];
      updateStats();
      populateItemDropdowns();
      populateCategoryFilter();
      renderInventory();
    } else {
      showToast(result.error || 'Could not fetch items', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to backend server', 'error');
  }
}

function updateStats() {
  const totalItems = state.items.length;
  let totalStock = 0;
  let lowStockCount = 0;
  let outStockCount = 0;

  state.items.forEach(item => {
    const stock = Number(item.currentStock) || 0;
    totalStock += stock;
    if (item.isOutOfStock) {
      outStockCount++;
    } else if (item.isLowStock) {
      lowStockCount++;
    }
  });

  elements.statTotalItems.textContent = totalItems.toLocaleString();
  elements.statTotalStock.textContent = totalStock.toLocaleString();
  elements.statLowStock.textContent = lowStockCount.toLocaleString();
  elements.statOutStock.textContent = outStockCount.toLocaleString();
}

function populateCategoryFilter() {
  const currentVal = elements.filterCategory.value;
  const categories = Array.from(new Set(state.items.map(i => i.category).filter(Boolean))).sort();
  
  elements.filterCategory.innerHTML = '<option value="all">All Categories</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    elements.filterCategory.appendChild(opt);
  });

  if (categories.includes(currentVal)) {
    elements.filterCategory.value = currentVal;
  }
}

function populateItemDropdowns() {
  // Populate Transaction form selector
  const activeItems = state.items.filter(i => i.status !== 'Inactive');
  const currentTxnVal = elements.txnItemSelect.value;
  
  elements.txnItemSelect.innerHTML = '<option value="">-- Choose an item --</option>';
  activeItems.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.name} (${item.id}) [Available: ${item.currentStock} ${item.unit}]`;
    elements.txnItemSelect.appendChild(opt);
  });
  if (currentTxnVal) {
    elements.txnItemSelect.value = currentTxnVal;
  }

  // Populate History filter selector
  const currentHistVal = elements.historyFilterItem.value;
  elements.historyFilterItem.innerHTML = '<option value="all">All Items</option>';
  state.items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.name} (${item.id})`;
    elements.historyFilterItem.appendChild(opt);
  });
  if (currentHistVal) {
    elements.historyFilterItem.value = currentHistVal;
  }

  updateItemHintAndConstraints();
}

// --- Inventory Rendering ---
function renderInventory() {
  const search = elements.inventorySearch.value.trim().toLowerCase();
  const category = elements.filterCategory.value;
  const stockFilter = elements.filterStockStatus.value;

  const filtered = state.items.filter(item => {
    // Search
    const matchesSearch = !search || 
      item.name.toLowerCase().includes(search) || 
      item.id.toLowerCase().includes(search) ||
      (item.category || '').toLowerCase().includes(search);

    // Category
    const matchesCategory = category === 'all' || item.category === category;

    // Stock status
    let matchesStock = true;
    if (stockFilter === 'low') matchesStock = item.isLowStock;
    if (stockFilter === 'out') matchesStock = item.isOutOfStock;
    if (stockFilter === 'in') matchesStock = !item.isLowStock && !item.isOutOfStock;

    return matchesSearch && matchesCategory && matchesStock;
  });

  if (state.items.length === 0) {
    elements.inventoryTbody.innerHTML = '';
    elements.inventoryEmptyState.classList.remove('hidden');
    document.getElementById('empty-title').textContent = 'No inventory items found';
    document.getElementById('empty-subtitle').textContent = 'Your catalog is empty. Start by adding your first brand item.';
    return;
  }

  if (filtered.length === 0) {
    elements.inventoryTbody.innerHTML = '';
    elements.inventoryEmptyState.classList.remove('hidden');
    document.getElementById('empty-title').textContent = 'No matching items';
    document.getElementById('empty-subtitle').textContent = 'Try adjusting your search query or filters above.';
    return;
  }

  elements.inventoryEmptyState.classList.add('hidden');
  elements.inventoryTbody.innerHTML = filtered.map(item => {
    let stockBadge = '<span class="badge badge-in-stock">In Stock</span>';
    if (item.isOutOfStock) {
      stockBadge = '<span class="badge badge-out-stock">Out of Stock</span>';
    } else if (item.isLowStock) {
      stockBadge = `<span class="badge badge-low-stock">Low Stock (≤ ${item.lowStockThreshold})</span>`;
    }

    const statusBadge = item.status === 'Inactive' 
      ? '<span class="badge" style="background:#f3f4f6; color:#6b7280;">Inactive</span>'
      : '<span class="badge" style="background:#e0f2fe; color:#0284c7;">Active</span>';

    return `
      <tr>
        <td><code>${escapeHtml(item.id)}</code></td>
        <td style="font-weight: 600;">${escapeHtml(item.name)}</td>
        <td><span class="badge" style="background:#f3f4f6; color:#374151;">${escapeHtml(item.category || 'General')}</span></td>
        <td>
          <strong style="font-size: 1.05rem;">${item.currentStock.toLocaleString()}</strong> 
          <span style="color: var(--text-muted); font-size: 0.85rem;">${escapeHtml(item.unit)}</span>
          <div style="margin-top: 4px;">${stockBadge}</div>
        </td>
        <td>${escapeHtml(item.unit)}</td>
        <td>${item.lowStockThreshold}</td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="quickAction('${item.id}', 'Receipt')" title="Receive stock">
              + Receive
            </button>
            <button class="btn btn-secondary btn-sm" onclick="quickAction('${item.id}', 'Distribution')" title="Distribute to recipient" ${item.currentStock <= 0 ? 'disabled' : ''}>
              - Distribute
            </button>
            <button class="btn btn-outline btn-sm" onclick="quickAction('${item.id}', 'Adjustment')" title="Audit / Stock Adjustment">
              ± Adjust
            </button>
            <button class="btn btn-outline btn-sm btn-icon-danger" onclick="confirmDeleteItem('${item.id}')" title="Delete item from inventory">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Quick action from item row
window.quickAction = function(itemId, type) {
  switchTab('tab-record');
  setTransactionType(type);
  elements.txnItemSelect.value = itemId;
  updateItemHintAndConstraints();
  elements.txnQuantity.focus();
};

// --- Transaction Type Handling ---
function setTransactionType(type) {
  state.currentTxnType = type;
  elements.typePills.forEach(pill => {
    pill.classList.toggle('active', pill.dataset.type === type);
  });

  // Toggle mode-specific form sections
  if (type === 'Receipt') {
    elements.labelTxnQuantity.textContent = 'Quantity Received *';
    elements.hintTxnQuantity.textContent = 'Must be a positive integer';
    elements.groupAdjustmentMode.classList.add('hidden');
    elements.groupRecipient.classList.add('hidden');
    elements.txnRecipient.required = false;
    elements.groupEventReason.classList.add('hidden');
    elements.txnEventReason.required = false;
    elements.btnSubmitTxn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Save Stock Receipt
    `;
  } else if (type === 'Distribution') {
    elements.labelTxnQuantity.textContent = 'Quantity Distributed *';
    elements.groupAdjustmentMode.classList.add('hidden');
    elements.groupRecipient.classList.remove('hidden');
    elements.txnRecipient.required = true;
    elements.groupEventReason.classList.remove('hidden');
    elements.labelEventReason.textContent = 'Event or Distribution Reason *';
    elements.txnEventReason.placeholder = 'e.g. Annual Brand Summit 2026, VIP Press Kits, New Hire Kits';
    elements.txnEventReason.required = true;
    elements.btnSubmitTxn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Record Distribution
    `;
  } else if (type === 'Adjustment') {
    elements.labelTxnQuantity.textContent = 'Quantity to Adjust *';
    elements.hintTxnQuantity.textContent = 'Amount to increase or decrease';
    elements.groupAdjustmentMode.classList.remove('hidden');
    elements.groupRecipient.classList.add('hidden');
    elements.txnRecipient.required = false;
    elements.groupEventReason.classList.remove('hidden');
    elements.labelEventReason.textContent = 'Reason for Adjustment *';
    elements.txnEventReason.placeholder = 'e.g. Physical stock count reconciliation, Damaged box discarded, Found extra';
    elements.txnEventReason.required = true;
    elements.btnSubmitTxn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Apply Adjustment
    `;
  }

  updateItemHintAndConstraints();
}

function updateItemHintAndConstraints() {
  const selectedId = elements.txnItemSelect.value;
  const item = state.items.find(i => i.id === selectedId);

  if (!item) {
    elements.txnItemStockHint.textContent = '';
    elements.txnQuantity.removeAttribute('max');
    return;
  }

  const stock = item.currentStock;
  const unit = item.unit || 'units';

  if (state.currentTxnType === 'Distribution') {
    elements.txnItemStockHint.innerHTML = `
      Current available stock: <strong>${stock} ${escapeHtml(unit)}</strong>.
      ${stock <= 0 ? '<span style="color: var(--danger); font-weight:600;"> Out of stock! Cannot distribute.</span>' : ''}
    `;
    elements.txnQuantity.max = stock;
    elements.hintTxnQuantity.textContent = `Maximum allowed: ${stock} ${unit}`;
  } else if (state.currentTxnType === 'Receipt') {
    elements.txnItemStockHint.innerHTML = `Current stock: <strong>${stock} ${escapeHtml(unit)}</strong>. Stock will increase after this receipt.`;
    elements.txnQuantity.removeAttribute('max');
    elements.hintTxnQuantity.textContent = 'Must be a positive integer';
  } else {
    elements.txnItemStockHint.innerHTML = `Current stock: <strong>${stock} ${escapeHtml(unit)}</strong>.`;
    elements.txnQuantity.removeAttribute('max');
  }
}

function validateLiveDistributionQuantity() {
  if (state.currentTxnType !== 'Distribution') return;
  const selectedId = elements.txnItemSelect.value;
  const item = state.items.find(i => i.id === selectedId);
  if (!item) return;

  const qty = parseInt(elements.txnQuantity.value, 10);
  if (qty > item.currentStock) {
    elements.txnQuantity.setCustomValidity(`Cannot distribute more than ${item.currentStock} ${item.unit}.`);
    elements.hintTxnQuantity.innerHTML = `<span style="color:var(--danger); font-weight:600;">Exceeds available stock (${item.currentStock} ${item.unit})!</span>`;
  } else {
    elements.txnQuantity.setCustomValidity('');
    elements.hintTxnQuantity.textContent = `Maximum allowed: ${item.currentStock} ${item.unit}`;
  }
}

// --- Submit Transaction ---
async function handleTransactionSubmit(e) {
  e.preventDefault();
  const itemId = elements.txnItemSelect.value;
  const quantityVal = parseInt(elements.txnQuantity.value, 10);
  const date = elements.txnDate.value;
  const notes = elements.txnNotes.value.trim();

  if (!itemId) {
    showToast('Please select an item.', 'error');
    elements.txnItemSelect.focus();
    return;
  }

  if (isNaN(quantityVal) || quantityVal <= 0) {
    showToast('Please enter a valid positive quantity.', 'error');
    elements.txnQuantity.focus();
    return;
  }

  if (!date) {
    showToast('Please select a transaction date.', 'error');
    elements.txnDate.focus();
    return;
  }

  elements.btnSubmitTxn.disabled = true;

  try {
    let endpoint = '';
    let payload = {};

    if (state.currentTxnType === 'Receipt') {
      endpoint = '/api/transactions/receipt';
      payload = { itemId, quantity: quantityVal, date, notes };
    } else if (state.currentTxnType === 'Distribution') {
      const recipient = elements.txnRecipient.value.trim();
      const eventReason = elements.txnEventReason.value.trim();

      if (!recipient) {
        showToast('Please specify who received the items.', 'error');
        elements.txnRecipient.focus();
        elements.btnSubmitTxn.disabled = false;
        return;
      }
      if (!eventReason) {
        showToast('Please specify the event or distribution reason.', 'error');
        elements.txnEventReason.focus();
        elements.btnSubmitTxn.disabled = false;
        return;
      }

      endpoint = '/api/transactions/distribution';
      payload = { itemId, quantity: quantityVal, date, recipient, eventReason, notes };
    } else if (state.currentTxnType === 'Adjustment') {
      const direction = document.querySelector('input[name="adj-direction"]:checked')?.value || 'add';
      const signedQty = direction === 'subtract' ? -quantityVal : quantityVal;
      const eventReason = elements.txnEventReason.value.trim();

      if (!eventReason) {
        showToast('Please enter an adjustment reason.', 'error');
        elements.txnEventReason.focus();
        elements.btnSubmitTxn.disabled = false;
        return;
      }

      endpoint = '/api/transactions/adjustment';
      payload = { itemId, quantity: signedQty, date, eventReason, notes };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    if (!result.success) {
      showToast(result.error || 'Failed to record transaction', 'error');
      elements.btnSubmitTxn.disabled = false;
      return;
    }

    showToast(`Transaction ${result.data.id} recorded successfully!`, 'success');
    resetTxnForm();
    await refreshData();
    switchTab('tab-inventory');
  } catch (err) {
    showToast('Network error while recording transaction', 'error');
  } finally {
    elements.btnSubmitTxn.disabled = false;
  }
}

window.resetTxnForm = function() {
  elements.recordTxnForm.reset();
  const today = new Date().toISOString().split('T')[0];
  elements.txnDate.value = today;
  updateItemHintAndConstraints();
};

// --- Add Item Modal ---
window.openAddItemModal = function() {
  elements.addItemForm.reset();
  elements.modalAddItem.classList.remove('hidden');
  document.getElementById('item-name').focus();
};

window.closeAddItemModal = function() {
  elements.modalAddItem.classList.add('hidden');
};

async function handleAddItemSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('item-name').value.trim();
  const id = document.getElementById('item-id').value.trim();
  const category = document.getElementById('item-category').value.trim() || 'General';
  const unit = document.getElementById('item-unit').value.trim() || 'pcs';
  const lowStockThreshold = parseInt(document.getElementById('item-threshold').value, 10) || 0;
  const status = document.getElementById('item-status').value;
  const initialStock = parseInt(document.getElementById('item-initial-stock').value, 10) || 0;

  if (!name) {
    showToast('Item Name is required', 'error');
    return;
  }

  const submitBtn = elements.addItemForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name,
        category,
        unit,
        lowStockThreshold,
        status,
        initialStock,
      }),
    });

    const result = await res.json();
    if (result.success) {
      showToast(`Item "${result.data.name}" (${result.data.id}) added to inventory!`, 'success');
      closeAddItemModal();
      await refreshData();
    } else {
      showToast(result.error || 'Failed to add item', 'error');
    }
  } catch (err) {
    showToast('Network error adding item', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

// --- History Table & Reversals ---
async function fetchAndRenderHistory() {
  const itemId = elements.historyFilterItem.value !== 'all' ? elements.historyFilterItem.value : '';
  const type = elements.historyFilterType.value !== 'all' ? elements.historyFilterType.value : '';
  const startDate = elements.historyFilterStart.value;
  const endDate = elements.historyFilterEnd.value;
  const search = elements.historyFilterSearch.value.trim();

  const params = new URLSearchParams();
  if (itemId) params.append('itemId', itemId);
  if (type) params.append('type', type);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (search) params.append('search', search);

  try {
    const res = await fetch(`/api/transactions?${params.toString()}`);
    const result = await res.json();

    if (result.success) {
      state.transactions = result.data || [];
      renderHistoryTable();
    }
  } catch (err) {
    showToast('Failed to load transaction history', 'error');
  }
}

function renderHistoryTable() {
  if (state.transactions.length === 0) {
    elements.historyTbody.innerHTML = '';
    elements.historyEmptyState.classList.remove('hidden');
    return;
  }

  elements.historyEmptyState.classList.add('hidden');
  const itemsMap = {};
  state.items.forEach(i => { itemsMap[i.id] = i; });

  elements.historyTbody.innerHTML = state.transactions.map(txn => {
    const item = itemsMap[txn.itemId] || { name: txn.itemId, unit: '' };
    
    let typeBadge = '';
    let qtyDisplay = '';

    if (txn.type === 'Receipt') {
      typeBadge = '<span class="badge badge-receipt">+ Receipt</span>';
      qtyDisplay = `<strong style="color: #0369a1;">+${txn.quantity}</strong> ${escapeHtml(item.unit)}`;
    } else if (txn.type === 'Distribution') {
      typeBadge = '<span class="badge badge-distribution">- Distribution</span>';
      qtyDisplay = `<strong style="color: #6b21a8;">-${txn.quantity}</strong> ${escapeHtml(item.unit)}`;
    } else {
      typeBadge = '<span class="badge badge-adjustment">± Adjustment</span>';
      const sign = txn.quantity > 0 ? `+${txn.quantity}` : `${txn.quantity}`;
      const color = txn.quantity >= 0 ? '#0f766e' : '#b91c1c';
      qtyDisplay = `<strong style="color:${color};">${sign}</strong> ${escapeHtml(item.unit)}`;
    }

    return `
      <tr>
        <td style="white-space: nowrap;">${escapeHtml(txn.date)}</td>
        <td><code>${escapeHtml(txn.id)}</code></td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(item.name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(txn.itemId)}</div>
        </td>
        <td>${typeBadge}</td>
        <td>${qtyDisplay}</td>
        <td>${txn.recipient ? escapeHtml(txn.recipient) : '<span style="color: var(--text-muted);">&mdash;</span>'}</td>
        <td>${escapeHtml(txn.eventReason || '')}</td>
        <td style="font-size: 0.8rem; color: var(--text-secondary); max-width: 220px;">${escapeHtml(txn.notes || '')}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-outline btn-sm" onclick="openReverseModal('${escapeHtml(txn.id)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
            Reverse / Correct
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// --- Mistake Correction / Reversal Modal ---
window.openReverseModal = function(txnId) {
  const txn = state.transactions.find(t => t.id === txnId);
  if (!txn) {
    showToast('Transaction details not found', 'error');
    return;
  }

  const item = state.items.find(i => i.id === txn.itemId) || { name: txn.itemId, unit: 'units', currentStock: 0 };
  state.selectedReversalTxn = txn;

  elements.revOriginalId.textContent = txn.id;
  elements.revOriginalItem.textContent = `${item.name} (${txn.itemId})`;
  elements.revOriginalTypeQty.textContent = `${txn.type} of ${txn.quantity} ${item.unit} on ${txn.date}`;
  elements.revCurrentStock.textContent = `${item.currentStock} ${item.unit}`;

  let offsetMsg = '';
  if (txn.type === 'Distribution') {
    offsetMsg = `+${txn.quantity} ${item.unit} (Adds stock back to inventory)`;
  } else if (txn.type === 'Receipt') {
    offsetMsg = `-${txn.quantity} ${item.unit} (Deducts stock from inventory)`;
  } else {
    const opp = -Number(txn.quantity);
    offsetMsg = `${opp > 0 ? '+' : ''}${opp} ${item.unit}`;
  }

  elements.revOffsetEffect.textContent = offsetMsg;
  elements.revReasonInput.value = '';
  elements.modalReverse.classList.remove('hidden');
  elements.revReasonInput.focus();
};

window.closeReverseModal = function() {
  elements.modalReverse.classList.add('hidden');
  state.selectedReversalTxn = null;
};

async function handleConfirmReversal() {
  if (!state.selectedReversalTxn) return;
  const reason = elements.revReasonInput.value.trim();

  if (!reason) {
    showToast('Please provide a reason for the reversal.', 'error');
    elements.revReasonInput.focus();
    return;
  }

  elements.btnConfirmReversal.disabled = true;

  try {
    const res = await fetch(`/api/transactions/${state.selectedReversalTxn.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });

    const result = await res.json();
    if (result.success) {
      showToast(`Correction recorded (${result.data.id})! History preserved.`, 'success');
      closeReverseModal();
      await refreshData();
      await fetchAndRenderHistory();
    } else {
      showToast(result.error || 'Failed to reverse transaction', 'error');
    }
  } catch (err) {
    showToast('Network error during transaction reversal', 'error');
  } finally {
    elements.btnConfirmReversal.disabled = false;
  }
}

// --- Item Deletion ---
window.confirmDeleteItem = function(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }

  state.selectedDeleteItemId = itemId;
  elements.delItemName.textContent = item.name;
  elements.delItemId.textContent = item.id;
  elements.delItemStock.textContent = `${item.currentStock} ${item.unit || 'units'}`;

  elements.modalDeleteItem.classList.remove('hidden');
};

window.closeDeleteItemModal = function() {
  elements.modalDeleteItem.classList.add('hidden');
  state.selectedDeleteItemId = null;
};

async function handleConfirmDeleteItem() {
  if (!state.selectedDeleteItemId) return;
  const itemId = state.selectedDeleteItemId;

  elements.btnConfirmDeleteItem.disabled = true;

  try {
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    });

    const result = await res.json();
    if (result.success) {
      showToast(`Item "${result.data.name || itemId}" deleted from inventory.`, 'success');
      closeDeleteItemModal();
      await refreshData();
    } else {
      showToast(result.error || 'Failed to delete item', 'error');
    }
  } catch (err) {
    showToast('Network error deleting item', 'error');
  } finally {
    elements.btnConfirmDeleteItem.disabled = false;
  }
}

// --- CSV Export ---
function exportTransactionsCsv() {
  if (state.transactions.length === 0) {
    showToast('No transactions to export.', 'info');
    return;
  }

  const headers = ['Transaction ID', 'Date', 'Item ID', 'Transaction Type', 'Quantity', 'Recipient', 'Event/Reason', 'Notes', 'Timestamp'];
  const rows = state.transactions.map(t => [
    t.id,
    t.date,
    t.itemId,
    t.type,
    t.quantity,
    t.recipient ? `"${t.recipient.replace(/"/g, '""')}"` : '',
    t.eventReason ? `"${t.eventReason.replace(/"/g, '""')}"` : '',
    t.notes ? `"${t.notes.replace(/"/g, '""')}"` : '',
    t.timestamp || '',
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `inventory-transactions-${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// --- Tab Switching ---
function switchTab(tabId) {
  state.activeTab = tabId;
  elements.navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  elements.tabPanels.forEach(p => p.classList.toggle('active', p.id === tabId));
}

// Launch application on DOM Ready
document.addEventListener('DOMContentLoaded', initApp);

