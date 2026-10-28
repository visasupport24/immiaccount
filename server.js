const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// মিডলওয়্যার সেটআপ (ফ্রন্টএন্ডের JSON ডাটা রিড করার জন্য)
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Aiven MySQL ডাটাবেস কানেকশন পুল (Pool)
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
        rejectUnauthorized: false // Aiven ক্লাউডের সিকিউর কানেকশনের জন্য আবশ্যক
    }
});

// ডাটাবেস টেবিল ও ডেমো ডাটা রিসেট করার ফাংশন (সার্ভার চালুর সময় অটোমেটিক রান হবে)
function resetAndInitializeDatabase() {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error("Database connection initialization failed:", err);
            return;
        }

        console.log("Initializing Database Reset & Setup...");

        // ১. পুরাতন টেবিল থাকলে মুছে ফেলা
        const dropLinksQuery = `DROP TABLE IF EXISTS links;`;
        const dropUsersQuery = `DROP TABLE IF EXISTS users;`;

        // ২. নতুন 'links' টেবিল তৈরি
        const createLinksQuery = `
            CREATE TABLE links (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                url VARCHAR(255) DEFAULT '#'
            );
        `;

        // ৩. অ্যাকাউন্ট ডেটা সেভ করার জন্য নতুন 'users' টেবিল তৈরি
        const createUsersQuery = `
            CREATE TABLE users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ৪. খাতার স্কেচ অনুযায়ী ডেমো লিঙ্ক ডেটা ইনসার্ট
        const insertLinksQuery = `
            INSERT INTO links (title, url) VALUES 
            ('Entering and leaving Australia', '#'),
            ('Visas', '#'),
            ('Australia citizenship', '#'),
            ('What we do', '#'),
            ('Settling in Australia', '#'),
            ('Help and support', '#');
        `;

        // কুয়েরিগুলো ক্রমানুসারে নিখুঁতভাবে রান করানো হচ্ছে
        connection.query(dropLinksQuery, (err) => {
            if (err) return console.error(err);
            connection.query(dropUsersQuery, (err) => {
                if (err) return console.error(err);
                
                connection.query(createLinksQuery, (err) => {
                    if (err) return console.error(err);
                    console.log("'links' table created.");
                    
                    connection.query(createUsersQuery, (err) => {
                        if (err) return console.error(err);
                        console.log("'users' table created successfully.");
                        
                        connection.query(insertLinksQuery, (err) => {
                            if (err) return console.error(err);
                            console.log("Seed links inserted into Aiven MySQL.");
                            connection.release(); // কানেকশন মুক্ত করা
                        });
                    });
                });
            });
        });
    });
}

// সার্ভার চালু হওয়ার সাথে সাথেই ডাটাবেস আর্কিটেকচার অটো-রেডি হবে
resetAndInitializeDatabase();

// ১. ফ্রন্টএন্ডের জন্য লিঙ্ক ডেটা তুলে আনার API
app.get('/api/links', (req, res) => {
    pool.query('SELECT title, url FROM links', (err, results) => {
        if (err) {
            console.error("Error fetching links:", err);
            return res.json([]); 
        }
        res.json(results);
    });
});

// ২. রেজিস্ট্রেশন ফর্ম প্রসেস করার API এন্ডপয়েন্ট (POST Route)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required!" });
    }

    const insertUserQuery = `INSERT INTO users (username, password) VALUES (?, ?);`;

    pool.query(insertUserQuery, [username, password], (err, result) => {
        if (err) {
            console.error("Error inserting user:", err);
            // যদি একই ইউজারনেম আগে থেকেই ডাটাবেসে থাকে
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ success: false, message: "Username or Email already exists!" });
            }
            return res.status(500).json({ success: false, message: "Database error occurred!" });
        }
        
        console.log(`New user registered: ${username}`);
        res.json({ success: true, message: "Account successfully created in Aiven MySQL!" });
    });
});

// ৩. লগইন ভেরিফিকেশন করার নতুন API এন্ডপয়েন্ট (POST Route)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required!" });
    }

    // ডাটাবেসে ওই ইউজারনেম এবং পাসওয়ার্ড ম্যাচ করে কি না তা চেক করার কুয়েরি
    const checkUserQuery = `SELECT * FROM users WHERE username = ? AND password = ?;`;

    pool.query(checkUserQuery, [username, password], (err, results) => {
        if (err) {
            console.error("Database login query error:", err);
            return res.status(500).json({ success: false, message: "Server database error!" });
        }

        // যদি ডাটাবেসে ম্যাচিং ইউজার পাওয়া যায়
        if (results.length > 0) {
            console.log(`User logged in successfully: ${username}`);
            res.json({ success: true, message: "Login successful!" });
        } else {
            // যদি ইউজারনেম বা পাসওয়ার্ড ভুল হয়
            res.status(401).json({ success: false, message: "Invalid username or password!" });
        }
    });
});

// মেইন স্ট্যাটিক ফাইল রুট
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// সার্ভার লিসেনিং
app.listen(PORT, () => {
    console.log(`Fullstack Server running dynamically on port ${PORT}`);
});
