// src/app.js — Express app setup and middleware
// Wires together middleware, static files, and routes.
// Kept separate from server.js so the app can be imported in tests.

const express = require('express');
const cors = require('cors');
const path = require('path');

const commandRoutes = require('./routes/commands');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Request logger
app.use((req, res, next) => {
    const now = new Date().toISOString();
    const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : '';
    console.log(`[${now}] ${req.method} ${req.path} ${body}`);
    next();
});

app.use('/api', commandRoutes);

// Serve frontend for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;