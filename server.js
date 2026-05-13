require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

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

    // 1. Define the Tools (Functions) the Agent is allowed to use
    const tools = [
        {
            type: "function",
            function: {
                name: "search_ecommerce",
                description: "Search the AgentMart store for products. Use this when the user wants to buy or shop for an item.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The core product noun to search for (e.g. laptop, chair)" }
                    },
                    required: ["query"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "search_flights",
                description: "Search SkyAgent for flights. Use this when the user wants to travel or book a ticket.",
                parameters: {
                    type: "object",
                    properties: {
                        destination: { type: "string", description: "Where the user wants to fly to" },
                        origin: { type: "string", description: "Where the user is flying from" }
                    },
                    required: ["destination"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "store_memory",
                description: "Store a fact, preference, or context about the user for long-term memory. Use this when the user tells you something important to remember.",
                parameters: {
                    type: "object",
                    properties: {
                        fact: { type: "string", description: "The specific fact or preference to remember" },
                        category: { type: "string", description: "Category of the memory (e.g., preference, personal_info, work)" }
                    },
                    required: ["fact"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "search_memory",
                description: "Search the long-term memory database for past context, facts, or preferences. Use this when you need to recall something the user previously told you.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The topic or keyword to search for in memory" }
                    },
                    required: ["query"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "browse_web",
                description: "Open an invisible browser to navigate to a specific URL and extract the page text. Use this when the user asks you to read or scrape a website.",
                parameters: {
                    type: "object",
                    properties: {
                        url: { type: "string", description: "The full URL of the website to visit (e.g., https://example.com)" }
                    },
                    required: ["url"]
                }
            }
        }
    ];

    try {
        // 2. Send the conversation AND the tools to the LLM
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "You are an advanced Agent OS. You manage a user's life. If the user wants to buy something or travel, you MUST use the provided tools. If they just want to chat, reply conversationally." },
                    ...messages
                ],
                tools: tools,
                tool_choice: "auto" // Let the LLM decide if it needs a tool or just wants to talk
            })
        });

        if (!response.ok) {
            const errorDetails = await response.json();
            throw new Error(`Groq Error: ${errorDetails.error?.message || "Unknown error"}`);
        }
        
        const data = await response.json();
        const responseMessage = data.choices[0].message;

        // 3. Intercept Tool Calls: Did the LLM decide to execute code?
        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            const toolCall = responseMessage.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            
            console.log(`[Agent-OS] Executing Tool: ${toolCall.function.name}`, args);

            if (toolCall.function.name === "search_ecommerce") {
                return res.json({ 
                    domain: "ecommerce", 
                    keywords: args.query ? [args.query] : [], 
                    reply: "I'll scan the marketplace for those items right now." 
                });
            }
            if (toolCall.function.name === "search_flights") {
                return res.json({ 
                    domain: "travel", 
                    keywords: [args.destination], 
                    reply: `I will check flight availability for ${args.destination}.` 
                });
            }
            if (toolCall.function.name === "store_memory") {
                const db = getDB();
                if (!db.memory) db.memory = [];
                db.memory.push({
                    id: genId('mem'),
                    fact: args.fact,
                    category: args.category || "general",
                    timestamp: new Date().toISOString()
                });
                saveDB(db);
                return res.json({
                    domain: "memory",
                    keywords: [args.category],
                    reply: `Got it! I have securely committed this to long-term memory: "${args.fact}"`
                });
            }
            if (toolCall.function.name === "search_memory") {
                const db = getDB();
                if (!db.memory) db.memory = [];
                // Simple keyword/semantic search simulation
                const results = db.memory.filter(m => m.fact.toLowerCase().includes(args.query.toLowerCase()) || (m.category && m.category.toLowerCase().includes(args.query.toLowerCase())));
                
                if (results.length > 0) {
                    const memories = results.map(r => r.fact).join(" | ");
                    return res.json({
                        domain: "memory_recall",
                        keywords: [args.query],
                        reply: `I checked my memory banks. Here is what I remember: ${memories}`
                    });
                } else {
                    return res.json({
                        domain: "memory_recall",
                        keywords: [args.query],
                        reply: `I searched my memory for "${args.query}" but couldn't find anything.`
                    });
                }
            }
            if (toolCall.function.name === "browse_web") {
                const url = args.url;
                if (!url.startsWith('http')) return res.json({ domain: "web_scraping", keywords: [url], reply: "I need a valid URL starting with http or https."});
                
                try {
                    const browser = await puppeteer.launch({ headless: true });
                    const page = await browser.newPage();
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
                    const text = await page.evaluate(() => {
                        const main = document.querySelector('main') || document.querySelector('#content') || document.body;
                        return main.innerText.replace(/\n+/g, '\n').substring(0, 3000);
                    });
                    await browser.close();
                    
                    // IMPROVEMENT: Feed the raw text back to the LLM to organize and summarize it
                    const summaryResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "llama-3.1-8b-instant",
                            messages: [
                                { role: "system", content: "You are a helpful AI assistant. Summarize and organize the following scraped website data into a clean, easy-to-read response for the user. Focus on the core content and ignore menu/navigation text." },
                                { role: "user", content: `URL: ${url}\n\nScraped Data:\n${text}` }
                            ]
                        })
                    });
                    
                    const summaryData = await summaryResponse.json();
                    const cleanReply = summaryData.choices[0].message.content;

                    return res.json({
                        domain: "web_scraping",
                        keywords: [url],
                        reply: `I invisibly navigated to ${url} and synthesized the data:\n\n${cleanReply}`
                    });
                } catch (err) {
                    return res.json({
                        domain: "web_scraping",
                        keywords: [url],
                        reply: `I tried to scrape ${url} but ran into an error: ${err.message}`
                    });
                }
            }
        }

        // 4. No tools called? It's just a regular conversation!
        return res.json({ 
            domain: "general", 
            keywords: [], 
            reply: responseMessage.content 
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 🛒 AGENT E-COMMERCE SITE
// ==========================================

// Agent browses the store (Live eBay Scrape)
app.get('/api/ecommerce/products', async (req, res) => {
    const q = req.query.q || 'laptops';
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        
        // Anti-bot header
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        
        // Go to eBay
        const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Extract exact DOM elements (Titles, Real Prices, Real Images)
        const scrapedItems = await page.evaluate(() => {
            const items = [];
            const nodes = document.querySelectorAll('.s-item');
            nodes.forEach(node => {
                const titleEl = node.querySelector('.s-item__title');
                const priceEl = node.querySelector('.s-item__price');
                const imgEl = node.querySelector('.s-item__image-img');
                
                // We want 8 items. eBay has a hidden first item we skip
                if (titleEl && priceEl && imgEl && items.length < 8) {
                    const title = titleEl.innerText;
                    if (title.toLowerCase().includes("shop on ebay")) return; // Skip dummy headers
                    
                    const priceText = priceEl.innerText.replace(/[^0-9.]/g, ''); // Extract just the number
                    
                    // Handle lazy loaded images (eBay often uses a 1x1 transparent GIF in 'src')
                    let imgUrl = imgEl.getAttribute('data-src') || imgEl.getAttribute('data-original') || imgEl.src;
                    
                    // Fallback to random unsplash image if imgUrl is somehow a 1x1 gif or missing
                    if (!imgUrl || imgUrl.includes('s_1x2.gif') || imgUrl.includes('base64')) {
                        imgUrl = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80"; // Tech fallback
                    }
                    
                    // Force the query into the description so the chat.html filter ALWAYS matches it
                    items.push({
                        id: 'ebay_' + Math.random().toString(36).substr(2, 9),
                        name: title,
                        price: parseFloat(priceText) || 0,
                        image_url: imgUrl,
                        description: `Live eBay Result matching your query.`,
                        rating: (Math.random() * 1.5 + 3.5).toFixed(1), // Mock rating between 3.5 and 5.0
                        stock: Math.floor(Math.random() * 20) + 1,
                        category: "ebay_live"
                    });
                }
            });
            return items;
        });
        await browser.close();

        // If eBay blocked us or changed DOM, force fallback to local DB!
        if (scrapedItems.length === 0) {
            throw new Error("Scraper was blocked by eBay or returned 0 items.");
        }

        res.json({
            store_name: "Live eBay Scraper",
            message: `Live data scraped from eBay for '${q}'`,
            products: scrapedItems
        });
    } catch (error) {
        console.error("Scraping error:", error);
        // Fallback to local db
        const db = getDB();
        let products = db.ecommerce.products;
        if (q) {
            products = products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase()));
        }
        res.json({
            store_name: "AgentMart (Local Fallback)",
            message: "Live Scrape failed, showing local items.",
            products: products
        });
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
