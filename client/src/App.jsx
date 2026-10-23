
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

  // Load food from MySQL through the Express backend.
  useEffect(() => {
    fetch(`${API_URL}/foods`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch food items.");
        }
        return response.json();
      })
      .then((data) => {
        setFoods(data);
        setError("");
      })
      .catch((err) => {
        console.error("Food loading error:", err);
        setError(
          "Could not load food. Make sure the backend and MySQL are running."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Search and category filters.
  const filteredFoods = foods.filter((food) => {
    const searchText =
      `${food.food_name} ${food.restaurant_name}`.toLowerCase();

    const matchesSearch = searchText.includes(search.toLowerCase());
    const matchesCategory =
      category === "All" || food.category_name === category;

    return matchesSearch && matchesCategory;
  });

  // Add a food item to the cart.
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

  // Update quantity and remove items when quantity reaches zero.
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

  // Show Add to Cart or the quantity stepper.
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

  // Place an order through the existing backend API.
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

      const orderId = data.order_id ?? data.orderId;

      setOrderMessage(
        orderId != null
          ? `Order placed successfully! Order ID: ${orderId}.`
          : "Order placed successfully!"
      );

      setCart([]);
    } catch (err) {
      console.error("Order error:", err);
      setOrderMessage(
        err.message || "Could not place your order."
      );
    } finally {
      setPlacingOrder(false);
    }
  }

  // Fetch order history, including individual food items.
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
        throw new Error(
          data.error || "Could not load order history."
        );
      }

      if (!Array.isArray(data)) {
        throw new Error("Unexpected order history response.");
      }

      setOrders(data);
    } catch (err) {
      console.error("Order history error:", err);
      setOrdersError(
        err.message || "Could not load order history."
      );
    } finally {
      setOrdersLoading(false);
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
        </nav>
      </header>

      <main>
        {page === "home" ? (
          <>
            <section className="hero">
              <p className="eyebrow">
                GOOD FOOD. BRIGHTER DAYS.
              </p>

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
                  <button onClick={() => window.location.reload()}>
                    Retry
                  </button>
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
                          ₹{Number(food.price).toFixed(0)}
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
              <p>
                Your cart is empty. Add something delicious!
              </p>
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
                      ₹
                      {(
                        Number(item.price) * item.quantity
                      ).toFixed(2)}
                    </strong>
                  </div>
                ))}

                <h2>Total: ₹{total.toFixed(2)}</h2>

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
        ) : (
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
                              ₹{Number(item.subtotal).toFixed(2)}
                            </span>
                          </div>
                        ))}

                        {(!order.items ||
                          order.items.length === 0) && (
                          <p>No item details available.</p>
                        )}
                      </div>

                      <strong className="order-total">
                        Total: ₹
                        {Number(order.total_amount).toFixed(2)}
                      </strong>
                    </article>
                  ))}
                </div>
              )}
          </section>
        )}
      </main>

      <footer>NECTAR · Good food. Brighter days.</footer>
    </div>
  );
}

export default App;
