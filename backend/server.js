// backend/server.js - Express API for Ajeevan Samarpan Parivaar (ASP Parivaar)
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_PIN = process.env.ADMIN_PIN || 'asp2025';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_live_S2VewO1jmc2WbS';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

// Initialize Razorpay if SDK & secret are present
let razorpay = null;
try {
    const Razorpay = require('razorpay');
    if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
        razorpay = new Razorpay({
            key_id: RAZORPAY_KEY_ID,
            key_secret: RAZORPAY_KEY_SECRET
        });
        console.log('[Payment] Razorpay initialized with credentials.');
    } else {
        console.log('[Payment] Razorpay running in mock/demo mode (set RAZORPAY_KEY_SECRET for live processing).');
    }
} catch (e) {
    console.log('[Payment] Razorpay SDK not installed or loaded; simulation mode active.');
}

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage helper - persistent JSON storage
function getDataDir() {
    return path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
}

function getFilePath(name) {
    return path.join(getDataDir(), `${name}.json`);
}

function readData(name, defaultData = []) {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const fp = getFilePath(name);
    try {
        if (!fs.existsSync(fp)) {
            fs.writeFileSync(fp, JSON.stringify(defaultData, null, 2), 'utf-8');
            return defaultData;
        }
        const raw = fs.readFileSync(fp, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`Error reading ${name}.json:`, err);
        return defaultData;
    }
}

function writeData(name, data) {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const fp = getFilePath(name);
    try {
        fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error(`Error writing ${name}.json:`, err);
        return false;
    }
}

// Initialize seed data if empty
readData('donations', [
    {
        id: "don_sample_01",
        date: new Date(Date.now() - 86400000 * 2).toISOString(),
        fullName: "Ramesh Sharma",
        mobile: "9876543210",
        email: "ramesh@example.com",
        amount: 1100,
        source: "Razorpay Online",
        paymentStatus: "Verified",
        transactionId: "pay_sample_12345"
    }
]);
readData('volunteers', [
    {
        id: "vol_sample_01",
        date: new Date(Date.now() - 86400000 * 3).toISOString(),
        fullName: "Ananya Verma",
        mobile: "9876543211",
        email: "ananya@example.com",
        address: "Lucknow, UP",
        message: "Passionate about teaching underprivileged children in Lucknow."
    }
]);
readData('messages', [
    {
        id: "msg_sample_01",
        date: new Date(Date.now() - 86400000 * 4).toISOString(),
        fullName: "Vikram Malhotra",
        email: "vikram@example.com",
        subject: "Partnership with Community Youth Club",
        message: "We would love to collaborate on your Clean & Green drives."
    }
]);

// Auth Middleware for Admin endpoints
function requireAdmin(req, res, next) {
    const headerPin = req.headers['x-admin-pin'];
    const authHeader = req.headers['authorization'];
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    }

    const provided = headerPin || token;
    if (provided && provided === ADMIN_PIN) {
        return next();
    }

    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or missing Admin PIN' });
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Health Check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'Ajeevan Samarpan Parivaar Backend',
        status: 'online',
        timestamp: new Date().toISOString()
    });
});

// 2. Razorpay Order Creation
app.post('/api/payment/create-order', async (req, res) => {
    try {
        const { amount } = req.body;
        const parsedAmount = parseFloat(amount);
        if (!parsedAmount || parsedAmount < 1) {
            return res.status(400).json({ success: false, message: 'Invalid donation amount.' });
        }

        const amountInPaise = Math.round(parsedAmount * 100);

        // If Razorpay is configured with secret, use actual SDK
        if (razorpay) {
            const order = await razorpay.orders.create({
                amount: amountInPaise,
                currency: 'INR',
                receipt: `rcpt_${Date.now()}`,
                notes: { purpose: 'Donation to ASP Parivaar' }
            });
            return res.json({ success: true, order });
        }

        // Development / simulation fallback
        const simulatedOrder = {
            id: `order_sim_${Date.now()}`,
            entity: 'order',
            amount: amountInPaise,
            amount_paid: 0,
            amount_due: amountInPaise,
            currency: 'INR',
            receipt: `rcpt_${Date.now()}`,
            status: 'created',
            created_at: Math.floor(Date.now() / 1000)
        };
        return res.json({ success: true, order: simulatedOrder });
    } catch (err) {
        console.error('Order creation error:', err);
        res.status(500).json({ success: false, message: 'Failed to create payment order.' });
    }
});

// 3. Payment Verification & Receipt Recording
app.post('/api/payment/verify', (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, donationData } = req.body;

        if (!razorpay_payment_id) {
            return res.status(400).json({ success: false, message: 'Missing payment ID.' });
        }

        let isVerified = true;
        if (RAZORPAY_KEY_SECRET && razorpay_signature && razorpay_order_id) {
            const expectedSig = crypto
                .createHmac('sha256', RAZORPAY_KEY_SECRET)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex');
            isVerified = expectedSig === razorpay_signature;
        }

        const donations = readData('donations', []);
        const newDonation = {
            id: `don_${Date.now()}`,
            date: new Date().toISOString(),
            fullName: (donationData && donationData.fullName) || 'Generous Donor',
            mobile: (donationData && donationData.mobile) || '-',
            email: (donationData && donationData.email) || '-',
            amount: (donationData && parseFloat(donationData.amount)) || 0,
            source: 'Razorpay Online',
            paymentStatus: isVerified ? 'Verified' : 'Flagged',
            transactionId: razorpay_payment_id,
            orderId: razorpay_order_id || '-'
        };

        donations.unshift(newDonation);
        writeData('donations', donations);

        res.json({ success: true, message: 'Payment recorded successfully.', donation: newDonation });
    } catch (err) {
        console.error('Verification error:', err);
        res.status(500).json({ success: false, message: 'Error processing payment verification.' });
    }
});

// 4. Volunteer Registration
app.post('/api/volunteer/join', (req, res) => {
    try {
        const { fullName, mobile, email, address, message } = req.body;
        if (!fullName || !mobile) {
            return res.status(400).json({ success: false, message: 'Name and mobile number are required.' });
        }

        const volunteers = readData('volunteers', []);
        const newVolunteer = {
            id: `vol_${Date.now()}`,
            date: new Date().toISOString(),
            fullName: fullName.trim(),
            mobile: mobile.trim(),
            email: (email && email.trim()) || '',
            address: (address && address.trim()) || '',
            message: (message && message.trim()) || ''
        };

        volunteers.unshift(newVolunteer);
        writeData('volunteers', volunteers);

        res.json({ success: true, message: 'Volunteer application submitted successfully.' });
    } catch (err) {
        console.error('Volunteer submission error:', err);
        res.status(500).json({ success: false, message: 'Error saving application.' });
    }
});

// 5. Contact Form Submission
app.post('/api/contact/submit', (req, res) => {
    try {
        const { fullName, email, subject, message } = req.body;
        if (!fullName || !email || !message) {
            return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
        }

        const messages = readData('messages', []);
        const newMessage = {
            id: `msg_${Date.now()}`,
            date: new Date().toISOString(),
            fullName: fullName.trim(),
            email: email.trim(),
            subject: (subject && subject.trim()) || 'Website Inquiry',
            message: message.trim()
        };

        messages.unshift(newMessage);
        writeData('messages', messages);

        res.json({ success: true, message: 'Message sent successfully.' });
    } catch (err) {
        console.error('Contact submission error:', err);
        res.status(500).json({ success: false, message: 'Error saving message.' });
    }
});

// 6. Admin Endpoints
app.get('/api/donations/history', requireAdmin, (req, res) => {
    const data = readData('donations', []);
    res.json({ success: true, data });
});

app.get('/api/volunteer/all', requireAdmin, (req, res) => {
    const data = readData('volunteers', []);
    res.json({ success: true, data });
});

app.get('/api/contact/all', requireAdmin, (req, res) => {
    const data = readData('messages', []);
    res.json({ success: true, data });
});

// ==========================================
// STATIC ASSET SERVING & SECURITY
// ==========================================
const STATIC_ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.resolve(__dirname);

// Security Middleware: Prevent access to backend code, data files, dotfiles, and system files
app.use((req, res, next) => {
    let decodedPath = '';
    try {
        decodedPath = decodeURIComponent(req.path);
    } catch (e) {
        return res.status(400).json({ success: false, message: 'Bad request.' });
    }

    // Normalize path to forward slashes and resolve relative navigation
    const normalized = path.posix.normalize(decodedPath.replace(/\\/g, '/')).toLowerCase();
    const segments = normalized.split('/').map(s => s.replace(/[\.\s]+$/, ''));
    const currentDataDir = getDataDir().toLowerCase();

    // Deny access to backend, data, node_modules, dotfiles, source/config/archive extensions
    const isForbidden =
        segments.some(s => s === 'backend' || s === 'data' || s === 'node_modules') ||
        normalized === '/backend' ||
        normalized.startsWith('/backend/') ||
        normalized.includes('/backend/') ||
        normalized === '/data' ||
        normalized.startsWith('/data/') ||
        normalized.includes('/data/') ||
        normalized.includes('node_modules') ||
        normalized.split('/').some(segment => segment.startsWith('.')) ||
        /\.(env|json|py|lock|zip|log|bak|md|git|ya?ml|sh|bat)$/i.test(normalized);

    // Deep filesystem path resolution check to prevent any Windows OS or alternate stream bypasses
    const resolvedPath = path.resolve(STATIC_ROOT, '.' + normalized).toLowerCase();
    const isInsideStaticRoot = resolvedPath.startsWith(STATIC_ROOT.toLowerCase());
    const isInsideBackend = resolvedPath === BACKEND_DIR.toLowerCase() || resolvedPath.startsWith(BACKEND_DIR.toLowerCase() + path.sep);
    const isInsideData = resolvedPath === currentDataDir || resolvedPath.startsWith(currentDataDir + path.sep);

    if (isForbidden || !isInsideStaticRoot || isInsideBackend || isInsideData) {
        return res.status(403).json({
            success: false,
            message: 'Access forbidden: Directory or file is protected.'
        });
    }

    next();
});

// Serve frontend public assets safely
app.use(express.static(STATIC_ROOT, {
    dotfiles: 'deny',
    index: ['index.html']
}));

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`===============================================`);
        console.log(` ASP Parivaar Backend Server Running on Port ${PORT}`);
        console.log(` Endpoint: http://localhost:${PORT}`);
        console.log(` Admin PIN: ${ADMIN_PIN}`);
        console.log(` Razorpay Key: ${RAZORPAY_KEY_ID}`);
        console.log(`===============================================`);
    });
}

module.exports = app;
