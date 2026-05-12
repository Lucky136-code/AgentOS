const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'database.json');

// Helper to read database
function getDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

// Helper to save database
function saveDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Generate unique ID
const genId = (prefix) => `${prefix}_${Math.random().toString(36).substr(2, 9)}`;

// ==========================================
// 🛒 AGENT E-COMMERCE SITE
// ==========================================

// Agent browses the store
app.get('/api/ecommerce/products', (req, res) => {
    const db = getDB();
    res.json({
        store_name: "AgentMart",
        message: "Welcome to AgentMart. Use these product IDs to place an order.",
        products: db.ecommerce.products
    });
});

// Agent buys a product
app.post('/api/ecommerce/buy', (req, res) => {
    const { product_id, quantity, buyer_agent_id } = req.body;
    
    if (!product_id || !quantity || !buyer_agent_id) {
        return res.status(400).json({ error: "Missing required fields: product_id, quantity, buyer_agent_id" });
    }

    const db = getDB();
    const product = db.ecommerce.products.find(p => p.id === product_id);

    if (!product) return res.status(404).json({ error: "Product not found" });
    if (product.stock < quantity) return res.status(400).json({ error: `Not enough stock. Only ${product.stock} left.` });

    // Process order
    product.stock -= quantity;
    const order = {
        order_id: genId('ord'),
        buyer: buyer_agent_id,
        product: product.name,
        quantity: quantity,
        total_cost: product.price * quantity,
        timestamp: new Date().toISOString()
    };
    
    db.ecommerce.orders.push(order);
    saveDB(db);

    res.status(201).json({
        message: "Purchase successful!",
        receipt: order
    });
});

// ==========================================
// ✈️ AGENT BOOKING SITE
// ==========================================

// Agent searches for flights
app.get('/api/booking/flights', (req, res) => {
    const db = getDB();
    res.json({
        agency: "SkyAgent Travel",
        flights: db.booking.flights
    });
});

// Agent books a flight
app.post('/api/booking/book', (req, res) => {
    const { flight_id, passenger_name, agent_id } = req.body;

    if (!flight_id || !passenger_name || !agent_id) {
        return res.status(400).json({ error: "Missing required fields: flight_id, passenger_name, agent_id" });
    }

    const db = getDB();
    const flight = db.booking.flights.find(f => f.id === flight_id);

    if (!flight) return res.status(404).json({ error: "Flight not found" });
    if (flight.seats_available <= 0) return res.status(400).json({ error: "Flight is fully booked." });

    flight.seats_available -= 1;
    const booking = {
        booking_ref: genId('bkg'),
        agent: agent_id,
        passenger: passenger_name,
        flight_details: `${flight.departure} to ${flight.arrival} on ${flight.airline}`,
        timestamp: new Date().toISOString()
    };

    db.booking.bookings.push(booking);
    saveDB(db);

    res.status(201).json({
        message: "Flight booked successfully!",
        confirmation: booking
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.lang="javascript"
    console.log(`🤖 Agent World running on http://localhost:${PORT}`);
});
