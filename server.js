const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// মিডলওয়্যার সেটআপ
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Aiven MySQL ডাটাবেস কানেকশন পুল
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 23643,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
});

// ডাটাবেস টেবিল রিসেট এবং নতুন করে তৈরি করার ফাংশন
function resetAndInitializeDatabase() {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error("Database connection initialization failed:", err);
            return;
        }

        console.log("Initializing Database Reset...");

        // ১. পুরাতন 'links' টেবিল থাকলে তা মুছে ফেলা (Drop Old Table)
        const dropQuery = `DROP TABLE IF EXISTS links;`;

        // ২. নতুন করে 'links' টেবিল তৈরি করা (Create New Table)
        const createQuery = `
            CREATE TABLE links (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                url VARCHAR(255) DEFAULT '#'
            );
        `;

        // ৩. ফ্রন্টএন্ডে দেখানোর জন্য নতুন ডেমো ডেটা ইনসার্ট করা (Insert Fresh Seed Data)
        const insertQuery = `
            INSERT INTO links (title, url) VALUES 
            ('Entering and leaving Australia', '#'),
            ('Visas', '#'),
            ('Australian citizenship', '#'),
            ('What we do', '#'),
            ('Settling in Australia', '#'),
            ('Help and support', '#');
        `;

        // কুয়েরিগুলো ক্রমানুসারে রান করা
        connection.query(dropQuery, (err) => {
            if (err) return console.error("Error dropping table:", err);
            console.log("Old 'links' table dropped (if existed).");

            connection.query(createQuery, (err) => {
                if (err) return console.error("Error creating table:", err);
                console.log("Fresh 'links' table created successfully.");

                connection.query(insertQuery, (err) => {
                    if (err) return console.error("Error inserting seed data:", err);
                    console.log("New dynamic links inserted into database successfully.");
                    connection.release(); // কানেকশন মুক্ত করা
                });
            });
        });
    });
}

// সার্ভার চালু হওয়ার সাথে সাথেই ডাটাবেস রিসেট ফাংশনটি রান হবে
resetAndInitializeDatabase();

// ডাটাবেস কানেকশন টেস্ট করার রুট
app.get('/api/test-db', (req, res) => {
    pool.query('SELECT 1', (err, results) => {
        if (err) {
            console.error("Database connection check error:", err);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: "Connected to Aiven MySQL successfully!" });
    });
});

// ফ্রন্টএন্ডের জন্য নতুন লিঙ্ক ডেটা তুলে আনার API এন্ডপয়েন্ট
app.get('/api/links', (req, res) => {
    pool.query('SELECT title, url FROM links', (err, results) => {
        if (err) {
            console.error("Error fetching data from links table:", err);
            return res.json([]); 
        }
        res.json(results);
    });
});

// মেইন ফ্রন্টএন্ড ফাইল সার্ভ করা
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running dynamically on port ${PORT}`);
});
