
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "NECTAR API is running" });
});

// Get food items from MySQL
app.get("/api/foods", (req, res) => {
  const sql = `
    SELECT f.food_id, f.food_name, f.price, f.availability,
           f.restaurant_id, r.restaurant_name, c.category_name
    FROM Food_Item f
    JOIN Restaurant r ON f.restaurant_id = r.restaurant_id
    JOIN Category c ON f.category_id = c.category_id
    WHERE f.availability = TRUE
    ORDER BY f.food_id
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Food query failed:", err.message);
      return res.status(500).json({ error: "Could not load food items" });
    }

    res.json(results);
  });
});

// Place an order and save related records
app.post("/api/orders", (req, res) => {
  const { customer_id, items, payment_method = "COD" } = req.body;

  if (!customer_id || !Array.isArray(items) || items.length === 0) {
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

    quantities.set(id, (quantities.get(id) || 0) + quantity);
  }

  if (!["COD", "UPI"].includes(payment_method)) {
    return res.status(400).json({ error: "Invalid payment method" });
  }

  db.getConnection((connectionError, connection) => {
    if (connectionError) {
      console.error(connectionError.message);
      return res.status(500).json({ error: "Database unavailable" });
    }

    connection.beginTransaction((transactionError) => {
      if (transactionError) {
        connection.release();
        console.error(transactionError.message);
        return res.status(500).json({ error: "Could not start transaction" });
      }

      const fail = (err) => {
        return connection.rollback(() => {
          connection.release();
          console.error(err.message);
          res.status(500).json({ error: "Could not place order" });
        });
      };

      const foodIds = [...quantities.keys()];
      const placeholders = foodIds.map(() => "?").join(",");

      connection.query(
        `SELECT food_id, food_name, price, restaurant_id
         FROM Food_Item
         WHERE food_id IN (${placeholders}) AND availability = TRUE
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
              sum + Number(food.price) * quantities.get(food.food_id),
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
                  res.status(400).json({ error: "Customer not found" });
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
                         VALUES (?, ?, ?, ?)`,
                        [
                          orderId,
                          total,
                          payment_method,
                          payment_method === "COD" ? "Pending" : "Pending"
                        ],
                        (paymentError) => {
                          if (paymentError) return fail(paymentError);

                          connection.query(
                            `INSERT INTO Delivery (order_id, delivery_status)
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

// View saved orders for a customer
app.get("/api/orders", (req, res) => {
  const customerId = Number(req.query.customer_id || 1);

  db.query(
    `SELECT o.order_id, o.order_date, o.total_amount, o.status,
            r.restaurant_name
     FROM Orders o
     JOIN Restaurant r ON o.restaurant_id = r.restaurant_id
     WHERE o.customer_id = ?
     ORDER BY o.order_date DESC`,
    [customerId],
    (err, orders) => {
      if (err) {
        console.error("Order history query failed:", err.message);
        return res.status(500).json({ error: "Could not load orders" });
      }

      res.json(orders);
    }
  );
});

app.listen(5000, () => {
  console.log("NECTAR backend running at http://localhost:5000");
});
