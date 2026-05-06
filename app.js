// Crown Hotel - Main Application Server
// CMP7003B Group 3 - Booking System
// Lab 7 (Express/routing) and Lab 8 (PostgreSQL integration)
// Input validation and queries is Lab 10 (SQL injection).
// To run in development: npm run dev
// To run in production: NODE_ENV=production node app.js

const express = require('express');
const { Pool } = require('pg');





// Database config (Lab 8)
const env = process.env.NODE_ENV || 'development';
const config = require('./config.js')[env];

// Booking logic module (all DB queries live here)
const bookings = require('./bookings.js');

const app = express();
const port = 3000;

// Create a connection pool (handles concurrent requests more robustly than a single Client)
const db = new Pool({
    user: config.user,
    database: config.database,
    password: String(config.password),
    host: config.host,
    port: parseInt(config.port)
});

// -------------------------------------------------------
// (Lab 7 / Lab 8 / Lab 10
// -------------------------------------------------------

// EJS templating engine (Lab 8)
app.set('view engine', 'ejs');

// Serve static files from /public (Lab 7)
app.use(express.static('public'));

// Parse URL-encoded form bodies (Lab 10)
app.use(express.urlencoded({ extended: false }));

// Parse JSON bodies
app.use(express.json());

// -------------------------------------------------------
// CUSTOMER API ROUTES
// These are called by the booking.js
// using the Fetch API. They return JSON responses.
// -------------------------------------------------------

// GET /api/rooms/available
// Called by the booking bar in booking.js before navigating to payment.
// Query params: checkin, checkout, type (room class, optional)
// Returns: { available: true/false, availableCount: N }
app.get('/api/rooms/available', async (req, res) => {
    const { checkin, checkout, type } = req.query;

    if (!checkin || !checkout) {
        return res.json({ available: false, error: 'Missing checkin or checkout date.' });
    }

    // Basic date validation
    const checkinDate = new Date(checkin);
    const checkoutDate = new Date(checkout);
    if (isNaN(checkinDate) || isNaN(checkoutDate) || checkoutDate <= checkinDate) {
        return res.json({ available: false, error: 'Invalid dates.' });
    }

    try {
        const validClasses = ['std_d', 'std_t', 'sup_d', 'sup_t'];

        if (type && validClasses.includes(type)) {
            // Check availability for the specific room class requested
            const available = await bookings.checkAvailability(db, type, checkin, checkout, 1);
            return res.json({ available: available.length >= 1, availableCount: available.length });
        }

        // No room type specified - check if any room of any class is free
        const alternatives = await bookings.getAlternatives(db, checkin, checkout, 1);
        return res.json({ available: alternatives.length > 0, availableCount: alternatives.length });

    } catch (err) {
        console.error('Availability API error:', err);
        const alternatives = await bookings.getAlternatives(db, checkin, checkout, 1);
        return res.json({
            available: alternatives.length > 0,
            availableCount: alternatives.length,
            suggestedType: alternatives.length > 0 ? alternatives[0].r_class : null
        });

    }
});

// POST /api/bookings
// Called by the payment form in booking.js using fetch()
// Body (JSON): checkin, checkout, room_type, guests, c_name, c_email, c_address, c_cardtype, c_cardno, c_cardexp, b_notes
// Returns: { success: true, ref, bookingRef, guestName, email, roomType, checkin, checkout, nights, total, guests } or:  { success: false, message }
app.post('/api/bookings', async (req, res) => {
    const {
        checkin, checkout, room_type, guests,
        c_name, c_email, c_address, c_cardtype, c_cardno, c_cardexp, b_notes
    } = req.body;

    // --- Server-side validation (Lab 10)
    const validClasses = ['std_d', 'std_t', 'sup_d', 'sup_t'];
    const validCardTypes = ['V', 'MC', 'A'];

    if (!checkin || !checkout || !room_type || !c_name || !c_email ||
        !c_address || !c_cardtype || !c_cardno || !c_cardexp) {
        return res.json({ success: false, message: 'All required fields must be completed.' });
    }
    if (!validClasses.includes(room_type)) {
        return res.json({ success: false, message: 'Invalid room type.' });
    }
    if (!bookings.validateInput(c_name) || !bookings.validateInput(c_email) ||
        !bookings.validateInput(c_address)) {
        return res.json({ success: false, message: 'Name, email, or address contains invalid characters.' });
    }
    if (!validCardTypes.includes(c_cardtype)) {
        return res.json({ success: false, message: 'Invalid card type.' });
    }
    if (!/^\d{15,16}$/.test(c_cardno)) {
        return res.json({ success: false, message: 'Card number must be 15 or 16 digits.' });
    }
    if (!/^\d{2}\/\d{2}$/.test(c_cardexp)) {
        return res.json({ success: false, message: 'Card expiry must be in MM/YY format.' });
    }

    // --- Confirm availability and create booking ---
    try {
        const available = await bookings.checkAvailability(db, room_type, checkin, checkout, 1);
        if (available.length === 0) {
            return res.json({ success: false, message: 'Sorry, no rooms of that type are available for your dates.' });
        }

        const selectedRoom = available[0];
        const nights = Math.round((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        const cost = parseFloat((parseFloat(selectedRoom.price) * nights).toFixed(2));
        const customerData = { c_name, c_email, c_address, c_cardtype, c_cardno, c_cardexp };

        const b_ref = await bookings.createBooking(
            db, customerData, [selectedRoom.r_no], checkin, checkout, cost, b_notes || ''
        );

        return res.json({
            success: true,
            ref: 'CRW-' + b_ref,
            bookingRef: b_ref,
            guestName: c_name,
            email: c_email,
            roomType: room_type,
            checkin,
            checkout,
            nights,
            total: cost,
            guests: guests || '2 Adults'
        });

    } catch (err) {
        console.error('Booking creation error:', err);
        return res.json({ success: false, message: 'A server error occurred. Please try again.' });
    }
});

// -------------------------------------------------------
// RECEPTION ROUTES
// -------------------------------------------------------
// These pages are not linked from the customer booking pages
// no login is required.
// GET /reception
// Displays all currently available and occupied rooms with today's booking details.
app.get('/reception', async (req, res) => {
    try {
        const rooms = await bookings.getReceptionData(db);
        return res.render('reception', {
            rooms,
            classLabels: bookings.CLASS_LABELS,
            statusLabels: bookings.STATUS_LABELS,
            message: req.query.message || null,
            error: null
        });
    } catch (err) {
        console.error('Reception load error:', err);
        return res.render('reception', {
            rooms: [],
            classLabels: bookings.CLASS_LABELS,
            statusLabels: bookings.STATUS_LABELS,
            message: null,
            error: 'Could not load room data.'
        });
    }
});

// POST /reception/checkin
// Sets the room status to occupied when the guest arrives.
app.post('/reception/checkin', async (req, res) => {
    const r_no = parseInt(req.body.r_no, 10);
    const b_ref = parseInt(req.body.b_ref, 10);

    if (isNaN(r_no) || isNaN(b_ref)) {
        return res.redirect('/reception');
    }
    try {
        await bookings.checkIn(db, r_no);
        return res.redirect('/reception?message=Room+' + r_no + '+checked+in');
    } catch (err) {
        console.error('Check-in error:', err);
        return res.redirect('/reception');
    }
});

// POST /reception/checkout
// Sets the room status to checked out so housekeeping can prepare it.
app.post('/reception/checkout', async (req, res) => {
    const r_no = parseInt(req.body.r_no, 10);
    const b_ref = parseInt(req.body.b_ref, 10);

    if (isNaN(r_no) || isNaN(b_ref)) {
        return res.redirect('/reception');
    }
    try {
        await bookings.checkOut(db, r_no);
        return res.redirect('/reception?message=Room+' + r_no + '+checked+out');
    } catch (err) {
        console.error('Check-out error:', err);
        return res.redirect('/reception');
    }
});

// POST /reception/payment
// Records a payment against a booking, reducing the outstanding balance.
app.post('/reception/payment', async (req, res) => {
    const b_ref = parseInt(req.body.b_ref, 10);
    const amount = parseFloat(req.body.amount);

    if (isNaN(b_ref) || isNaN(amount) || amount <= 0) {
        return res.redirect('/reception');
    }
    try {
        await bookings.recordPayment(db, b_ref, amount);
        return res.redirect('/reception?message=Payment+recorded+for+booking+' + b_ref);
    } catch (err) {
        console.error('Payment error:', err);
        return res.redirect('/reception');
    }
});

// -------------------------------------------------------
// HOUSEKEEPING ROUTES
// -------------------------------------------------------
// GET /housekeeping
// Lists all rooms currently in the Checked Out state, ready to be prepared.
app.get('/housekeeping', async (req, res) => {
    try {
        const rooms = await bookings.getHousekeepingData(db);
        return res.render('housekeeping', {
            rooms,
            classLabels: bookings.CLASS_LABELS,
            message: req.query.message || null
        });
    } catch (err) {
        console.error('Housekeeping load error:', err);
        return res.render('housekeeping', {
            rooms: [],
            classLabels: bookings.CLASS_LABELS,
            message: 'Could not load room data.'
        });
    }
});

// POST /housekeeping/update
// Allows housekeeping to mark a prepared room as Available ('A')
// or Unavailable ('X') if it needs maintenance.
app.post('/housekeeping/update', async (req, res) => {
    const r_no = parseInt(req.body.r_no, 10);
    const r_status = req.body.r_status;

    // Only allow the two valid target statuses from housekeeping
    const allowed = ['A', 'X'];
    if (isNaN(r_no) || !allowed.includes(r_status)) {
        return res.redirect('/housekeeping');
    }
    try {
        await bookings.updateRoomStatus(db, r_no, r_status);
        const label = r_status === 'A' ? 'available' : 'unavailable';
        return res.redirect('/housekeeping?message=Room+' + r_no + '+marked+' + label);
    } catch (err) {
        console.error('Room status update error:', err);
        return res.redirect('/housekeeping');
    }
});

// -------------------------------------------------------
// AMEND BOOKING ROUTES
// -------------------------------------------------------
// GET /api/bookings/:ref/verify
// Customer-facing booking lookup — requires email to verify identity.
app.get('/api/bookings/:ref/verify', async (req, res) => {
    const b_ref = parseInt(req.params.ref.replace('CRW-', ''), 10);
    const email = req.query.email;

    if (isNaN(b_ref) || !email) {
        return res.json({ success: false, message: 'Please provide your booking reference and email address.' });
    }
    try {
        const booking = await bookings.getBookingByRef(db, b_ref);
        if (!booking) {
            return res.json({ success: false, message: 'Booking not found.' });
        }
        if (booking.c_email.toLowerCase() !== email.toLowerCase()) {
            return res.json({ success: false, message: 'Email address does not match this booking.' });
        }
        return res.json({ success: true, booking });
    } catch (err) {
        console.error('Customer booking lookup error:', err);
        return res.json({ success: false, message: 'Server error. Please try again.' });
    }
});

// POST /api/bookings/:ref/amend
// Customer-facing booking amendment — requires email to verify identity.
app.post('/api/bookings/:ref/amend', async (req, res) => {
    const b_ref = parseInt(req.params.ref.replace('CRW-', ''), 10);
    const { email, r_no, checkin, checkout, b_notes } = req.body;

    if (isNaN(b_ref) || !email || !checkin || !checkout) {
        return res.json({ success: false, message: 'Missing required fields.' });
    }

    const checkinDate  = new Date(checkin);
    const checkoutDate = new Date(checkout);
    if (isNaN(checkinDate) || isNaN(checkoutDate) || checkoutDate <= checkinDate) {
        return res.json({ success: false, message: 'Invalid dates.' });
    }

    try {
        const booking = await bookings.getBookingByRef(db, b_ref);
        if (!booking) {
            return res.json({ success: false, message: 'Booking not found.' });
        }
        if (booking.c_email.toLowerCase() !== email.toLowerCase()) {
            return res.json({ success: false, message: 'Email address does not match this booking.' });
        }
        const result = await bookings.amendBooking(db, b_ref, parseInt(r_no, 10), checkin, checkout, b_notes || '');
        return res.json(result);
    } catch (err) {
        console.error('Customer amend error:', err);
        return res.json({ success: false, message: 'Server error. Please try again.' });
    }
});

// GET /api/bookings/:ref
// Staff-facing booking lookup by reference number.
app.get('/api/bookings/:ref', async (req, res) => {
    const b_ref = parseInt(req.params.ref.replace('CRW-', ''), 10);
    if (isNaN(b_ref)) {
        return res.json({ success: false, message: 'Invalid booking reference.' });
    }
    try {
        const booking = await bookings.getBookingByRef(db, b_ref);
        if (!booking) {
            return res.json({ success: false, message: 'Booking not found.' });
        }
        return res.json({ success: true, booking });
    } catch (err) {
        console.error('Booking lookup error:', err);
        return res.json({ success: false, message: 'Server error looking up booking.' });
    }
});

// POST /reception/amend
// Updates the dates and notes for a booking.
app.post('/reception/amend', async (req, res) => {
    const b_ref  = parseInt(req.body.b_ref, 10);
    const r_no   = parseInt(req.body.r_no, 10);
    const { checkin, checkout, b_notes } = req.body;

    if (isNaN(b_ref) || isNaN(r_no) || !checkin || !checkout) {
        return res.redirect('/reception?message=Invalid+amend+request.');
    }

    const checkinDate  = new Date(checkin);
    const checkoutDate = new Date(checkout);
    if (isNaN(checkinDate) || isNaN(checkoutDate) || checkoutDate <= checkinDate) {
        return res.redirect('/reception?message=Invalid+dates+for+amendment.');
    }

    try {
        const result = await bookings.amendBooking(db, b_ref, r_no, checkin, checkout, b_notes || '');
        if (!result.success) {
            return res.redirect('/reception?message=' + encodeURIComponent(result.message));
        }
        return res.redirect('/reception?message=Booking+CRW-' + b_ref + '+updated+successfully.');
    } catch (err) {
        console.error('Amend booking error:', err);
        return res.redirect('/reception?message=Could+not+update+booking.');
    }
});

// -------------------------------------------------------
// REPORTS ROUTES
// -------------------------------------------------------
// GET /reports
// Renders the weekly reports page for staff.
app.get('/reports', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    try {
        const data = await bookings.getWeeklyReport(db, today);
        return res.render('reports', {
            report: data,
            message: req.query.message || null
        });
    } catch (err) {
        console.error('Reports load error:', err);
        return res.render('reports', {
            report: null,
            message: 'Could not load report data.'
        });
    }
});

// GET /api/reports/weekly
// Returns weekly report data as JSON for the frontend.
// Query param: date (ISO string, defaults to today)
app.get('/api/reports/weekly', async (req, res) => {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    try {
        const data = await bookings.getWeeklyReport(db, dateStr);
        return res.json({ success: true, ...data });
    } catch (err) {
        console.error('Reports API error:', err);
        return res.json({ success: false, error: 'Could not load report data.' });
    }
});

//redirects to 404 if cant find real page
app.use((req, res) => {
  res.status(404).sendFile(__dirname + '/public/html/404.html');
});


// -------------------------------------------------------
// START SERVER  (Lab 7)
// -------------------------------------------------------
app.listen(port, () => {
    console.log(`Crown Hotel app listening on port ${port}`);
});

