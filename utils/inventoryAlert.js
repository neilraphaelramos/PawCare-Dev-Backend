const db = require("../db");

async function checkLowStock() {
  try {
    console.log("🕵️ Checking for low stock items...");

    const [items] = await db.promise().query(`
      SELECT product_ID, name, stock 
      FROM inventory 
      WHERE stock <= 5
    `);

    console.log(`📊 Found ${items.length} low-stock items.`);

    if (items.length === 0) return;

    for (const item of items) {
      const { product_ID, name, stock } = item;

      // Check if this alert already exists for this product today
      const [existing] = await db.promise().query(
        `
        SELECT notify_id 
        FROM Vet_Admin_notification 
        WHERE type_notify = 'Low Stock Alert' 
          AND details LIKE ? 
          AND DATE(notify_date) = CURDATE()
        LIMIT 1
        `,
        [`%${name}%`]
      );

      if (existing.length > 0) {
        console.log(`⚠️ Alert for "${name}" already exists today, skipping.`);
        continue;
      }

      const title = "Inventory Alert";
      const type = "Low Stock Alert";
      const details = `The item "${name}" is low on stock (only ${stock} left). Please restock soon.`;
      const date = new Date();

      await db.promise().query(
        `
        INSERT INTO Vet_Admin_notification 
        (title_notify, type_notify, details, notify_date)
        VALUES (?, ?, ?, ?)
        `,
        [title, type, details, date]
      );

      console.log(`🔔 Low stock alert inserted for "${name}" (stock: ${stock})`);
    }
  } catch (err) {
    console.error("❌ Error in checkLowStock:", err.message);
  }
}

module.exports = checkLowStock;
