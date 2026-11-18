// js/config.js - Central Configuration for ASP Parivaar Website

(function (window) {
    // Check if the frontend is running in a local environment
    const isLocalhost = typeof window !== 'undefined' && Boolean(
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]'
    );

    window.CONFIG = {
        // Backend API URL:
        // - Automatically routes to http://localhost:5000 when developing locally
        // - When published / live, connects to your remote production backend
        API_URL: isLocalhost 
            ? "http://localhost:5000" 
            : "https://asp-backend-live.onrender.com",
        
        // Razorpay Live Key ID
        // For development/testing, replace with your 'rzp_test_...' key
        RAZORPAY_KEY_ID: "rzp_live_S2VewO1jmc2WbS"
    };
})(typeof window !== 'undefined' ? window : this);
