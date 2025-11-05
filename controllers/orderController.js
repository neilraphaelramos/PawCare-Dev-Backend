const express = require('express');
const router = express.Router();
const db = require('../db');
const checkLowStock = require('../utils/inventoryAlert');

router.get('/fetch', (req, res) => {
  const sql = `
    SELECT 
      o.id_order, 
      o.customer_name, 
      o.customer_address, 
      o.order_date, 
      o.total, 
      o.order_status,
      i.product_name, 
      i.quantity
    FROM orders o
    LEFT JOIN order_items i 
      ON o.id_order = i.order_id
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching inventory:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, data: results });
  });
});

router.get('/:userId', (req, res) => {
  const { userId } = req.params;

  const sql = `
    SELECT 
      o.id_order, 
      o.customer_name, 
      o.customer_address, 
      o.order_date, 
      o.total, 
      o.order_status,
      i.product_name, 
      i.quantity
    FROM orders o
    LEFT JOIN order_items i 
      ON o.id_order = i.order_id
    WHERE o.uid = ?
    ORDER BY o.order_date DESC
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching orders:', err);
      return res.status(500).json({ error: 'Server error' });
    }

    // Group rows by id_order
    const ordersMap = {};

    results.forEach(row => {
      if (!ordersMap[row.id_order]) {
        ordersMap[row.id_order] = {
          id_order: row.id_order,
          customer_name: row.customer_name,
          customer_address: row.customer_address,
          order_date: row.order_date,
          total: row.total,
          order_status: row.order_status,
          items: []
        };
      }

      if (row.product_name) {
        ordersMap[row.id_order].items.push({
          product_name: row.product_name,
          quantity: row.quantity
        });
      }
    });

    const groupedOrders = Object.values(ordersMap);
    res.json({ orders: groupedOrders });
  });
});

router.put('/update_status/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const sql = `UPDATE orders SET order_status = ? WHERE id_order = ?`;

  db.query(sql, [status, id], (err) => {
    if (err) {
      console.log(err)
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Order Status updated' });
  });
});

router.post('/payment_setorder', async (req, res) => {
  const { amount, methods, name, address, date, items, uid, email, phone } = req.body;
  const status = 'Pending';

  const sqlorders = `
    INSERT INTO orders (uid, customer_name, customer_address, order_date, total, order_status, methodPayments)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const sqllistorders = `
    INSERT INTO order_items (order_id, product_ID, product_name, quantity)
    VALUES (?, ?, ?, ?)
  `;

  const sqlUpdateStock = `
    UPDATE inventory 
    SET stock = ? 
    WHERE product_ID = ?
  `;

  const sqlStockOut = `
    SELECT photo, stock
    FROM inventory
    WHERE product_ID = ?
  `;

  const sqlInsertStockLog = `
    INSERT INTO inventory_stock_in_out (product_ID, stockIn, stockOut)
    VALUES (?, ?, ?)
  `;

  try {
    const [orderResult] = await db.promise().query(sqlorders, [
      uid,
      name,
      address,
      date,
      amount,
      status,
      methods,
    ]);

    const orderId = orderResult.insertId;
    let lowStockWarnings = [];

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        try {
          const [rows] = await db.promise().query(sqlStockOut, [item.product_ID]);

          if (rows.length === 0) {
            console.warn(`⚠️ Item not found in inventory: ${item.name}`);
            continue;
          }

          const oldStock = Number(rows[0].stock) || 0;
          const newStock = Math.max(oldStock - Number(item.qty), 0);
          const diff = newStock - oldStock;

          await db.promise().query(sqlUpdateStock, [newStock, item.product_ID]);

          await db.promise().query(sqllistorders, [
            orderId,
            item.product_ID,
            item.name,
            item.qty,
          ]);

          const stockOut = diff < 0 ? Math.abs(diff) : 0;
          if (stockOut > 0) {
            await db.promise().query(sqlInsertStockLog, [item.product_ID, 0, stockOut]);
            console.log(`📦 Logged stock out for ${item.name}: ${stockOut}`);
          }

          if (newStock === 1) {
            lowStockWarnings.push(`⚠️ ${item.name} is almost out of stock (only 1 left)!`);
          } else if (newStock <= 0) {
            lowStockWarnings.push(`❌ ${item.name} is now out of stock.`);
          }
        } catch (itemErr) {
          console.error(`[DB] Error handling item ${item.name}:`, itemErr);
        }
      }

      await checkLowStock();
    }

    if (methods === 'cod') {
      return res.json({
        success: true,
        message: 'Order placed successfully with Cash on Delivery',
        orderId,
        redirectUrl: null,
        warnings: lowStockWarnings,
      });
    }

    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization:
        'Basic ' +
        Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString('base64'),
    };

    const amountInCentavos = Math.round(Number(amount) * 100);

    const intentRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountInCentavos,
            currency: 'PHP',
            payment_method_allowed: ['gcash', 'paymaya'],
            capture_type: 'automatic',
            statement_descriptor: `Order #${orderId}`,
          },
        },
      }),
    });

    const intentData = await intentRes.json();
    if (!intentData.data) {
      console.error('[PAYMONGO INTENT ERROR]', intentData);
      return res.status(400).json({ success: false, message: 'Failed to create payment intent' });
    }

    const intentId = intentData.data.id;

    const methodRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          attributes: {
            type: methods,
            billing: { name, email, phone },
          },
        },
      }),
    });

    const methodData = await methodRes.json();
    if (!methodData.data) {
      console.error('[PAYMONGO METHOD ERROR]', methodData);
      return res.status(400).json({ success: false, message: 'Failed to create payment method' });
    }

    const methodId = methodData.data.id;

    const attachRes = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${intentId}/attach`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: methodId,
              return_url: `${process.env.DEFAULT_URL}/users/pet-products?payment=success`,
            },
          },
        }),
      }
    );

    const attachData = await attachRes.json();
    if (!attachData.data) {
      console.error('[PAYMONGO ATTACH ERROR]', attachData);
      return res.status(400).json({ success: false, message: 'Failed to attach payment method' });
    }

    const redirectUrl = attachData.data.attributes.next_action.redirect.url;
    res.json({
      success: true,
      message: 'Order created, proceed to payment',
      orderId,
      redirectUrl,
      warnings: lowStockWarnings,
    });
  } catch (err) {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/fetch/user_order/:id', (req, res) => {
  const { id } = req.params; // ✅ fix: use id, not uid

  const sql = `
    SELECT 
      oi.product_ID,
      i.photo AS product_image,
      i.price AS product_price,
      oi.product_name,
      oi.quantity,
      o.order_date,
      o.order_status
    FROM order_items oi
    JOIN orders o ON o.id_order = oi.order_id
    JOIN inventory i ON i.product_ID = oi.product_ID
    WHERE o.uid = ?
    ORDER BY o.order_date DESC
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching user purchases:', err);
      return res.status(500).json({ error: 'Failed to fetch user purchases' });
    }

    res.json(rows);
  });
});

module.exports = router;