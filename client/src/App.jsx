
import { useState, useEffect } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api";

const foodEmojis = {
  Pizza: "🍕",
  Burgers: "🍔",
  Chinese: "🍜",
  Desserts: "🍰",
  Sides: "🍟",
  Drinks: "🥤",
};

const categories = [
  "All",
  "Pizza",
  "Burgers",
  "Chinese",
  "Desserts",
  "Sides",
  "Drinks",
];

const formatCurrency = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

function App() {
  const [foods, setFoods] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState("home");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [orderMessage, setOrderMessage] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");

  const [adminStats, setAdminStats] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");

  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  const [eatRiteOrderId, setEatRiteOrderId] = useState(null);
  const [eatRiteData, setEatRiteData] = useState(null);
  const [eatRiteLoading, setEatRiteLoading] = useState(false);
  const [eatRiteError, setEatRiteError] = useState("");

  // Load food items from MySQL.
  async function loadFoods() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/foods`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch food items.");
      }

      setFoods(data);
    } catch (err) {
      console.error("Food loading error:", err);
      setError(
        "Could not load food. Make sure the backend and MySQL are running."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFoods();
  }, []);

  const filteredFoods = foods.filter((food) => {
    const searchText =
      `${food.food_name} ${food.restaurant_name}`.toLowerCase();

    const matchesSearch = searchText.includes(search.toLowerCase());
    const matchesCategory =
      category === "All" || food.category_name === category;

    return matchesSearch && matchesCategory;
  });

  function addToCart(food) {
    setCart((current) => {
      const existing = current.find(
        (item) => item.food_id === food.food_id
      );

      if (existing) {
        return current.map((item) =>
          item.food_id === food.food_id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { ...food, quantity: 1 }];
    });
  }

  function changeQuantity(foodId, amount) {
    setCart((current) =>
      current
        .map((item) =>
          item.food_id === foodId
            ? { ...item, quantity: item.quantity + amount }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  const cartCount = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const total = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

  function renderQuantityControls(food) {
    const cartItem = cart.find(
      (item) => item.food_id === food.food_id
    );

    if (!cartItem) {
      return (
        <button
          className="primary"
          onClick={() => addToCart(food)}
          disabled={!food.availability}
        >
          {food.availability ? "+ Add to cart" : "Unavailable"}
        </button>
      );
    }

    return (
      <div className="quantity food-card-quantity">
        <button
          type="button"
          aria-label={`Decrease ${food.food_name} quantity`}
          onClick={() => changeQuantity(food.food_id, -1)}
        >
          −
        </button>

        <span aria-live="polite">{cartItem.quantity}</span>

        <button
          type="button"
          aria-label={`Increase ${food.food_name} quantity`}
          onClick={() => changeQuantity(food.food_id, 1)}
        >
          +
        </button>
      </div>
    );
  }

  // Place an order.
  async function placeOrder() {
    if (placingOrder || cart.length === 0) return;

    setPlacingOrder(true);
    setOrderMessage("");

    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_id: 1,
          payment_method: "COD",
          items: cart.map((item) => ({
            food_id: item.food_id,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not place your order.");
      }

      setOrderMessage(
        data.order_id != null
          ? `Order placed successfully! Order ID: ${data.order_id}.`
          : "Order placed successfully!"
      );

      setCart([]);
      if (data.order_id != null) {
        await loadEatRite(data.order_id);
      }
    } catch (err) {
      console.error("Order error:", err);
      setOrderMessage(err.message || "Could not place your order.");
    } finally {
      setPlacingOrder(false);
    }
  }

  // Load order history.
  async function loadOrders() {
    setPage("orders");
    setOrdersLoading(true);
    setOrdersError("");

    try {
      const response = await fetch(
        `${API_URL}/orders?customer_id=1`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load order history.");
      }

      if (!Array.isArray(data)) {
        throw new Error("Unexpected order history response.");
      }

      setOrders(data);
    } catch (err) {
      console.error("Order history error:", err);
      setOrdersError(err.message || "Could not load order history.");
    } finally {
      setOrdersLoading(false);
    }
  }

  // Load nutrition analysis for a selected order.
  async function loadEatRite(orderId) {
    setPage("eatrite");
    setEatRiteOrderId(orderId);
    setEatRiteLoading(true);
    setEatRiteError("");
    setEatRiteData(null);

    try {
      const response = await fetch(
        `${API_URL}/eat-rite/${orderId}?customer_id=1`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not analyse this order.");
      }

      setEatRiteData(data);
    } catch (err) {
      console.error("Eat Rite error:", err);
      setEatRiteError(err.message || "Could not load nutrition analysis.");
    } finally {
      setEatRiteLoading(false);
    }
  }

  // Load admin dashboard statistics.
  async function loadAdminDashboard() {
    setPage("admin");
    setAdminLoading(true);
    setAdminError("");

    try {
      const response = await fetch(`${API_URL}/admin/stats`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load admin statistics.");
      }

      setAdminStats(data);
    } catch (err) {
      console.error("Admin dashboard error:", err);
      setAdminError(
        err.message || "Could not load admin statistics."
      );
    } finally {
      setAdminLoading(false);
    }
  }

  // Load real sales analytics from MySQL.
  async function loadAnalytics() {
    setPage("analytics");
    setAnalyticsLoading(true);
    setAnalyticsError("");

    try {
      const response = await fetch(`${API_URL}/admin/analytics`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load analytics.");
      }

      setAnalytics(data);
    } catch (err) {
      console.error("Analytics error:", err);
      setAnalyticsError(
        err.message || "Could not load sales analytics."
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }

  function formatOrderDate(dateValue) {
    if (!dateValue) return "Date unavailable";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return String(dateValue);
    }

    return date.toLocaleString();
  }

  // Sales chart: bar heights scale to the largest daily revenue.
  function renderSalesChart(dailySales) {
    if (!dailySales || dailySales.length === 0) {
      return <p>No sales recorded in the last seven days.</p>;
    }

    const maxRevenue = Math.max(
      ...dailySales.map((item) => Number(item.revenue)),
      1
    );

    return (
      <div className="sales-chart">
        {dailySales.map((item) => {
          const height =
            (Number(item.revenue) / maxRevenue) * 100;

          const date = new Date(item.sale_date);
          const dateLabel = Number.isNaN(date.getTime())
            ? String(item.sale_date)
            : date.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              });

          return (
            <div
              className="sales-chart-column"
              key={String(item.sale_date)}
              title={`${dateLabel}: ${formatCurrency(item.revenue)}`}
            >
              <span className="sales-chart-value">
                {formatCurrency(item.revenue)}
              </span>

              <div className="sales-chart-bar-wrap">
                <div
                  className="sales-chart-bar"
                  style={{
                    height: `${Math.max(height, 5)}%`,
                  }}
                />
              </div>

              <span className="sales-chart-date">
                {dateLabel}
              </span>

              <small>
                {item.order_count}{" "}
                {Number(item.order_count) === 1 ? "order" : "orders"}
              </small>
            </div>
          );
        })}
      </div>
    );
  }

  function renderAnalyticsPage() {
    const summary = analytics?.summary;
    const dailySales = analytics?.daily_sales || [];
    const topFoods = analytics?.top_foods || [];
    const restaurantSales = analytics?.restaurant_sales || [];

    return (
      <section className="menu admin-page analytics-page">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">NECTAR INSIGHTS</p>
            <h1>Sales &amp; Analytics</h1>
            <p>
              Explore sales trends and performance using real database data.
            </p>
          </div>

          <button
            onClick={loadAnalytics}
            disabled={analyticsLoading}
          >
            {analyticsLoading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>

        {analyticsLoading && <p>Loading sales analytics...</p>}

        {analyticsError && (
          <div className="admin-section-card">
            <p role="alert" className="admin-error">
              {analyticsError}
            </p>
            <button className="primary" onClick={loadAnalytics}>
              Try again
            </button>
          </div>
        )}

        {!analyticsLoading && !analyticsError && analytics && (
          <>
            <div className="admin-stats-grid analytics-summary-grid">
              <article className="admin-stat-card">
                <span className="admin-stat-icon">🧾</span>
                <p>Total orders</p>
                <h2>{summary?.total_orders ?? 0}</h2>
                <small>All saved orders</small>
              </article>

              <article className="admin-stat-card">
                <span className="admin-stat-icon">₹</span>
                <p>Total order value</p>
                <h2>
                  {formatCurrency(summary?.total_order_value)}
                </h2>
                <small>
                  Not necessarily the amount collected
                </small>
              </article>

              <article className="admin-stat-card">
                <span className="admin-stat-icon">📊</span>
                <p>Average order value</p>
                <h2>
                  {formatCurrency(summary?.average_order_value)}
                </h2>
                <small>Average value per saved order</small>
              </article>
            </div>

            <div className="analytics-two-column">
              <section className="admin-section-card analytics-panel">
                <h2>Daily Sales</h2>
                <p>
                  Order value over the last seven days.
                </p>
                {renderSalesChart(dailySales)}
              </section>

              <section className="admin-section-card analytics-panel">
                <h2>Restaurant Performance</h2>
                <p>Compare orders and order value by restaurant.</p>

                {restaurantSales.length === 0 ? (
                  <p>No restaurant data available.</p>
                ) : (
                  <div className="analytics-table-wrap">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Restaurant</th>
                          <th>Orders</th>
                          <th>Order value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {restaurantSales.map((restaurant) => (
                          <tr key={restaurant.restaurant_id}>
                            <td>{restaurant.restaurant_name}</td>
                            <td>{restaurant.order_count}</td>
                            <td>
                              {formatCurrency(restaurant.sales_value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <section className="admin-section-card">
              <h2>Best-Selling Foods</h2>
              <p>
                Top five food items ranked by quantity sold.
              </p>

              {topFoods.length === 0 ? (
                <p>No food sales have been recorded yet.</p>
              ) : (
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Food item</th>
                        <th>Quantity sold</th>
                        <th>Order value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topFoods.map((food, index) => (
                        <tr key={food.food_id}>
                          <td>
                            <span className="analytics-rank">
                              {index + 1}
                            </span>
                          </td>
                          <td>{food.food_name}</td>
                          <td>{food.quantity_sold}</td>
                          <td>{formatCurrency(food.sales_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="admin-actions">
              <button
                className="primary"
                onClick={loadAdminDashboard}
              >
                Back to Admin Dashboard
              </button>
              <button onClick={loadOrders}>
                View Order History
              </button>
            </div>
          </>
        )}

        {!analyticsLoading && !analyticsError && !analytics && (
          <div className="admin-section-card">
            <p>Analytics have not loaded yet.</p>
            <button className="primary" onClick={loadAnalytics}>
              Load analytics
            </button>
          </div>
        )}
      </section>
    );
  }

  function renderEatRitePage() {
    const totals = eatRiteData?.totals;
    const items = eatRiteData?.items || [];
    const insights = eatRiteData?.insights || [];
    const nutrients = [
      { label: "Calories", value: totals?.calories, unit: "kcal", icon: "🔥" },
      { label: "Protein", value: totals?.protein_g, unit: "g", icon: "💪" },
      { label: "Carbohydrates", value: totals?.carbohydrates_g, unit: "g", icon: "🌾" },
      { label: "Fat", value: totals?.fat_g, unit: "g", icon: "🥑" },
      { label: "Fibre", value: totals?.fibre_g, unit: "g", icon: "🥦" },
      { label: "Sugar", value: totals?.sugar_g, unit: "g", icon: "🍬" },
      { label: "Sodium", value: totals?.sodium_mg, unit: "mg", icon: "🧂" },
    ];

    return (
      <section className="menu eat-rite-page">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">NECTAR WELLNESS</p>
            <h1>🥗 Eat Rite</h1>
            <p>Understand the nutrition behind your order, one bite at a time.</p>
          </div>
          <button onClick={() => loadOrders()}>View order history</button>
        </div>

        <div className="eat-rite-note">
          <strong>Nutrition estimates, not medical advice</strong>
          <p>Values are illustrative estimates for this project demo. Actual nutrition varies by recipe, portion size, and preparation. A single order does not determine whether your overall diet is healthy.</p>
        </div>

        {eatRiteLoading && <p>Crunching the nutrition numbers...</p>}
        {eatRiteError && (
          <div className="admin-section-card" role="alert">
            <p className="admin-error">{eatRiteError}</p>
            {eatRiteOrderId && <button className="primary" onClick={() => loadEatRite(eatRiteOrderId)}>Try again</button>}
          </div>
        )}

        {!eatRiteLoading && !eatRiteError && eatRiteData && (
          <>
            <section className="eat-rite-order-summary">
              <div>
                <span>YOUR NUTRITION REPORT</span>
                <h2>Order #{eatRiteData.order?.order_id}</h2>
                <p>{formatOrderDate(eatRiteData.order?.order_date)}</p>
              </div>
              <div className="eat-rite-order-total">
                <span>Order total</span>
                <strong>{formatCurrency(eatRiteData.order?.total_amount)}</strong>
              </div>
            </section>

            {!eatRiteData.nutrition_complete && (
              <p className="eat-rite-warning">Nutrition data is missing for one or more items, so totals may be incomplete.</p>
            )}

            <div className="eat-rite-nutrient-grid">
              {nutrients.map((nutrient) => (
                <article className="eat-rite-nutrient-card" key={nutrient.label}>
                  <span className="eat-rite-nutrient-icon">{nutrient.icon}</span>
                  <p>{nutrient.label}</p>
                  <h2>{nutrient.value == null ? "N/A" : Number(nutrient.value).toLocaleString("en-IN", { maximumFractionDigits: 1 })}</h2>
                  <small>{nutrient.unit} · estimated</small>
                </article>
              ))}
            </div>

            <section className="admin-section-card eat-rite-section">
              <h2>Your plate, item by item</h2>
              <p>Values below are multiplied by the quantity in this order.</p>
              <div className="analytics-table-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr><th>Food</th><th>Qty</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fibre</th></tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.food_id}>
                        <td>{item.food_name}</td>
                        <td>{item.quantity}</td>
                        <td>{item.nutrition_available ? `${Math.round(item.nutrition.calories)} kcal` : "N/A"}</td>
                        <td>{item.nutrition_available ? `${Number(item.nutrition.protein_g).toFixed(1)} g` : "N/A"}</td>
                        <td>{item.nutrition_available ? `${Number(item.nutrition.carbohydrates_g).toFixed(1)} g` : "N/A"}</td>
                        <td>{item.nutrition_available ? `${Number(item.nutrition.fat_g).toFixed(1)} g` : "N/A"}</td>
                        <td>{item.nutrition_available ? `${Number(item.nutrition.fibre_g).toFixed(1)} g` : "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="admin-section-card eat-rite-section">
              <h2>🌱 Eat Rite insights</h2>
              <p>Gentle pointers based on the estimated nutrition in this order.</p>
              <div className="eat-rite-insights-list">
                {insights.map((insight, index) => (
                  <div className="eat-rite-insight" key={`${index}-${insight}`}>
                    <span>{index === 0 ? "💡" : "🥬"}</span>
                    <p>{insight}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="admin-actions">
              <button className="primary" onClick={() => loadEatRite(eatRiteOrderId)} disabled={eatRiteLoading}>Refresh analysis</button>
              <button onClick={loadOrders}>Analyse another order</button>
              <button onClick={() => setPage("home")}>Back to menu</button>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <div className="app">
      <header className="navbar">
        <button
          className="brand"
          onClick={() => {
            setPage("home");
            setOrderMessage("");
          }}
        >
          🌿 NECTAR
        </button>

        <nav>
          <button
            onClick={() => {
              setPage("home");
              setOrderMessage("");
            }}
          >
            Home
          </button>

          <button
            onClick={() => {
              setCategory("All");
              setSearch("");
              setPage("home");
              setOrderMessage("");
            }}
          >
            Menu
          </button>

          <button onClick={() => setPage("cart")}>
            Cart ({cartCount})
          </button>

          <button onClick={loadOrders}>Orders</button>
          <button onClick={loadAdminDashboard}>Admin</button>
          <button onClick={loadAnalytics}>Analytics</button>
          <button onClick={loadOrders}>Eat Rite 🥗</button>
        </nav>
      </header>

      <main>
        {page === "home" ? (
          <>
            <section className="hero">
              <p className="eyebrow">GOOD FOOD. BRIGHTER DAYS.</p>
              <h1>What are you craving today?</h1>
              <p>Discover your next favourite meal.</p>

              <input
                type="text"
                placeholder="Search food or restaurant..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </section>

            <section className="menu">
              <h2>Explore our menu</h2>

              <div className="filters">
                {categories.map((item) => (
                  <button
                    key={item}
                    className={category === item ? "active" : ""}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              {loading && <p>Loading delicious food...</p>}

              {error && (
                <p role="alert">
                  {error}{" "}
                  <button onClick={loadFoods}>Retry</button>
                </p>
              )}

              {!loading && !error && (
                <div className="food-grid">
                  {filteredFoods.map((food) => (
                    <article
                      className="food-card"
                      key={food.food_id}
                    >
                      <div className="food-emoji">
                        {foodEmojis[food.category_name] || "🍽️"}
                      </div>

                      <div className="food-info">
                        <p className="restaurant">
                          {food.restaurant_name}
                        </p>
                        <h3>{food.food_name}</h3>
                        <p className="price">
                          {formatCurrency(food.price)}
                        </p>
                        {renderQuantityControls(food)}
                      </div>
                    </article>
                  ))}

                  {filteredFoods.length === 0 && (
                    <p>No matching food found.</p>
                  )}
                </div>
              )}
            </section>
          </>
        ) : page === "cart" ? (
          <section className="menu">
            <button onClick={() => setPage("home")}>
              ← Continue shopping
            </button>

            <h1>Your cart</h1>

            {cart.length === 0 ? (
              <p>Your cart is empty. Add something delicious!</p>
            ) : (
              <>
                {cart.map((item) => (
                  <div className="cart-row" key={item.food_id}>
                    <span>
                      {foodEmojis[item.category_name] || "🍽️"}{" "}
                      {item.food_name}
                    </span>

                    <div className="quantity">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.food_name} quantity`}
                        onClick={() =>
                          changeQuantity(item.food_id, -1)
                        }
                      >
                        −
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        type="button"
                        aria-label={`Increase ${item.food_name} quantity`}
                        onClick={() =>
                          changeQuantity(item.food_id, 1)
                        }
                      >
                        +
                      </button>
                    </div>

                    <strong>
                      {formatCurrency(
                        Number(item.price) * item.quantity
                      )}
                    </strong>
                  </div>
                ))}

                <h2>Total: {formatCurrency(total)}</h2>

                <button
                  className="primary"
                  onClick={placeOrder}
                  disabled={placingOrder || cart.length === 0}
                >
                  {placingOrder
                    ? "Placing order..."
                    : "Place order (Cash on Delivery)"}
                </button>
              </>
            )}

            {orderMessage && (
              <p role="status" aria-live="polite">
                {orderMessage}
              </p>
            )}
          </section>
        ) : page === "orders" ? (
          <section className="menu orders-page">
            <button onClick={() => setPage("home")}>
              ← Back to menu
            </button>

            <h1>Order History</h1>
            <p>Your previous NECTAR orders.</p>

            {ordersLoading && <p>Loading your orders...</p>}

            {ordersError && (
              <p role="alert">
                {ordersError}{" "}
                <button onClick={loadOrders}>Retry</button>
              </p>
            )}

            {!ordersLoading &&
              !ordersError &&
              orders.length === 0 && (
                <p>
                  No orders yet. Your delicious journey starts here!
                </p>
              )}

            {!ordersLoading &&
              !ordersError &&
              orders.length > 0 && (
                <div className="orders-list">
                  {orders.map((order) => (
                    <article
                      className="order-card"
                      key={order.order_id}
                    >
                      <div className="order-card-header">
                        <strong>Order #{order.order_id}</strong>
                        <span className="order-status">
                          {order.status || "Placed"}
                        </span>
                      </div>

                      <p>{order.restaurant_name}</p>
                      <p>{formatOrderDate(order.order_date)}</p>

                      <div className="order-items">
                        {order.items?.map((item) => (
                          <div
                            className="order-item-row"
                            key={item.order_item_id}
                          >
                            <span>
                              {item.food_name} × {item.quantity}
                            </span>
                            <span>
                              {formatCurrency(item.subtotal)}
                            </span>
                          </div>
                        ))}

                        {(!order.items ||
                          order.items.length === 0) && (
                          <p>No item details available.</p>
                        )}
                      </div>

                      <strong className="order-total">
                        Total: {formatCurrency(order.total_amount)}
                      </strong>
                      <div className="order-card-actions">
                        <button className="primary" onClick={() => loadEatRite(order.order_id)}>
                          🥗 Analyse with Eat Rite
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
          </section>
        ) : page === "admin" ? (
          <section className="menu admin-page">
            <div className="admin-heading">
              <div>
                <p className="eyebrow">NECTAR MANAGEMENT</p>
                <h1>Admin Dashboard</h1>
                <p>Live overview of your food delivery database.</p>
              </div>

              <button
                onClick={loadAdminDashboard}
                disabled={adminLoading}
              >
                {adminLoading ? "Refreshing..." : "↻ Refresh"}
              </button>
            </div>

            {adminLoading && <p>Loading dashboard statistics...</p>}

            {adminError && (
              <p role="alert" className="admin-error">
                {adminError}{" "}
                <button onClick={loadAdminDashboard}>Try again</button>
              </p>
            )}

            {!adminLoading && !adminError && adminStats && (
              <>
                <div className="admin-stats-grid">
                  <article className="admin-stat-card">
                    <span className="admin-stat-icon">🧾</span>
                    <p>Total orders</p>
                    <h2>{adminStats.total_orders}</h2>
                  </article>

                  <article className="admin-stat-card">
                    <span className="admin-stat-icon">₹</span>
                    <p>Total order value</p>
                    <h2>{formatCurrency(adminStats.total_revenue)}</h2>
                    <small>
                      Includes all saved orders, regardless of payment status.
                    </small>
                  </article>

                  <article className="admin-stat-card">
                    <span className="admin-stat-icon">👥</span>
                    <p>Customers</p>
                    <h2>{adminStats.total_customers}</h2>
                  </article>

                  <article className="admin-stat-card">
                    <span className="admin-stat-icon">🍽️</span>
                    <p>Menu items</p>
                    <h2>{adminStats.total_food_items}</h2>
                    <small>
                      {adminStats.available_food_items} currently available
                    </small>
                  </article>

                  <article className="admin-stat-card">
                    <span className="admin-stat-icon">⏳</span>
                    <p>Orders marked Placed</p>
                    <h2>{adminStats.placed_orders}</h2>
                  </article>
                </div>

                <div className="admin-section-card">
                  <h2>Quick actions</h2>
                  <p>Manage the menu and review customer orders.</p>

                  <div className="admin-actions">
                    <button
                      className="primary"
                      onClick={() => setPage("home")}
                    >
                      View customer menu
                    </button>

                    <button onClick={loadOrders}>
                      View order history
                    </button>

                    <button onClick={loadAnalytics}>
                      Sales &amp; Analytics
                    </button>
                  </div>
                </div>
              </>
            )}

            {!adminLoading && !adminError && !adminStats && (
              <div className="admin-section-card">
                <p>Dashboard statistics have not loaded yet.</p>
                <button
                  className="primary"
                  onClick={loadAdminDashboard}
                >
                  Load statistics
                </button>
              </div>
            )}
          </section>
        ) : page === "analytics" ? (
          renderAnalyticsPage()
        ) : page === "eatrite" ? (
          renderEatRitePage()
        ) : null}
      </main>

      <footer>NECTAR · Good food. Brighter days.</footer>
    </div>
  );
}

export default App;
