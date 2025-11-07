const db = require('../db');

async function checkLowStock() {
    try {
        const [items] = await db.promise().query(`
      SELECT product_ID, name, stock 
      FROM inventory 
      WHERE stock <= 5
    `);

        if (items.length === 0) return;

        for (const item of items) {
            const { name, stock } = item;

            const [existing] = await db.promise().query(
                `SELECT notify_id FROM Vet_Admin_notification 
                WHERE type_notify = 'Low Stock Alert' 
                AND details LIKE ? 
                ORDER BY notify_date DESC LIMIT 1`,
                [`%${name}%`]
            );

            if (existing.length > 0) continue;

            const title = 'Inventory Alert';
            const type = 'Low Stock Alert';
            const details = `The item "${name}" is low on stock (only ${stock} left). Please restock soon.`;
            const date = new Date();

            await db.promise().query(
                `INSERT INTO Vet_Admin_notification 
                (title_notify, type_notify, details, notify_date)
                VALUES (?, ?, ?, ?)`,
                [title, type, details, date]
            );

            console.log(`🔔 Low stock alert for: ${name}`);
        }
    } catch (err) {
        console.error("Error checking low stock:", err);
    }
}

module.exports = checkLowStock;
