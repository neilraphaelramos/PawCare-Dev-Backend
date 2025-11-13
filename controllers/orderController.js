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
      o.cancel_requested,
      o.methodPayments,
      o.paymentStatus,
      o.payment_intent_id,   
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
      o.paymentStatus,
      o.methodPayments,
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
          method: row.methodPayments,
          status: row.paymentStatus,
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

router.put("/update_payment_status/:id", (req, res) => {
  const { id } = req.params;
  const { paymentStatus } = req.body;
  const sql = "UPDATE orders SET paymentStatus = ? WHERE id_order = ?";
  db.query(sql, [paymentStatus, id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

/**
 * 🧾 Create COD Order (no PayMongo)
 */
router.post("/create_cod_order", async (req, res) => {
  const { uid, customer_name, customer_address, total, landmark, cart } = req.body;

  if (!cart || cart.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Cart is empty.",
    });
  }

  try {
    const orderDate = new Date().toISOString().slice(0, 10);

    // 📝 Insert new order into 'orders' table
    const sqlOrder = `
      INSERT INTO orders (
        uid,
        customer_name,
        customer_address,
        order_date,
        total,
        order_status,
        methodPayments,
        landmark
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [orderResult] = await db.promise().query(sqlOrder, [
      uid,
      customer_name,
      customer_address,
      orderDate,
      total,
      "Pending", // COD orders start as pending
      "cod",
      landmark || "",
    ]);

    const orderId = orderResult.insertId;

    // 🛍 Insert each ordered item into 'order_items' and update stock
    for (const item of cart) {
      await db
        .promise()
        .query(
          "INSERT INTO order_items (order_id, product_ID, product_name, quantity) VALUES (?, ?, ?, ?)",
          [orderId, item.id || item.product_ID, item.name, item.qty]
        );

      await db
        .promise()
        .query(
          "UPDATE inventory SET stock = GREATEST(stock - ?, 0) WHERE product_ID = ?",
          [item.qty, item.id || item.product_ID]
        );
    }

    await checkLowStock();

    res.json({
      success: true,
      message: "✅ COD order created successfully.",
      orderId,
    });
  } catch (err) {
    console.error("[Create COD Order Error]", err);
    res.status(500).json({
      success: false,
      message: "Server error creating COD order.",
    });
  }
});

/**
 * 1️⃣ Create PayMongo QR Ph payment intent
 *    Returns QR image URL + intent ID
 */
router.post("/create_payment_intent", async (req, res) => {
  const { amount, name, email, phone } = req.body;

  try {
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      authorization:
        "Basic " +
        Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString("base64"),
    };

    const amountInCentavos = Math.round(Number(amount) * 100);

    console.log("🟡 Creating PayMongo Payment Intent...");
    const intentRes = await fetch("https://api.paymongo.com/v1/payment_intents", {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountInCentavos,
            currency: "PHP",
            payment_method_allowed: ["qrph"],
            capture_type: "automatic",
            statement_descriptor: "Pet Order",
          },
        },
      }),
    });

    const intentData = await intentRes.json();
    if (!intentData.data) {
      console.error("❌ PayMongo intent error:", intentData);
      return res.status(400).json({
        success: false,
        message: "Failed to create payment intent.",
        error: intentData,
      });
    }

    const intentId = intentData.data.id;
    console.log(`✅ Payment Intent created: ${intentId}`);

    // Step 2: Create QRPh payment method
    console.log("🟡 Creating QRPH Payment Method...");
    const methodRes = await fetch("https://api.paymongo.com/v1/payment_methods", {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          attributes: {
            type: "qrph",
            billing: { name, email, phone },
          },
        },
      }),
    });

    const methodData = await methodRes.json();
    if (!methodData.data) {
      console.error("❌ PayMongo method error:", methodData);
      return res.status(400).json({
        success: false,
        message: "Failed to create payment method.",
        error: methodData,
      });
    }

    const methodId = methodData.data.id;
    console.log(`✅ Payment Method created: ${methodId}`);

    // Step 3: Attach payment method to intent
    console.log("🟡 Attaching payment method to intent...");
    const attachRes = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${intentId}/attach`,
      {
        method: "POST",
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
    const nextAction = attachData.data?.attributes?.next_action;

    // ✅ Extract base64 QR image directly
    const qrBase64 = nextAction?.code?.image_url || null;

    if (qrBase64) {
      console.log("🟢 QRPH Payment QR Created Successfully!");
      console.log("📦 Base64 Image Data:", qrBase64.substring(0, 50) + "...");
    } else {
      console.warn("⚠️ No QR base64 returned from PayMongo. Full response:");
      console.dir(attachData, { depth: null });
    }

    res.json({
      success: true,
      message: "Scan this QR to complete payment",
      payment_intent_id: intentId,
      qrImageBase64: qrBase64,
    });
  } catch (err) {
    console.error("[Create Payment Error]", err);
    res.status(500).json({
      success: false,
      message: "Server error creating payment",
    });
  }
});

router.get("/check_payment_status/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const headers = {
      accept: "application/json",
      authorization:
        "Basic " +
        Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString("base64"),
    };

    const response = await fetch(`https://api.paymongo.com/v1/payment_intents/${id}`, {
      method: "GET",
      headers,
    });

    const data = await response.json();

    const status = data.data?.attributes?.status || "unknown";
    console.log(`🔍 Payment Status for ${id}: ${status}`);

    res.json({ success: true, status });
  } catch (err) {
    console.error("[Check Payment Status Error]", err);
    res.status(500).json({ success: false, message: "Error checking payment status" });
  }
});

// 🛑 Cancel a PayMongo Payment Intent
router.post("/cancel_payment_intent", async (req, res) => {
  const { payment_intent_id } = req.body;

  if (!payment_intent_id) {
    return res.status(400).json({ success: false, message: "Missing payment intent ID." });
  }

  try {
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      authorization:
        "Basic " + Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString("base64"),
    };

    const cancelRes = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${payment_intent_id}/cancel`,
      {
        method: "POST",
        headers,
      }
    );

    const data = await cancelRes.json();

    if (!data.data) {
      console.error("❌ Cancel failed:", data);
      return res.status(400).json({ success: false, message: "Failed to cancel payment." });
    }

    console.log(`🛑 Payment intent ${payment_intent_id} canceled successfully.`);
    res.json({ success: true, message: "Payment canceled successfully." });
  } catch (err) {
    console.error("[Cancel Payment Error]", err);
    res.status(500).json({ success: false, message: "Server error canceling payment." });
  }
});
/**
 * 2️⃣ Confirm payment → Only then save to database
 */
router.post("/confirm_order", async (req, res) => {
  const { payment_intent_id, amount, name, address, date, items, uid } = req.body;

  const connection = await db.promise().getConnection();
  try {
    const headers = {
      accept: "application/json",
      authorization:
        "Basic " + Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString("base64"),
    };

    // 1️⃣ Verify PayMongo status
    const checkRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${payment_intent_id}`, { headers });
    const checkData = await checkRes.json();
    const status = checkData.data?.attributes?.status;

    if (status !== "succeeded") {
      return res.status(400).json({ success: false, message: "Payment not yet confirmed." });
    }

    // 2️⃣ Use transaction to ensure consistency
    await connection.beginTransaction();

    const [orderResult] = await connection.query(
      `INSERT INTO orders 
       (uid, customer_name, customer_address, order_date, total, order_status, methodPayments, paymentStatus, payment_intent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, name, address, date, amount, "Shipped", "qrph", "Paid", payment_intent_id || null]
    );

    const orderId = orderResult.insertId;

    for (const item of items) {
      await connection.query(
        "INSERT INTO order_items (order_id, product_ID, product_name, quantity) VALUES (?, ?, ?, ?)",
        [orderId, item.product_ID, item.name, item.qty]
      );

      await connection.query(
        "UPDATE inventory SET stock = GREATEST(stock - ?, 0) WHERE product_ID = ?",
        [item.qty, item.product_ID]
      );
    }

    await connection.commit();

    res.json({ success: true, message: "✅ Payment verified and order saved.", orderId });
  } catch (err) {
    await connection.rollback();
    console.error("[Confirm Order Error]", err);
    res.status(500).json({ success: false, message: "Server error confirming order." });
  } finally {
    await checkLowStock();
    connection.release();
  }
});

/* =====================================================
   USER — Request Order Cancellation
===================================================== */
router.post("/request_cancel", async (req, res) => {
  const { id_order, uid } = req.body;

  try {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM orders WHERE id_order = ? AND uid = ?", [
        id_order,
        uid,
      ]);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    }

    const order = rows[0];

    if (order.order_status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending orders can be cancelled.",
      });
    }

    await db
      .promise()
      .query("UPDATE orders SET cancel_requested = 1 WHERE id_order = ?", [
        id_order,
      ]);

    res.json({
      success: true,
      message: "Cancel request submitted. Awaiting admin review.",
    });
  } catch (err) {
    console.error("[Request Cancel Error]", err);
    res
      .status(500)
      .json({ success: false, message: "Server error requesting cancellation." });
  }
});

/* =====================================================
   ADMIN — Approve / Reject Cancellation
   (with optional refund if QRPh)
===================================================== */
router.post("/approve_cancel", async (req, res) => {
  const { id_order, refund, methodPayments } = req.body;
  console.log("🟨 [Backend] /approve_cancel called with:", {
    id_order,
    refund,
    methodPayments,
  });

  try {
    const [rows] = await db.promise().query(
      "SELECT * FROM orders WHERE id_order = ?",
      [id_order]
    );

    if (rows.length === 0) {
      console.log("❌ [Backend] Order not found for ID:", id_order);
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const order = rows[0];
    console.log("📦 [Backend] Order found in DB:", order);

    // ✅ Refund for QRPh
    if (refund && (methodPayments === "qrph" || order.methodPayments === "qrph")) {
      console.log("💳 [Backend] Initiating refund via PayMongo for order:", id_order);

      const headers = {
        accept: "application/json",
        "content-type": "application/json",
        authorization:
          "Basic " +
          Buffer.from(`${process.env.SECRET_KEY_PAYMONGO}:`).toString("base64"),
      };

      // Fetch payment intent from PayMongo
      console.log("🔍 [Backend] Fetching payment intent:", order.payment_intent_id);

      const intentRes = await fetch(
        `https://api.paymongo.com/v1/payment_intents/${order.payment_intent_id}`,
        { headers }
      );

      const intentData = await intentRes.json();
      console.log("📤 [Backend] PayMongo Intent Response:", intentData);

      const paymentId = intentData.data?.attributes?.payments?.[0]?.id;
      console.log("🪙 [Backend] Extracted paymentId:", paymentId);

      if (!paymentId) {
        console.log("⚠️ [Backend] No payment found for refund.");
        return res.status(400).json({
          success: false,
          message: "No payment found to refund.",
        });
      }

      // ✅ Process refund with a valid reason
      console.log("💰 [Backend] Sending refund request to PayMongo...");
      const refundRes = await fetch("https://api.paymongo.com/v1/refunds", {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            attributes: {
              amount: Math.round(order.total * 100), // PayMongo expects centavos
              payment_id: paymentId,
              reason: "duplicate", // ✅ Valid reason (avoid requested_by_customer)
              notes: `Customer requested refund for order ${id_order}`, // Optional, for clarity
            },
          },
        }),
      });

      const refundData = await refundRes.json();
      console.log("📤 [Backend] PayMongo Refund Response:", refundData);

      if (refundData.errors) {
        console.error("❌ [Backend] Refund failed:", refundData.errors);
        return res.status(400).json({
          success: false,
          message: refundData.errors[0]?.detail || "Refund failed.",
        });
      }

      await db.promise().query(
        "UPDATE orders SET order_status = 'Cancelled', refund_status = 'completed', cancel_requested = 0 WHERE id_order = ?",
        [id_order]
      );

      console.log("✅ [Backend] Order updated to Cancelled + Refund Completed");
      return res.json({
        success: true,
        message: "Order cancelled and refund completed.",
        refund_id: refundData.data?.id || null,
      });
    }

    // ✅ COD or no refund
    console.log("🚫 [Backend] No refund required. Updating order to Cancelled...");
    await db.promise().query(
      "UPDATE orders SET order_status = 'Cancelled', cancel_requested = 0 WHERE id_order = ?",
      [id_order]
    );

    res.json({
      success: true,
      message: "Order cancelled successfully (no refund required).",
    });
  } catch (err) {
    console.error("🔥 [Backend] [Approve Cancel Error]:", err);
    res.status(500).json({
      success: false,
      message: "Server error approving cancellation.",
      error: err.message,
    });
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

router.get("/summary-orders/categories", (req, res) => {
  const sql = `
    SELECT 
      i.item_group AS category,
      COUNT(oi.id_item) AS orders
    FROM order_items oi
    JOIN inventory i ON oi.product_ID = i.product_ID
    JOIN orders o ON oi.order_id = o.id_order
    WHERE 
      o.order_status != 'Cancelled'
      AND MONTH(o.order_date) = MONTH(CURDATE())
      AND YEAR(o.order_date) = YEAR(CURDATE())
    GROUP BY i.item_group
    ORDER BY i.item_group ASC;
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching category summary:", err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json({ success: true, data: results });
  });
});

module.exports = router;