const assert = require('assert');
const store = require('../lib/dataStore');

async function testInventoryLogic() {
  console.log('--- Testing Inventory Logic & Stock Rules ---');

  // 1. Verify Status
  const status = await store.getStatus();
  console.log('Initial Status:', status);
  assert.ok(status.mode, 'Status must report mode');

  // 2. Add an item
  const item = await store.createItem({
    id: 'TEST-MUG-001',
    name: 'Ceramic Brand Mug',
    category: 'Drinkware',
    unit: 'pcs',
    lowStockThreshold: 10,
    status: 'Active',
  });
  console.log('Created Item:', item);
  assert.strictEqual(item.id, 'TEST-MUG-001');

  // Check initial stock is 0
  let stock = await store.getCurrentStock('TEST-MUG-001');
  assert.strictEqual(stock, 0, 'Initial stock without initialStock should be 0');

  // 3. Test Stock Distribution on 0 stock must fail
  try {
    await store.recordDistribution({
      itemId: 'TEST-MUG-001',
      quantity: 5,
      date: '2026-10-29',
      recipient: 'Conference Speakers',
      eventReason: 'VIP Speaker Welcome',
    });
    assert.fail('Distribution on zero stock should have thrown an error!');
  } catch (err) {
    console.log('✓ Successfully blocked distribution on zero stock:', err.message);
    assert.ok(err.message.includes('Cannot distribute'));
  }

  // 4. Record Receipt of 20 items
  const recTxn = await store.recordReceipt({
    itemId: 'TEST-MUG-001',
    quantity: 20,
    date: '2026-10-29',
    notes: 'Restock shipment PO-9901',
  });
  console.log('Recorded Receipt:', recTxn);

  stock = await store.getCurrentStock('TEST-MUG-001');
  assert.strictEqual(stock, 20, 'Stock after receiving 20 items should be 20');

  // 5. Record Distribution of 8 items
  const distTxn = await store.recordDistribution({
    itemId: 'TEST-MUG-001',
    quantity: 8,
    date: '2026-10-29',
    recipient: 'Leadership Offsite',
    eventReason: 'Executive Welcome Kits',
    notes: 'Delivered to room 402',
  });
  console.log('Recorded Distribution:', distTxn);

  stock = await store.getCurrentStock('TEST-MUG-001');
  assert.strictEqual(stock, 12, 'Stock after distributing 8 items should be 12 (20 - 8)');

  // 6. Test Exceeding Distribution (distribute 15 when only 12 left) -> must fail
  try {
    await store.recordDistribution({
      itemId: 'TEST-MUG-001',
      quantity: 15,
      date: '2026-10-29',
      recipient: 'Press Event',
      eventReason: 'Press Briefing',
    });
    assert.fail('Should not allow distribution exceeding 12 items!');
  } catch (err) {
    console.log('✓ Successfully blocked distribution exceeding stock:', err.message);
    assert.ok(err.message.includes('Cannot distribute 15'));
  }

  // 7. Check low stock threshold alert (threshold is 10, current is 12 -> not low stock yet)
  let itemsWithStock = await store.getItemsWithStock();
  let itemDecorated = itemsWithStock.find(i => i.id === 'TEST-MUG-001');
  assert.strictEqual(itemDecorated.isLowStock, false);

  // Distribute 4 more items -> stock becomes 8 (8 <= 10 -> isLowStock should be true!)
  await store.recordDistribution({
    itemId: 'TEST-MUG-001',
    quantity: 4,
    date: '2026-10-29',
    recipient: 'New Employee Onboarding',
    eventReason: 'Welcome Pack',
  });

  stock = await store.getCurrentStock('TEST-MUG-001');
  assert.strictEqual(stock, 8);
  itemsWithStock = await store.getItemsWithStock();
  itemDecorated = itemsWithStock.find(i => i.id === 'TEST-MUG-001');
  assert.strictEqual(itemDecorated.isLowStock, true, 'isLowStock must be true when stock <= threshold');
  console.log('✓ Low-stock flag correctly activated at 8 units (threshold: 10)');

  // 8. Test Mistake Correction / Reversal of the previous 4-item distribution
  const txns = await store.getAllTransactions();
  const lastDist = txns[txns.length - 1];
  const revTxn = await store.reverseTransaction(lastDist.id, 'Wrong recipient logged');
  console.log('Recorded Reversal / Mistake Correction:', revTxn);

  stock = await store.getCurrentStock('TEST-MUG-001');
  assert.strictEqual(stock, 12, 'Stock should be restored to 12 after reversing 4-unit distribution');
  console.log('✓ Stock balance restored after reversal to 12 units while preserving original rows');

  // Verify all transactions exist in history
  const allTxns = await store.getAllTransactions();
  assert.ok(allTxns.length >= 4, 'All transaction history rows must be intact');
  console.log(`✓ Audit log verified: ${allTxns.length} total transaction records preserved.`);

  console.log('\n--- All Unit & Integration Checks Passed Successfully! ---');
}

testInventoryLogic().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});

