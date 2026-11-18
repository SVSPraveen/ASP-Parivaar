// backend/test_backend.js - Test suite for ASP Parivaar Backend API
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

// Set up isolated temporary directory for test database BEFORE requiring server
const tempTestDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asp-backend-test-'));
process.env.DATA_DIR = tempTestDataDir;

const app = require('./server');
const server = http.createServer(app);

server.listen(5099, async () => {
    console.log('[Test Suite] Local test server running on port 5099');
    console.log(`[Test Suite] Test environment isolated in: ${tempTestDataDir}`);
    let errors = 0;

    async function req(reqPath, method = 'GET', body = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: '127.0.0.1',
                port: 5099,
                path: reqPath,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                }
            };
            const r = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, json: JSON.parse(data) });
                    } catch (e) {
                        resolve({ status: res.statusCode, text: data });
                    }
                });
            });
            r.on('error', reject);
            if (body) r.write(JSON.stringify(body));
            r.end();
        });
    }

    try {
        // 1. Health check
        console.log('Testing GET /api/health...');
        const h = await req('/api/health');
        if (h.status === 200 && h.json && h.json.status === 'online') {
            console.log('  PASS: Health check OK');
        } else {
            console.error('  FAIL: Health check failed', h);
            errors++;
        }

        // 2. Create Order
        console.log('Testing POST /api/payment/create-order...');
        const co = await req('/api/payment/create-order', 'POST', { amount: 500 });
        if (co.status === 200 && co.json && co.json.success && co.json.order.amount === 50000) {
            console.log('  PASS: Payment order created (50000 paise)');
        } else {
            console.error('  FAIL: Create order failed', co);
            errors++;
        }

        // 3. Payment Verify
        console.log('Testing POST /api/payment/verify...');
        const pv = await req('/api/payment/verify', 'POST', {
            razorpay_order_id: 'order_test_123',
            razorpay_payment_id: 'pay_test_456',
            razorpay_signature: 'sig_test_789',
            donationData: {
                fullName: 'Deepak Sharma',
                mobile: '9988776655',
                email: 'deepak@example.com',
                amount: '500'
            }
        });
        if (pv.status === 200 && pv.json && pv.json.success) {
            console.log('  PASS: Payment verified and stored in isolated test storage');
        } else {
            console.error('  FAIL: Payment verify failed', pv);
            errors++;
        }

        // 4. Volunteer Join
        console.log('Testing POST /api/volunteer/join...');
        const vj = await req('/api/volunteer/join', 'POST', {
            fullName: 'Neha Gupta',
            mobile: '9876501234',
            email: 'neha@example.com',
            address: 'Lucknow',
            message: 'Ready to volunteer on weekends'
        });
        if (vj.status === 200 && vj.json && vj.json.success) {
            console.log('  PASS: Volunteer registration submitted');
        } else {
            console.error('  FAIL: Volunteer join failed', vj);
            errors++;
        }

        // 5. Contact Submit
        console.log('Testing POST /api/contact/submit...');
        const cs = await req('/api/contact/submit', 'POST', {
            fullName: 'Amit Patel',
            email: 'amit@example.com',
            subject: 'Community Library Project',
            message: 'We have books to donate.'
        });
        if (cs.status === 200 && cs.json && cs.json.success) {
            console.log('  PASS: Contact form submission accepted');
        } else {
            console.error('  FAIL: Contact submit failed', cs);
            errors++;
        }

        // 6. Admin Donations History (with PIN)
        console.log('Testing GET /api/donations/history with x-admin-pin...');
        const dh = await req('/api/donations/history', 'GET', null, { 'x-admin-pin': 'asp2025' });
        if (dh.status === 200 && Array.isArray(dh.json.data) && dh.json.data.length === 2) {
            console.log(`  PASS: Retrieved isolated donation records (count: ${dh.json.data.length})`);
        } else {
            console.error('  FAIL: Donations history failed', dh);
            errors++;
        }

        // 7. Admin Volunteers List (with PIN)
        console.log('Testing GET /api/volunteer/all with x-admin-pin...');
        const va = await req('/api/volunteer/all', 'GET', null, { 'x-admin-pin': 'asp2025' });
        if (va.status === 200 && Array.isArray(va.json.data) && va.json.data.length === 2) {
            console.log(`  PASS: Retrieved isolated volunteer records (count: ${va.json.data.length})`);
        } else {
            console.error('  FAIL: Volunteer all failed', va);
            errors++;
        }

        // 8. Admin Messages List (with PIN)
        console.log('Testing GET /api/contact/all with x-admin-pin...');
        const ca = await req('/api/contact/all', 'GET', null, { 'x-admin-pin': 'asp2025' });
        if (ca.status === 200 && Array.isArray(ca.json.data) && ca.json.data.length === 2) {
            console.log(`  PASS: Retrieved isolated contact records (count: ${ca.json.data.length})`);
        } else {
            console.error('  FAIL: Contact all failed', ca);
            errors++;
        }

        // 9. Admin PIN Authorization Enforcement (without PIN and with invalid PIN)
        console.log('Testing GET /api/donations/history without PIN (Auth Protection)...');
        const unauth = await req('/api/donations/history');
        const wrongPin = await req('/api/donations/history', 'GET', null, { 'x-admin-pin': 'wrong_pin_123' });
        if (unauth.status === 401 && wrongPin.status === 401) {
            console.log('  PASS: Admin route correctly denied unauthorized request (401)');
        } else {
            console.error('  FAIL: Admin route permitted unauthorized request', { unauth: unauth.status, wrongPin: wrongPin.status });
            errors++;
        }

        // 10. Security check: Direct static access to backend sensitive JSON data
        console.log('Testing GET /backend/data/donations.json (Security Protection)...');
        const sec1 = await req('/backend/data/donations.json');
        if (sec1.status === 403) {
            console.log('  PASS: Direct static access to backend/data/ is blocked (403)');
        } else {
            console.error('  FAIL: Direct static access to backend/data/ not blocked, returned status: ' + sec1.status, sec1);
            errors++;
        }

        // 11. Security check: Direct static access to backend server source code
        console.log('Testing GET /backend/server.js (Security Protection)...');
        const sec2 = await req('/backend/server.js');
        if (sec2.status === 403) {
            console.log('  PASS: Direct static access to backend/server.js is blocked (403)');
        } else {
            console.error('  FAIL: Direct static access to backend/server.js not blocked, status: ' + sec2.status, sec2);
            errors++;
        }

        // 12. Security check: Direct static access to environment files (.env)
        console.log('Testing GET /backend/.env and /.env (Security Protection)...');
        const sec3 = await req('/backend/.env');
        const sec4 = await req('/.env');
        if (sec3.status === 403 && sec4.status === 403) {
            console.log('  PASS: Static access to sensitive dotfiles (.env) is blocked (403)');
        } else {
            console.error('  FAIL: Static access to dotfiles not blocked', { sec3: sec3.status, sec4: sec4.status });
            errors++;
        }

        // 13. Security check: Path traversal, space/dot quirks, archives & scripts
        console.log('Testing path traversal, trailing space/dot quirks, root archives & scripts...');
        const secTrav = await req('/images/../backend/data/donations.json');
        const secSpace = await req('/backend%20/server.js');
        const secDot = await req('/backend./server.js');
        const secScript = await req('/verify_all.py');
        const secArchive = await req('/asp_final.zip');

        if (secTrav.status === 403 && secSpace.status === 403 && secDot.status === 403 && secScript.status === 403 && secArchive.status === 403) {
            console.log('  PASS: Advanced security attacks and sensitive files blocked (403)');
        } else {
            console.error('  FAIL: Advanced security checks failed', {
                secTrav: secTrav.status,
                secSpace: secSpace.status,
                secDot: secDot.status,
                secScript: secScript.status,
                secArchive: secArchive.status
            });
            errors++;
        }

        // 14. Public static assets are accessible
        console.log('Testing GET /index.html (Legitimate Static Assets)...');
        const pub = await req('/index.html');
        if (pub.status === 200 && typeof pub.text === 'string' && pub.text.includes('ASP')) {
            console.log('  PASS: Public frontend asset index.html served correctly (200)');
        } else {
            console.error('  FAIL: Public asset index.html could not be retrieved', pub);
            errors++;
        }

        // 15. Data Idempotency Verification: Ensure production backend/data/ was not touched
        console.log('Verifying production data isolation & idempotency in backend/data/...');
        const prodDonations = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'donations.json'), 'utf-8'));
        const prodVolunteers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'volunteers.json'), 'utf-8'));
        const prodMessages = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'messages.json'), 'utf-8'));

        const hasTestDonation = prodDonations.some(d => d.fullName === 'Deepak Sharma');
        const hasTestVolunteer = prodVolunteers.some(v => v.fullName === 'Neha Gupta');
        const hasTestMessage = prodMessages.some(m => m.fullName === 'Amit Patel');

        if (!hasTestDonation && !hasTestVolunteer && !hasTestMessage && prodDonations.length === 1 && prodVolunteers.length === 1 && prodMessages.length === 1) {
            console.log('  PASS: Production backend/data/ completely clean and untouched by test execution!');
        } else {
            console.error('  FAIL: Production data was contaminated by test run!', {
                donationsCount: prodDonations.length,
                hasTestDonation,
                volunteersCount: prodVolunteers.length,
                hasTestVolunteer,
                messagesCount: prodMessages.length,
                hasTestMessage
            });
            errors++;
        }

        console.log('\n=============================================');
        if (errors === 0) {
            console.log('ALL BACKEND API & SECURITY TESTS PASSED SUCCESSFULLY!');
        } else {
            console.error(`TESTS FINISHED WITH ${errors} ERRORS.`);
        }
        console.log('=============================================\n');

    } catch (err) {
        console.error('Unexpected test error:', err);
        errors++;
    } finally {
        server.close();
        // Clean up temporary isolated test directory
        try {
            if (fs.existsSync(tempTestDataDir)) {
                fs.rmSync(tempTestDataDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) {
            console.error('Warning: Failed to remove temporary test directory:', cleanupErr);
        }
        process.exit(errors === 0 ? 0 : 1);
    }
});
