// Crown Hotel - Booking Logic
// CMP7003B Group 3 - Back end Booking System
// All database interactions for the booking system.
// All queries use placeholders to prevent SQL
// injection (see Lab 10). The db parameter is a pg.Pool passed in from app.js.


// CONSTANTS

// labels for the four room classes
const CLASS_LABELS = {
    'std_d': 'Standard Double',
    'std_t': 'Standard Twin',
    'sup_d': 'Superior Double',
    'sup_t': 'Superior Twin'
};

// labels for room statuses
const STATUS_LABELS = {
    'A': 'Available',
    'O': 'Occupied',
    'C': 'Checked Out',
    'X': 'Unavailable'
};


// INPUT VALIDATION


// Lab 10
function validateInput(input) {
    if (typeof input !== 'string' || input.trim().length === 0) return false;
    return /^[a-zA-Z0-9\s@._\-\/\'\,\#]+$/.test(input);
}


// UTILITY QUERIES

async function getNextId(db, table, column) {
    const result = await db.query(
        `SELECT COALESCE(MAX(${column}), 10000) + 1 AS next_id
         FROM hotelbooking.${table}`
    );
    return parseInt(result.rows[0].next_id, 10);
}


// AVAILABILITY

// Returns up to numRooms available rooms of the given class for the date range.
// Lab 10
async function checkAvailability(db, roomClass, checkin, checkout, numRooms) {
    const query = `
        SELECT r.r_no, r.r_class, ra.price
        FROM hotelbooking.room r
        JOIN hotelbooking.rates ra ON r.r_class = ra.r_class
        WHERE r.r_class = $1
          AND r.r_status = 'A'
          AND r.r_no NOT IN (
              SELECT rb.r_no
              FROM hotelbooking.roombooking rb
              WHERE rb.checkin < $3
                AND rb.checkout > $2
          )
        ORDER BY r.r_no
        LIMIT $4
    `;
    const result = await db.query(query, [roomClass, checkin, checkout, numRooms]);
    return result.rows;
}


async function getAlternatives(db, checkin, checkout, numRooms) {
    const query = `
        SELECT r.r_class, ra.price, COUNT(r.r_no) AS available_count
        FROM hotelbooking.room r
        JOIN hotelbooking.rates ra ON r.r_class = ra.r_class
        WHERE r.r_status = 'A'
          AND r.r_no NOT IN (
              SELECT rb.r_no
              FROM hotelbooking.roombooking rb
              WHERE rb.checkin < $2
                AND rb.checkout > $1
          )
        GROUP BY r.r_class, ra.price
        HAVING COUNT(r.r_no) >= $3
        ORDER BY ra.price
    `;
    const result = await db.query(query, [checkin, checkout, numRooms]);
    return result.rows;
}


// CUSTOMER


// Looks up a customer by email address
async function findCustomerByEmail(db, email) {
    const result = await db.query(
        'SELECT c_no FROM hotelbooking.customer WHERE c_email = $1',
        [email]
    );
    return result.rows.length > 0 ? result.rows[0].c_no : null;
}

// Inserts a new customer record
async function createCustomer(db, customerData) {
    const c_no = await getNextId(db, 'customer', 'c_no');
    const { c_name, c_email, c_address, c_cardtype, c_cardno, c_cardexp } = customerData;

    await db.query(
        `INSERT INTO hotelbooking.customer
             (c_no, c_name, c_email, c_address, c_cardtype, c_cardexp, c_cardno)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [c_no, c_name, c_email, c_address, c_cardtype, c_cardexp, c_cardno]
    );
    return c_no;
}

// BOOKING CREATION

// Creates a complete booking
// Returns the new booking reference number.
async function createBooking(db, customerData, rooms, checkin, checkout, cost, notes) {
    // Step 1 - customer
    let c_no = await findCustomerByEmail(db, customerData.c_email);
    if (!c_no) {
        c_no = await createCustomer(db, customerData);
    }

    // Step 2 - booking header
    const b_ref = await getNextId(db, 'booking', 'b_ref');
    await db.query(
        `INSERT INTO hotelbooking.booking (b_ref, c_no, b_cost, b_outstanding, b_notes)
         VALUES ($1, $2, $3, $3, $4)`,
        [b_ref, c_no, cost, notes || '']
    );

    // Step 3 - one roombooking row per assigned room
    for (const r_no of rooms) {
        await db.query(
            `INSERT INTO hotelbooking.roombooking (r_no, b_ref, checkin, checkout)
             VALUES ($1, $2, $3, $4)`,
            [r_no, b_ref, checkin, checkout]
        );
    }

    return b_ref;
}

// BOOKING DETAILS  (confirmation page)
// Retrieves all details needed for the confirmation page.
async function getBookingDetails(db, b_ref) {
    // Main booking
    const bookingResult = await db.query(
        `SELECT b.b_ref, b.b_cost, b.b_outstanding, b.b_notes,
                c.c_name, c.c_email, c.c_address
         FROM hotelbooking.booking b
         JOIN hotelbooking.customer c ON b.c_no = c.c_no
         WHERE b.b_ref = $1`,
        [b_ref]
    );

    if (bookingResult.rows.length === 0) return null;

    // Room details for this booking
    const roomResult = await db.query(
        `SELECT rb.r_no, rb.checkin, rb.checkout,
                (rb.checkout - rb.checkin) AS nights,
                r.r_class, ra.price
         FROM hotelbooking.roombooking rb
         JOIN hotelbooking.room r ON rb.r_no = r.r_no
         JOIN hotelbooking.rates ra ON r.r_class = ra.r_class
         WHERE rb.b_ref = $1
         ORDER BY rb.r_no`,
        [b_ref]
    );

    const booking = bookingResult.rows[0];
    booking.rooms = roomResult.rows;
    // Checkin/checkout/nights come from the first room
    if (roomResult.rows.length > 0) {
        booking.checkin = roomResult.rows[0].checkin;
        booking.checkout = roomResult.rows[0].checkout;
        booking.nights = roomResult.rows[0].nights;
        booking.r_class = roomResult.rows[0].r_class;
        booking.price = roomResult.rows[0].price;
    }

    return booking;
}

// RECEPTION
// Returns all rooms that are Available or Occupied
async function getReceptionData(db) {
    const result = await db.query(`
        SELECT
            r.r_no, r.r_class, r.r_status, r.r_notes,
            rb.b_ref, rb.checkin, rb.checkout,
            c.c_name, c.c_email,
            b.b_cost, b.b_outstanding
        FROM hotelbooking.room r
        LEFT JOIN hotelbooking.roombooking rb
            ON r.r_no = rb.r_no
            AND rb.checkin <= CURRENT_DATE
            AND rb.checkout > CURRENT_DATE
        LEFT JOIN hotelbooking.booking b ON rb.b_ref = b.b_ref
        LEFT JOIN hotelbooking.customer c ON b.c_no = c.c_no
        WHERE r.r_status IN ('A', 'O', 'X')
        ORDER BY r.r_no
    `);
    return result.rows;
}

// Sets a room's status to Occupied
async function checkIn(db, r_no) {
    await db.query(
        `UPDATE hotelbooking.room SET r_status = 'O' WHERE r_no = $1`,
        [r_no]
    );
}

// Sets a room's status to Checked Out
// Housekeeping will see this room and mark it Available once prepared.
async function checkOut(db, r_no) {
    await db.query(
        `UPDATE hotelbooking.room SET r_status = 'C' WHERE r_no = $1`,
        [r_no]
    );
}

// Reduces the outstanding balance on a booking by the payment amount
async function recordPayment(db, b_ref, amount) {
    await db.query(
        `UPDATE hotelbooking.booking
         SET b_outstanding = GREATEST(b_outstanding - $1, 0)
         WHERE b_ref = $2`,
        [amount, b_ref]
    );
}


// HOUSEKEEPING

// Returns all rooms whose status is 'C' (checked out, needs preparation).
async function getHousekeepingData(db) {
    const result = await db.query(`
        SELECT r.r_no, r.r_class, r.r_notes
        FROM hotelbooking.room r
        WHERE r.r_status IN ('C', 'X')
        ORDER BY r.r_no
    `);
    return result.rows;
}

// Updates a room's status. Housekeeping may only set 'A' (available) or 'X' (unavailable).
// The allowed values are enforced in app.js before this function is called.
async function updateRoomStatus(db, r_no, status) {
    await db.query(
        `UPDATE hotelbooking.room SET r_status = $1 WHERE r_no = $2`,
        [status, r_no]
    );
}


// WEEKLY REPORT
// Returns occupancy and revenue data for the 7-day week containing the given date.
async function getWeeklyReport(db, dateStr) {
    // Calculate Monday of the week containing dateStr
    const date = new Date(dateStr);
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d.toISOString().split('T')[0]);
    }

    const totalRooms = 32;

    // Occupancy per day
    const occupancy = [];
    for (const dayStr of days) {
        const result = await db.query(`
            SELECT COUNT(DISTINCT rb.r_no) AS occupied
            FROM hotelbooking.roombooking rb
            WHERE rb.checkin <= $1 AND rb.checkout > $1
        `, [dayStr]);
        const occupied = parseInt(result.rows[0].occupied, 10);
        occupancy.push({
            day: new Date(dayStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' }),
            occupied,
            rate: occupied / totalRooms
        });
    }

    // Revenue per room class for the week
    const revenueResult = await db.query(`
        SELECT r.r_class,
               SUM(ra.price * (rb.checkout - rb.checkin)) AS revenue,
               SUM(rb.checkout - rb.checkin) AS nights
        FROM hotelbooking.roombooking rb
        JOIN hotelbooking.room r ON rb.r_no = r.r_no
        JOIN hotelbooking.rates ra ON r.r_class = ra.r_class
        WHERE rb.checkin >= $1 AND rb.checkin <= $2
        GROUP BY r.r_class
        ORDER BY r.r_class
    `, [days[0], days[6]]);

    const classLabels = {
        'std_d': 'Standard Double',
        'std_t': 'Standard Twin',
        'sup_d': 'Superior Double',
        'sup_t': 'Superior Twin'
    };

    const income = revenueResult.rows.map(row => ({
        label: classLabels[row.r_class] || row.r_class,
        amount: parseFloat(row.revenue) || 0,
        nights: parseInt(row.nights, 10) || 0
    }));

    const totalRevenue = income.reduce((sum, r) => sum + r.amount, 0);
    const totalNights  = income.reduce((sum, r) => sum + r.nights, 0);
    income.push({ label: 'Total Room Revenue', amount: totalRevenue, nights: totalNights });

    // Arrivals this week
    const arrivalsResult = await db.query(`
        SELECT COUNT(DISTINCT rb.b_ref) AS arrivals
        FROM hotelbooking.roombooking rb
        WHERE rb.checkin >= $1 AND rb.checkin <= $2
    `, [days[0], days[6]]);
    const arrivals = parseInt(arrivalsResult.rows[0].arrivals, 10) || 0;

    // Average occupancy across the week
    const avgOccupancy = Math.round(
        (occupancy.reduce((sum, d) => sum + d.rate, 0) / 7) * 100
    );

    return {
        weekStart: days[0],
        weekEnd:   days[6],
        occupancy,
        income,
        summary: {
            occupancyPct:  avgOccupancy,
            totalRevenue,
            totalNights,
            arrivals
        }
    };
}


// EXPORTS

// AMEND BOOKING

// Looks up a booking by reference number for the amend form.
async function getBookingByRef(db, b_ref) {
    const result = await db.query(`
        SELECT b.b_ref, b.b_notes,
               c.c_name, c.c_email,
               rb.r_no, rb.checkin, rb.checkout,
               r.r_class
        FROM hotelbooking.booking b
        JOIN hotelbooking.customer c ON b.c_no = c.c_no
        JOIN hotelbooking.roombooking rb ON rb.b_ref = b.b_ref
        JOIN hotelbooking.room r ON rb.r_no = r.r_no
        WHERE b.b_ref = $1
        ORDER BY rb.r_no
        LIMIT 1
    `, [b_ref]);
    return result.rows.length > 0 ? result.rows[0] : null;
}

// Updates the dates and notes for a booking.
// Checks the room is not already booked for the new dates (excluding this booking).
async function amendBooking(db, b_ref, r_no, checkin, checkout, b_notes) {
    // Check for clashes with other bookings for the same room
    const clash = await db.query(`
        SELECT rb.r_no
        FROM hotelbooking.roombooking rb
        WHERE rb.r_no = $1
          AND rb.b_ref != $2
          AND rb.checkin < $4
          AND rb.checkout > $3
    `, [r_no, b_ref, checkin, checkout]);

    if (clash.rows.length > 0) {
        return { success: false, message: 'Room is not available for the new dates.' };
    }

    // Update roombooking dates
    await db.query(`
        UPDATE hotelbooking.roombooking
        SET checkin = $1, checkout = $2
        WHERE b_ref = $3
    `, [checkin, checkout, b_ref]);

    // Recalculate cost
    const rateResult = await db.query(`
        SELECT ra.price FROM hotelbooking.rates ra
        JOIN hotelbooking.room r ON r.r_class = ra.r_class
        WHERE r.r_no = $1
    `, [r_no]);

    if (rateResult.rows.length > 0) {
        const price = parseFloat(rateResult.rows[0].price);
        const nights = Math.round((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        const newCost = parseFloat((price * nights).toFixed(2));
        await db.query(`
            UPDATE hotelbooking.booking
            SET b_cost = $1, b_outstanding = $1, b_notes = $2
            WHERE b_ref = $3
        `, [newCost, b_notes || '', b_ref]);
    } else {
        await db.query(`
            UPDATE hotelbooking.booking SET b_notes = $1 WHERE b_ref = $2
        `, [b_notes || '', b_ref]);
    }

    return { success: true };
}

module.exports = {
    CLASS_LABELS,
    STATUS_LABELS,
    validateInput,
    checkAvailability,
    getAlternatives,
    findCustomerByEmail,
    createBooking,
    getBookingDetails,
    getReceptionData,
    checkIn,
    checkOut,
    recordPayment,
    getHousekeepingData,
    updateRoomStatus,
    getWeeklyReport,
    getBookingByRef,
    amendBooking
};
