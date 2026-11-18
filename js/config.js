// js/config.js - Central Configuration for ASP Parivaar Website

(function (window) {
    // When running locally from file://, fallback to localhost:5000
    // When deployed on Vercel or running on http://localhost:5000, empty string uses same-origin relative path /api
    const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';

    window.CONFIG = {
        // Backend API URL:
        // - In production on Vercel (https://www.aspparivaar.in), requests route directly to /api/...
        // - When opened as a local file, falls back to http://localhost:5000
        API_URL: isFileProtocol ? "http://localhost:5000" : "",
        
        // Razorpay Live Key ID
        RAZORPAY_KEY_ID: "rzp_live_S2VewO1jmc2WbS"
    };
})(typeof window !== 'undefined' ? window : this);
