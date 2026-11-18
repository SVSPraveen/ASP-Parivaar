// api/index.js - Vercel Serverless Function for ASP Parivaar
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();

// Configuration
const ADMIN_PIN = process.env.ADMIN_PIN || 'asp2025';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_live_S2VewO1jmc2WbS';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const MONGODB_URI = process.env.MONGODB_URI || '';

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Razorpay SDK initialization
let razorpay = null;
try {
    const Razorpay = require('razorpay');
    if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
        razorpay = new Razorpay({
            key_id: RAZORPAY_KEY_ID,
            key_secret: RAZORPAY_KEY_SECRET
        });
    }
} catch (e) {
    console.log('[Payment] Razorpay SDK loading in demo mode.');
}

// ---------------------------------------------------------------------
// DATABASE LAYER: MongoDB Atlas with Graceful Fallback
// ---------------------------------------------------------------------
let cachedDb = null;

async function connectToDatabase() {
    if (!MONGODB_URI) {
        return null;
    }
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }
    try {
        const db = await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            bufferCommands: false
        });
        cachedDb = db;
        console.log('[DB] Connected to MongoDB Atlas successfully.');
        return db;
    } catch (err) {
        console.error('[DB] MongoDB connection failed; running in fallback mode:', err.message);
        return null;
    }
}

// Mongoose Schemas (used when MONGODB_URI is provided)
const donationSchema = new mongoose.Schema({
    id: String,
    date: { type: String, default: () => new Date().toISOString() },
    fullName: String,
    mobile: String,
    email: String,
    amount: Number,
    source: String,
    paymentStatus: String,
    transactionId: String,
    orderId: String
});

const volunteerSchema = new mongoose.Schema({
    id: String,
    date: { type: String, default: () => new Date().toISOString() },
    fullName: String,
    mobile: String,
    email: String,
    address: String,
    message: String
});

const messageSchema = new mongoose.Schema({
    id: String,
    date: { type: String, default: () => new Date().toISOString() },
    fullName: String,
    email: String,
    subject: String,
    message: String
});

const DonationModel = mongoose.models.Donation || mongoose.model('Donation', donationSchema);
const VolunteerModel = mongoose.models.Volunteer || mongoose.model('Volunteer', volunteerSchema);
const MessageModel = mongoose.models.Message || mongoose.model('Message', messageSchema);

// Fallback in-memory storage (active if MONGODB_URI is not set)
const memoryStore = {
    donations: [
        {
            id: "don_sample_01",
            date: new Date().toISOString(),
            fullName: "Ramesh Sharma",
            mobile: "9876543210",
            email: "ramesh@example.com",
            amount: 1100,
            source: "Razorpay Online",
            paymentStatus: "Verified",
            transactionId: "pay_sample_12345"
        }
    ],
    volunteers: [
        {
            id: "vol_sample_01",
            date: new Date().toISOString(),
            fullName: "Ananya Verma",
            mobile: "9876543211",
            email: "ananya@example.com",
            address: "Lucknow, UP",
            message: "Passionate about teaching underprivileged children in Lucknow."
        }
    ],
    messages: [
        {
            id: "msg_sample_01",
            date: new Date().toISOString(),
            fullName: "Vikram Malhotra",
            email: "vikram@example.com",
            subject: "Partnership with Community Youth Club",
            message: "We would love to collaborate on your Clean & Green drives."
        }
    ]
};

// Admin authentication middleware
function requireAdmin(req, res, next) {
    const headerPin = req.headers['x-admin-pin'];
    const authHeader = req.headers['authorization'];
    let bearerPin = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        bearerPin = authHeader.substring(7).trim();
    }

    const providedPin = headerPin || bearerPin;
    if (!providedPin || String(providedPin).trim() !== String(ADMIN_PIN).trim()) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Invalid Admin PIN'
        });
    }
    next();
}

// ---------------------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------------------

// 1. Health check
app.get('/api/health', async (req, res) => {
    const db = await connectToDatabase();
    res.json({
        status: 'online',
        service: 'ASP Parivaar Serverless API',
        environment: process.env.NODE_ENV || 'production',
        database: db ? 'MongoDB Atlas Connected' : 'Fallback Mode (Set MONGODB_URI in Vercel to persist to cloud database)',
        timestamp: new Date().toISOString()
    });
});

// 2. Create Razorpay Payment Order
app.post('/api/payment/create-order', async (req, res) => {
    try {
        const { amount, fullName, email, mobile } = req.body;
        const numAmount = parseInt(amount, 10);

        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid donation amount.' });
        }

        const amountInPaise = numAmount * 100;

        if (razorpay) {
            const options = {
                amount: amountInPaise,
                currency: "INR",
                receipt: `rcpt_${Date.now()}`
            };
            const order = await razorpay.orders.create(options);
            return res.json({
                success: true,
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                key: RAZORPAY_KEY_ID
            });
        }

        // Development / Demo order creation
        const mockOrderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        return res.json({
            success: true,
            orderId: mockOrderId,
            amount: amountInPaise,
            currency: "INR",
            key: RAZORPAY_KEY_ID,
            demoMode: true
        });
    } catch (err) {
        console.error('Order creation error:', err);
        res.status(500).json({ success: false, message: 'Failed to create payment order.' });
    }
});

// 3. Verify Payment
app.post('/api/payment/verify', async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount,
            fullName,
            email,
            mobile
        } = req.body;

        let isVerified = false;

        if (RAZORPAY_KEY_SECRET && razorpay_signature) {
            const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
            hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
            const generatedSignature = hmac.digest('hex');
            isVerified = (generatedSignature === razorpay_signature);
        } else {
            // Demo mode verification
            isVerified = Boolean(razorpay_payment_id);
        }

        if (!isVerified) {
            return res.status(400).json({ success: false, message: 'Payment verification failed: invalid signature.' });
        }

        const donationRecord = {
            id: `don_${Date.now()}`,
            date: new Date().toISOString(),
            fullName: fullName || 'Generous Donor',
            mobile: mobile || '-',
            email: email || '-',
            amount: parseInt(amount, 10) || 0,
            source: 'Razorpay Online',
            paymentStatus: 'Verified',
            transactionId: razorpay_payment_id || `pay_${Date.now()}`,
            orderId: razorpay_order_id || `order_${Date.now()}`
        };

        const db = await connectToDatabase();
        if (db) {
            await DonationModel.create(donationRecord);
        } else {
            memoryStore.donations.unshift(donationRecord);
        }

        res.json({
            success: true,
            message: 'Donation successfully verified and recorded.',
            donationId: donationRecord.id,
            transactionId: donationRecord.transactionId
        });
    } catch (err) {
        console.error('Payment verification error:', err);
        res.status(500).json({ success: false, message: 'Error processing donation record.' });
    }
});

// 4. Volunteer Join
app.post('/api/volunteer/join', async (req, res) => {
    try {
        const { fullName, mobile, email, address, message } = req.body;
        if (!fullName || !mobile) {
            return res.status(400).json({ success: false, message: 'Full name and mobile are required.' });
        }

        const volunteerRecord = {
            id: `vol_${Date.now()}`,
            date: new Date().toISOString(),
            fullName,
            mobile,
            email: email || '-',
            address: address || '-',
            message: message || ''
        };

        const db = await connectToDatabase();
        if (db) {
            await VolunteerModel.create(volunteerRecord);
        } else {
            memoryStore.volunteers.unshift(volunteerRecord);
        }

        res.json({ success: true, message: 'Volunteer application submitted successfully.' });
    } catch (err) {
        console.error('Volunteer application error:', err);
        res.status(500).json({ success: false, message: 'Error saving application.' });
    }
});

// 5. Contact Form Submission
app.post('/api/contact/submit', async (req, res) => {
    try {
        const { fullName, email, subject, message } = req.body;
        if (!fullName || !email || !message) {
            return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
        }

        const messageRecord = {
            id: `msg_${Date.now()}`,
            date: new Date().toISOString(),
            fullName,
            email,
            subject: subject || 'General Inquiry',
            message
        };

        const db = await connectToDatabase();
        if (db) {
            await MessageModel.create(messageRecord);
        } else {
            memoryStore.messages.unshift(messageRecord);
        }

        res.json({ success: true, message: 'Message sent successfully.' });
    } catch (err) {
        console.error('Contact submission error:', err);
        res.status(500).json({ success: false, message: 'Error saving message.' });
    }
});

// 6. Admin Endpoints
app.get('/api/donations/history', requireAdmin, async (req, res) => {
    const db = await connectToDatabase();
    if (db) {
        const data = await DonationModel.find({}).sort({ _id: -1 }).lean();
        return res.json({ success: true, data });
    }
    res.json({ success: true, data: memoryStore.donations });
});

app.get('/api/volunteer/all', requireAdmin, async (req, res) => {
    const db = await connectToDatabase();
    if (db) {
        const data = await VolunteerModel.find({}).sort({ _id: -1 }).lean();
        return res.json({ success: true, data });
    }
    res.json({ success: true, data: memoryStore.volunteers });
});

app.get('/api/contact/all', requireAdmin, async (req, res) => {
    const db = await connectToDatabase();
    if (db) {
        const data = await MessageModel.find({}).sort({ _id: -1 }).lean();
        return res.json({ success: true, data });
    }
    res.json({ success: true, data: memoryStore.messages });
});

// Export handler for Vercel
module.exports = app;
