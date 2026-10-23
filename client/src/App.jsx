
import { useState, useEffect } from "react";
import "./App.css";

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

  // Fetch food items from MySQL through the Express API
  useEffect(() => {
    fetch("http://localhost:5000/api/foods")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch food items");
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

  // Filter food by search text and category
  const filteredFoods = foods.filter((food) => {
    const searchText =
      `${food.food_name} ${food.restaurant_name}`.toLowerCase();

    const matchesSearch = searchText.includes(search.toLowerCase());
    const matchesCategory =
      category === "All" || food.category_name === category;

    return matchesSearch && matchesCategory;
  });

  // Add a food item to the cart
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

  // Increase or decrease quantity
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

  return (
    <div className="app">
      <header className="navbar">
        <button
          className="brand"
          onClick={() => setPage("home")}
        >
          🌿 NECTAR
        </button>

        <nav>
          <button onClick={() => setPage("home")}>Home</button>
          <button
            onClick={() => {
              setCategory("All");
              setSearch("");
              setPage("home");
            }}
          >
            Menu
          </button>
          <button onClick={() => setPage("cart")}>
            Cart ({cartCount})
          </button>
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
                  {error}
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

                        <button
                          className="primary"
                          onClick={() => addToCart(food)}
                          disabled={!food.availability}
                        >
                          {food.availability
                            ? "+ Add to cart"
                            : "Unavailable"}
                        </button>
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
        ) : (
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
                        onClick={() =>
                          changeQuantity(item.food_id, -1)
                        }
                      >
                        −
                      </button>

                      <span>{item.quantity}</span>

                      <button
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
                  onClick={() =>
                    alert(
                      "Your cart works! Database-backed checkout is our next step."
                    )
                  }
                >
                  Proceed to checkout
                </button>
              </>
            )}
          </section>
        )}
      </main>

      <footer>NECTAR · Good food. Brighter days.</footer>
    </div>
  );
}

export default App;
