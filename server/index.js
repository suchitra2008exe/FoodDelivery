
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

// Check whether the API is running
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "NECTAR API is running"
  });
});

// Get food items from MySQL
app.get("/api/foods", (req, res) => {
  const sql = `
    SELECT
      f.food_id,
      f.food_name,
      f.price,
      f.availability,
      f.restaurant_id,
      r.restaurant_name,
      c.category_name
    FROM Food_Item f
    JOIN Restaurant r
      ON f.restaurant_id = r.restaurant_id
    JOIN Category c
      ON f.category_id = c.category_id
    WHERE f.availability = TRUE
    ORDER BY f.food_id
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Food query failed:", err.message);
      return res.status(500).json({
        error: "Could not load food items"
      });
    }

    res.json(results);
  });
});

// Place an order and save related records
app.post("/api/orders", (req, res) => {
  const {
    customer_id,
    items,
    payment_method = "COD"
  } = req.body;

  if (
    !Number.isInteger(Number(customer_id)) ||
    Number(customer_id) <= 0 ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({
      error: "Customer and at least one cart item are required"
    });
  }

  const quantities = new Map();

  for (const item of items) {
    const id = Number(item.food_id);
    const quantity = Number(item.quantity);

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > 99
    ) {
      return res.status(400).json({
        error: "Each item must have a valid food ID and quantity"
      });
    }

    const newQuantity = (quantities.get(id) || 0) + quantity;

    if (newQuantity > 99) {
      return res.status(400).json({
        error: "Maximum quantity per food item is 99"
      });
    }

    quantities.set(id, newQuantity);
  }

  if (!["COD", "UPI"].includes(payment_method)) {
    return res.status(400).json({
      error: "Invalid payment method"
    });
  }

  db.getConnection((connectionError, connection) => {
    if (connectionError) {
      console.error(connectionError.message);
      return res.status(500).json({
        error: "Database unavailable"
      });
    }

    connection.beginTransaction((transactionError) => {
      if (transactionError) {
        connection.release();
        console.error(transactionError.message);
        return res.status(500).json({
          error: "Could not start transaction"
        });
      }

      const fail = (err) => {
        connection.rollback(() => {
          connection.release();
          console.error(err.message);
          res.status(500).json({
            error: "Could not place order"
          });
        });
      };

      const foodIds = [...quantities.keys()];
      const placeholders = foodIds.map(() => "?").join(",");

      connection.query(
        `SELECT food_id, food_name, price, restaurant_id
         FROM Food_Item
         WHERE food_id IN (${placeholders})
           AND availability = TRUE
         FOR UPDATE`,
        foodIds,
        (foodError, foods) => {
          if (foodError) return fail(foodError);

          if (foods.length !== foodIds.length) {
            return connection.rollback(() => {
              connection.release();
              res.status(400).json({
                error: "One or more food items are unavailable"
              });
            });
          }

          const restaurantIds = new Set(
            foods.map((food) => food.restaurant_id)
          );

          if (restaurantIds.size !== 1) {
            return connection.rollback(() => {
              connection.release();
              res.status(400).json({
                error: "Please order from one restaurant at a time"
              });
            });
          }

          const restaurantId = foods[0].restaurant_id;

          const total = foods.reduce(
            (sum, food) =>
              sum +
              Number(food.price) * quantities.get(food.food_id),
            0
          );

          connection.query(
            "SELECT customer_id FROM Customer WHERE customer_id = ?",
            [Number(customer_id)],
            (customerError, customers) => {
              if (customerError) return fail(customerError);

              if (customers.length === 0) {
                return connection.rollback(() => {
                  connection.release();
                  res.status(400).json({
                    error: "Customer not found"
                  });
                });
              }

              connection.query(
                `INSERT INTO Orders
                 (customer_id, restaurant_id, total_amount, status)
                 VALUES (?, ?, ?, 'Placed')`,
                [Number(customer_id), restaurantId, total],
                (orderError, orderResult) => {
                  if (orderError) return fail(orderError);

                  const orderId = orderResult.insertId;

                  const orderItems = foods.map((food) => [
                    orderId,
                    food.food_id,
                    quantities.get(food.food_id),
                    food.price
                  ]);

                  connection.query(
                    `INSERT INTO Order_Item
                     (order_id, food_id, quantity, price)
                     VALUES ?`,
                    [orderItems],
                    (itemsError) => {
                      if (itemsError) return fail(itemsError);

                      connection.query(
                        `INSERT INTO Payment
                         (order_id, amount, payment_method, payment_status)
                         VALUES (?, ?, ?, 'Pending')`,
                        [orderId, total, payment_method],
                        (paymentError) => {
                          if (paymentError) return fail(paymentError);

                          connection.query(
                            `INSERT INTO Delivery
                             (order_id, delivery_status)
                             VALUES (?, 'Preparing')`,
                            [orderId],
                            (deliveryError) => {
                              if (deliveryError) return fail(deliveryError);

                              connection.commit((commitError) => {
                                if (commitError) return fail(commitError);

                                connection.release();

                                res.status(201).json({
                                  success: true,
                                  message: "Order placed successfully!",
                                  order_id: orderId,
                                  total_amount: total,
                                  status: "Placed"
                                });
                              });
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });
});

// Get order history with food item details
app.get("/api/orders", (req, res) => {
  const customerId = Number(req.query.customer_id || 1);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return res.status(400).json({
      error: "Invalid customer ID"
    });
  }

  const sql = `
    SELECT
      o.order_id,
      o.order_date,
      o.total_amount,
      o.status,
      r.restaurant_name,
      oi.order_item_id,
      oi.food_id,
      fi.food_name,
      oi.quantity,
      oi.price AS item_price
    FROM Orders o
    JOIN Restaurant r
      ON o.restaurant_id = r.restaurant_id
    LEFT JOIN Order_Item oi
      ON o.order_id = oi.order_id
    LEFT JOIN Food_Item fi
      ON oi.food_id = fi.food_id
    WHERE o.customer_id = ?
    ORDER BY o.order_date DESC, oi.order_item_id ASC
  `;

  db.query(sql, [customerId], (err, rows) => {
    if (err) {
      console.error("Order history query failed:", err.message);
      return res.status(500).json({
        error: "Could not load order history"
      });
    }

    const orderMap = new Map();

    for (const row of rows) {
      if (!orderMap.has(row.order_id)) {
        orderMap.set(row.order_id, {
          order_id: row.order_id,
          order_date: row.order_date,
          total_amount: Number(row.total_amount),
          status: row.status,
          restaurant_name: row.restaurant_name,
          items: []
        });
      }

      if (row.order_item_id !== null) {
        orderMap.get(row.order_id).items.push({
          order_item_id: row.order_item_id,
          food_id: row.food_id,
          food_name: row.food_name || "Unavailable food item",
          quantity: Number(row.quantity),
          price: Number(row.item_price),
          subtotal:
            Number(row.item_price) * Number(row.quantity)
        });
      }
    }

    res.json([...orderMap.values()]);
  });
});


/* =========================================
   EAT RITE: Nutrition analysis for an order
========================================= */
app.get("/api/eat-rite/:orderId", (req, res) => {
  const orderId = Number(req.params.orderId);
  const customerId = Number(req.query.customer_id || 1);

  if (
    !Number.isInteger(orderId) ||
    orderId <= 0 ||
    !Number.isInteger(customerId) ||
    customerId <= 0
  ) {
    return res.status(400).json({
      error: "Invalid order ID or customer ID"
    });
  }

  const sql = `
    SELECT
      o.order_id,
      o.customer_id,
      o.order_date,
      o.total_amount,
      o.status,
      fi.food_id,
      fi.food_name,
      oi.quantity,
      n.serving_size_g,
      n.calories,
      n.protein_g,
      n.carbohydrates_g,
      n.fat_g,
      n.fibre_g,
      n.sugar_g,
      n.sodium_mg
    FROM Orders o
    JOIN Order_Item oi ON o.order_id = oi.order_id
    JOIN Food_Item fi ON oi.food_id = fi.food_id
    LEFT JOIN Food_Nutrition n ON fi.food_id = n.food_id
    WHERE o.order_id = ?
      AND o.customer_id = ?
    ORDER BY fi.food_name
  `;

  db.query(sql, [orderId, customerId], (err, rows) => {
    if (err) {
      console.error("Eat Rite query failed:", err.message);
      return res.status(500).json({
        error: "Could not analyse this order"
      });
    }

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Order not found for this customer"
      });
    }

    const missingNutrition = rows.filter(
      (row) => row.calories === null
    );

    const totals = {
      calories: 0,
      protein_g: 0,
      carbohydrates_g: 0,
      fat_g: 0,
      fibre_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
      serving_size_g: 0
    };

    const items = rows.map((row) => {
      const quantity = Number(row.quantity);
      const hasNutrition = row.calories !== null;

      const nutrition = {};

      for (const key of [
        "calories",
        "protein_g",
        "carbohydrates_g",
        "fat_g",
        "fibre_g",
        "sugar_g",
        "sodium_mg",
        "serving_size_g"
      ]) {
        nutrition[key] = hasNutrition
          ? Number(row[key]) * quantity
          : null;

        if (hasNutrition) {
          totals[key] += nutrition[key];
        }
      }

      return {
        food_id: row.food_id,
        food_name: row.food_name,
        quantity,
        serving_size_g: hasNutrition
          ? Number(row.serving_size_g)
          : null,
        nutrition,
        nutrition_available: hasNutrition
      };
    });

    const insights = [];

    if (totals.fibre_g < 5) {
      insights.push(
        "This order is relatively low in fibre. Consider adding vegetables, fruit, or another fibre-rich food."
      );
    }

    if (totals.protein_g < 15) {
      insights.push(
        "Consider adding a protein-rich food, such as beans, lentils, eggs, tofu, or paneer."
      );
    }

    if (totals.sodium_mg > 1500) {
      insights.push(
        "This order has a high estimated sodium content. Consider choosing less salty options next time."
      );
    }

    if (totals.sugar_g > 25) {
      insights.push(
        "This order contains a substantial amount of estimated sugar. You could balance it with a less sugary option."
      );
    }

    if (insights.length === 0) {
      insights.push(
        "Consider your overall daily diet, portion sizes, and variety when deciding how this order fits your eating habits."
      );
    }

    res.json({
      success: true,
      order: {
        order_id: rows[0].order_id,
        order_date: rows[0].order_date,
        total_amount: Number(rows[0].total_amount),
        status: rows[0].status
      },
      nutrition_basis: "Estimated values for project demonstration",
      nutrition_complete: missingNutrition.length === 0,
      items,
      totals: Object.fromEntries(
        Object.entries(totals).map(([key, value]) => [
          key,
          Math.round(value * 100) / 100
        ])
      ),
      insights
    });
  });
});



 // Admin dashboard statistics
app.get("/api/admin/stats", (req, res) => {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM Orders) AS total_orders,
      (SELECT COALESCE(SUM(total_amount), 0) FROM Orders) AS total_revenue,
      (SELECT COUNT(*) FROM Customer) AS total_customers,
      (SELECT COUNT(*) FROM Food_Item) AS total_food_items,
      (SELECT COUNT(*) FROM Food_Item WHERE availability = TRUE)
        AS available_food_items,
      (SELECT COUNT(*) FROM Orders WHERE status = 'Placed')
        AS placed_orders
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Admin stats query failed:", err.message);
      return res.status(500).json({
        error: "Could not load admin dashboard statistics"
      });
    }

    const stats = results[0];

    res.json({
      total_orders: Number(stats.total_orders),
      total_revenue: Number(stats.total_revenue),
      total_customers: Number(stats.total_customers),
      total_food_items: Number(stats.total_food_items),
      available_food_items: Number(stats.available_food_items),
      placed_orders: Number(stats.placed_orders)
    });
  });
});


 // Sales and analytics reports
app.get("/api/admin/analytics", (req, res) => {
  const queries = {
    summary: `
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(total_amount), 0) AS total_order_value,
        COALESCE(AVG(total_amount), 0) AS average_order_value
      FROM Orders
    `,

    dailySales: `
      SELECT
        DATE(order_date) AS sale_date,
        COUNT(*) AS order_count,
        COALESCE(SUM(total_amount), 0) AS revenue
      FROM Orders
      WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND order_date < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      GROUP BY DATE(order_date)
      ORDER BY sale_date ASC
    `,

    topFoods: `
      SELECT
        fi.food_id,
        fi.food_name,
        COALESCE(SUM(oi.quantity), 0) AS quantity_sold,
        COALESCE(SUM(oi.quantity * oi.price), 0) AS sales_value
      FROM Order_Item oi
      JOIN Food_Item fi ON oi.food_id = fi.food_id
      GROUP BY fi.food_id, fi.food_name
      ORDER BY quantity_sold DESC, sales_value DESC
      LIMIT 5
    `,

    restaurantSales: `
      SELECT
        r.restaurant_id,
        r.restaurant_name,
        COUNT(DISTINCT o.order_id) AS order_count,
        COALESCE(SUM(o.total_amount), 0) AS sales_value
      FROM Restaurant r
      LEFT JOIN Orders o ON r.restaurant_id = o.restaurant_id
      GROUP BY r.restaurant_id, r.restaurant_name
      ORDER BY sales_value DESC
    `
  };

  const results = {};
  const entries = Object.entries(queries);
  let completed = 0;
  let failed = false;

  for (const [key, sql] of entries) {
    db.query(sql, (err, rows) => {
      if (failed) return;

      if (err) {
        failed = true;
        console.error(`Analytics query failed (${key}):`, err.message);

        return res.status(500).json({
          error: "Could not load sales analytics",
          section: key
        });
      }

      results[key] = rows;
      completed += 1;

      if (completed === entries.length) {
        res.json({
          summary: {
            total_orders: Number(results.summary[0].total_orders),
            total_order_value: Number(
              results.summary[0].total_order_value
            ),
            average_order_value: Number(
              results.summary[0].average_order_value
            )
          },

          daily_sales: results.dailySales.map((row) => ({
            sale_date: row.sale_date,
            order_count: Number(row.order_count),
            revenue: Number(row.revenue)
          })),

          top_foods: results.topFoods.map((row) => ({
            food_id: row.food_id,
            food_name: row.food_name,
            quantity_sold: Number(row.quantity_sold),
            sales_value: Number(row.sales_value)
          })),

          restaurant_sales: results.restaurantSales.map((row) => ({
            restaurant_id: row.restaurant_id,
            restaurant_name: row.restaurant_name,
            order_count: Number(row.order_count),
            sales_value: Number(row.sales_value)
          }))
        });
      }
    });
  }
});

// Start the backend server
app.listen(5000, () => {
  console.log("NECTAR backend running at http://localhost:5000");
});
