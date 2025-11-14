const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/range", async (req, res) => {
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date)
    return res.status(400).json({ error: "Start date and end date are required" });

  try {
    const start = new Date(start_date);
    const end = new Date(end_date);

    const queries = {
      orders_summary: `
        SELECT 
          COUNT(*) AS total_orders,
          SUM(total) AS total_revenue
        FROM orders
        WHERE order_date BETWEEN ? AND ?
      `,
      orders_details: `
        SELECT 
          o.id_order,
          o.customer_name,
          o.customer_address,
          o.order_date,
          o.total,
          o.order_status,
          o.paymentStatus,
          o.methodPayments,
          GROUP_CONCAT(
            CONCAT(oi.product_name, ' (x', oi.quantity, ')')
            SEPARATOR ', '
          ) AS items_purchased
        FROM orders o
        LEFT JOIN order_items oi ON o.id_order = oi.order_id
        WHERE o.order_date BETWEEN ? AND ?
        GROUP BY o.id_order
        ORDER BY o.order_date DESC;
      `,
      pets_summary: `
        SELECT COUNT(*) AS total_pets
        FROM petInfos
        WHERE created_At BETWEEN ? AND ?;
      `,
      pets_details: `
        SELECT *
        FROM petInfos
        WHERE created_At BETWEEN ? AND ?
      `,
      pets_species_details: `
        SELECT 
          species,
          petType,
          COUNT(*) AS total_species
        FROM petInfos
        WHERE created_At BETWEEN ? AND ?
        GROUP BY species, petType
        ORDER BY total_species DESC;
      `,
      visits: `
        SELECT 
          vh.id_pet_history,
          pmr.owner_name,
          pmr.pet_name,
          vh.veterinarian_name,
          vh.date_visit
        FROM visit_history AS vh
        JOIN pet_medical_records AS pmr 
          ON vh.id_pet_medical_records = pmr.id_medical_record
        WHERE vh.date_visit BETWEEN ? AND ?
        ORDER BY vh.date_visit DESC;
      `,
      inventory_summary: `
        SELECT COUNT(*) AS total_items,
               SUM(stock) AS total_stock
        FROM inventory
        WHERE date_purchase BETWEEN ? AND ?
      `,
      inventory_details: `
        SELECT *
        FROM inventory
        WHERE date_purchase BETWEEN ? AND ?
      `,
      appointments_summary: `
        SELECT COUNT(*) AS total_appointments,
               SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved,
               SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending,
               SUM(CASE WHEN status = 'Declined' THEN 1 ELSE 0 END) AS declined
        FROM appointments_tables
        WHERE set_date BETWEEN ? AND ?
      `,
      appointments_details: `
        SELECT *
        FROM appointments_tables
        WHERE set_date BETWEEN ? AND ?
      `,
      services: `
        SELECT COUNT(*) AS total_services
        FROM services;
      `,
      products_sold: `
        SELECT 
          oi.product_ID AS product_id,
          oi.product_name AS product_name,
          SUM(oi.quantity) AS total_sold
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id_order
        WHERE o.order_date BETWEEN ? AND ?
        GROUP BY oi.product_ID, oi.product_name
        ORDER BY total_sold DESC;
      `,
      inventoryStock: `
        SELECT 
          sio.product_ID AS product_id,
          i.name AS product_name,
          SUM(sio.stockIn) AS total_stock_in,
          SUM(sio.stockOut) AS total_stock_out,
          i.stock AS current_stock,
          MAX(sio.created_At) AS last_movement_date
        FROM inventory_stock_in_out AS sio
        JOIN inventory AS i ON sio.product_ID = i.product_ID
        WHERE sio.created_At BETWEEN ? AND ?
        GROUP BY sio.product_ID, i.name, i.stock
        ORDER BY last_movement_date DESC;
      `,
      servicesCount: `
        SELECT 
          s.id AS service_id,
          s.title AS service_title,
          COUNT(v.service_type) AS usage_count
        FROM services s
        LEFT JOIN visit_history v
          ON s.title = v.service_type
          AND v.date_visit BETWEEN ? AND ?
        GROUP BY s.id, s.title
        ORDER BY s.id;
      `
    };

    // Execute all queries concurrently
    const [
      orders_summary,
      orders_details,
      pets_summary,
      pets_details,
      pet_species_details,
      visits,
      inventory_summary,
      inventory_details,
      appointments_summary,
      appointments_details,
      services,
      products_sold,
      inventory_stock,
      services_usage,
    ] = await Promise.all(
      Object.values(queries).map(
        (sql) =>
          new Promise((resolve, reject) => {
            db.query(sql, [start, end, start, end], (err, result) => {
              if (err) return reject(err);
              resolve(result);
            });
          })
      )
    );

    res.json({
      start_date,
      end_date,
      summary: {
        orders: orders_summary[0],
        pets: pets_summary[0],
        inventory: inventory_summary[0],
        appointments: appointments_summary[0],
        services: services[0],
        inventoryStock: inventory_stock,
      },
      details: {
        orders: orders_details,
        pets: pets_details,
        inventory: inventory_details,
        products_sold: products_sold,
        appointments: appointments_details,
        totalspecies: pet_species_details,
        visits: visits,
        servicesCount: services_usage,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching report:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

module.exports = router;
