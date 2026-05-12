require('dotenv').config();
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
// 🧠 AGENT BRAIN (LLM PROXY)
// ==========================================

app.post('/api/chat/analyze', async (req, res) => {
    const { messages } = req.body;
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey || apiKey === 'your_key_goes_here') {
        return res.status(500).json({ error: "Server missing GROQ_API_KEY in .env file" });
    }

    const systemPrompt = `You are the brain of an Agent OS.
Categorize the user's query into one of three domains:
1. 'ecommerce': The user wants to buy a product, shop, or see what items are available.
2. 'travel': The user wants to book a flight or travel.
3. 'general': The user is saying hi, or asking an unrelated conversational question.

Extract the core keywords (nouns/search terms) as an array. (e.g. "buy a book" -> ["book"]). If they ask "what is available", leave keywords empty.
Extract maxPrice if mentioned (as a number).
Provide a conversational 'reply' confirming what you understood.
Output ONLY valid JSON in this exact format: 
{ "domain": "ecommerce"|"travel"|"general", "keywords": ["kw1"], "maxPrice": 100, "reply": "I can help you buy that." }`;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages
                ],
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errorDetails = await response.json();
            throw new Error(`Groq Error: ${errorDetails.error?.message || "Unknown error"}`);
        }
        
        const data = await response.json();
        res.json(JSON.parse(data.choices[0].message.content));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 🛒 AGENT E-COMMERCE SITE
// ==========================================

// Agent browses the store (Live API Connection)
app.get('/api/ecommerce/products', async (req, res) => {
    const q = req.query.q || '';
    try {
        // 1. Backend connects to external public internet API
        const response = await fetch(`https://dummyjson.com/products/search?q=${q}&limit=5`);
        const data = await response.json();
        
        // 2. Translate external API data into the Agent OS standard format
        const mappedProducts = data.products.map(p => ({
            id: `prod_${p.id}`,
            name: p.title,
            price: p.price,
            stock: p.stock,
            category: p.category,
            rating: p.rating,
            image_url: p.thumbnail,
            description: p.description
        }));

        res.json({
            store_name: "AgentMart (Powered by DummyJSON)",
            message: "Live products fetched from the open internet.",
            products: mappedProducts
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch from external API." });
    }
});

// Agent buys a product
app.post('/api/ecommerce/buy', (req, res) => {
    const { product_id, quantity, buyer_agent_id, shipping_address, payment_method, payment_id } = req.body;
    
    // Strict validation for "real" e-commerce checkout
    if (!product_id || !quantity || !buyer_agent_id) {
        return res.status(400).json({ error: "Missing required fields: product_id, quantity, buyer_agent_id" });
    }
    if (!shipping_address) {
        return res.status(400).json({ error: "Checkout failed: Missing shipping_address." });
    }
    if (!payment_method || !payment_id) {
        return res.status(400).json({ error: "Checkout failed: Missing payment details (payment_method, payment_id)." });
    }

    const db = getDB();
    
    // In a real app, we would verify the price against the external API here.
    // For this demo, we bypass local DB lookup since the products come from the internet.
    const mockExternalProduct = {
        name: "Item " + product_id,
        price: 99.99, // Mocking price since we bypassed local DB
        stock: 10
    };

    // Process order
    const order = {
        order_id: genId('ord'),
        buyer_agent: buyer_agent_id,
        product: product_id, // Saving ID instead of name to adapt to external API
        quantity: quantity,
        shipping_to: shipping_address,
        payment_status: `Paid via ${payment_method} (${payment_id})`,
        timestamp: new Date().toISOString()
    };
    
    db.ecommerce.orders.push(order);
    saveDB(db);

    res.status(201).json({
        message: "Payment verified and purchase successful!",
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
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🤖 Agent World running on http://localhost:${PORT}`);
});
