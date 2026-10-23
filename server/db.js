
const mysql = require("mysql2");

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: process.env.DB_PASSWORD,
  database: "nectar",
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = db;
