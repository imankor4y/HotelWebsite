/* 
   CROWN HOTEL -- Staff Portal JavaScript
   staff.js
   
   Handles all staff-side functionality:
   1.  Configuration
   2.  Auth -- passcode entry and session management
   3.  Shared utilities -- date, time, formatting
   4.  Dashboard -- summary stats and live clock
   5.  Housekeeping -- room status board
   6.  Reception -- booking search and management
   7.  Reports -- occupancy and income reporting
   8.  Init -- page router
    */


/* 1. CONFIGURATION Change STAFF_PASSCODE to update the access code. All other settings can be adjusted here.
 */

const CONFIG = {
  STAFF_PASSCODE:   '12345',
  SESSION_KEY:      'crown_staff_auth',
  PASSCODE_LENGTH:  5,
  CURRENCY:         'GBP',
  HOTEL_NAME:       'Crown Hotel Norwich',

  /* Room types matching the booking system */
  ROOM_TYPES: {
    'SD': 'Standard Double',
    'SuD': 'Superior Double',
    'ST': 'Standard Twin',
    'SuT': 'Superior Twin'
  },

  /* Base prices per night, kept in sync with booking system */
  ROOM_PRICES: {
    'SD':  85,
    'SuD': 115,
    'ST':  85,
    'SuT': 115
  }
};


/* 2. AUTH Passcode entry, session check and logout. Uses sessionStorage so access clears on browser close.*/

const Auth = {

  /**
   * Check whether the current session is authenticated.
   * Call on every staff page load to guard access.
   * @returns {boolean}
   */
  isAuthenticated: function () {
    return sessionStorage.getItem(CONFIG.SESSION_KEY) === 'true';
  },

  /**
   * Set the session as authenticated and redirect to dashboard.
   */
  login: function () {
    sessionStorage.setItem(CONFIG.SESSION_KEY, 'true');
    window.location.href = '/reception';
  },

  /**
   * Clear the session and redirect to passcode page.
   */
  logout: function () {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    window.location.href = 'index.html';
  },

  /**
   * Guard an inner staff page.
   * If not authenticated, redirect to passcode entry.
   * Call at the top of each staff page init.
   */
  guard: function () {
    if (!Auth.isAuthenticated()) {
      window.location.href = 'index.html';
    }
  },

  /**
   * Initialise the passcode entry page.
   * Handles digit inputs, auto-advance, and submission.
   */
  initPasscodePage: function () {
    const digits    = document.querySelectorAll('.passcode-digit');
    const submitBtn = document.getElementById('passcodeSubmit');
    const errorMsg  = document.getElementById('passcodeError');
    const inputsWrap = document.querySelector('.passcode-inputs');

    if (!digits.length) return;

    /* Auto-advance to next digit on input */
    digits.forEach(function (input, index) {
      input.addEventListener('input', function () {

        /* Strip non-numeric characters */
        this.value = this.value.replace(/[^0-9]/g, '');

        /* Mark as filled for styling */
        this.classList.toggle('filled', this.value.length > 0);

        /* Advance focus */
        if (this.value && index < digits.length - 1) {
          digits[index + 1].focus();
        }

        /* Auto-submit when all digits are filled */
        const code = Auth._getCode(digits);
        if (code.length === CONFIG.PASSCODE_LENGTH) {
          Auth._checkCode(code, digits, errorMsg, inputsWrap);
        }
      });

      /* Backspace goes to previous input */
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !this.value && index > 0) {
          digits[index - 1].focus();
          digits[index - 1].classList.remove('filled');
        }
      });

      /* Select on focus for easy re-entry */
      input.addEventListener('focus', function () {
        this.select();
      });
    });

    /* Manual submit button */
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        const code = Auth._getCode(digits);
        Auth._checkCode(code, digits, errorMsg, inputsWrap);
      });
    }

    /* Focus the first digit on load */
    digits[0].focus();
  },

  /**
   * Collect digit values into a single string.
   * @param {NodeList} digits
   * @returns {string}
   */
  _getCode: function (digits) {
    return Array.from(digits).map(function (d) { return d.value; }).join('');
  },

  /**
   * Validate the entered code and respond accordingly.
   * @param {string}   code
   * @param {NodeList} digits
   * @param {Element}  errorMsg
   * @param {Element}  inputsWrap
   */
  _checkCode: function (code, digits, errorMsg, inputsWrap) {
    if (code === CONFIG.STAFF_PASSCODE) {
      Auth.login();
    } else {
      /* Show error */
      if (errorMsg) {
        errorMsg.classList.add('visible');
      }

      /* Shake animation */
      if (inputsWrap) {
        inputsWrap.classList.add('shake');
        setTimeout(function () {
          inputsWrap.classList.remove('shake');
        }, 500);
      }

      /* Clear inputs and refocus */
      digits.forEach(function (d) {
        d.value = '';
        d.classList.remove('filled');
      });
      digits[0].focus();
    }
  }

};


/* 3. SHARED UTILITIESDate formatting, currency, and other helpers used across multiple staff pages.*/

const Utils = {

  /**
   * Format a date object or ISO string as DD/MM/YYYY.
   * @param {Date|string} date
   * @returns {string}
   */
  formatDate: function (date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', {
      day:   '2-digit',
      month: '2-digit',
      year:  'numeric'
    });
  },

  /**
   * Format a date as a long readable string.
   * e.g. "Tuesday 6 May 2025"
   * @param {Date|string} date
   * @returns {string}
   */
  formatDateLong: function (date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day:     'numeric',
      month:   'long',
      year:    'numeric'
    });
  },

  /**
   * Format a number as GBP currency.
   * @param {number} amount
   * @returns {string}
   */
  formatCurrency: function (amount) {
    return new Intl.NumberFormat('en-GB', {
      style:    'currency',
      currency: CONFIG.CURRENCY,
      minimumFractionDigits: 2
    }).format(amount);
  },

  /**
   * Calculate the number of nights between two dates.
   * @param {string} checkIn  ISO date string
   * @param {string} checkOut ISO date string
   * @returns {number}
   */
  nightsBetween: function (checkIn, checkOut) {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((new Date(checkOut) - new Date(checkIn)) / msPerDay);
  },

  /**
   * Get today's date as an ISO string (YYYY-MM-DD).
   * @returns {string}
   */
  today: function () {
    return new Date().toISOString().split('T')[0];
  },

  /**
   * Get the name of the current day and time as a string.
   * e.g. "Tuesday, 14:32"
   * @returns {string}
   */
  nowString: function () {
    return new Date().toLocaleString('en-GB', {
      weekday: 'long',
      hour:    '2-digit',
      minute:  '2-digit'
    });
  },

  /**
   * Get the full room type label from a type code.
   * @param {string} code e.g. 'SD'
   * @returns {string}
   */
  roomTypeLabel: function (code) {
    return CONFIG.ROOM_TYPES[code] || code;
  },

  /**
   * Show a temporary toast notification.
   * @param {string} message
   * @param {string} type  'success' | 'error' | 'info'
   */
  toast: function (message, type) {
    type = type || 'success';

    const toast = document.createElement('div');
    toast.className = 'staff-toast staff-toast--' + type;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    document.body.appendChild(toast);

    /* Trigger reflow for animation */
    toast.offsetHeight;
    toast.classList.add('staff-toast--visible');

    setTimeout(function () {
      toast.classList.remove('staff-toast--visible');
      setTimeout(function () {
        toast.remove();
      }, 300);
    }, 3000);
  }

};


/* ─────────────────────────────────────────────
   4. DASHBOARD
   Summary stats display and live clock.
───────────────────────────────────────────── */

const Dashboard = {

  init: function () {
    Auth.guard();
    Dashboard.renderDate();
    Dashboard.startClock();
    Dashboard.bindLogout();
  },

  /**
   * Render today's date in the dashboard header.
   */
  renderDate: function () {
    const el = document.getElementById('dashDate');
    if (el) {
      el.textContent = Utils.formatDateLong(new Date());
    }
  },

  /**
   * Start a live clock updating every minute.
   */
  startClock: function () {
    const el = document.getElementById('staffTime');

    function update() {
      if (el) {
        el.textContent = new Date().toLocaleTimeString('en-GB', {
          hour:   '2-digit',
          minute: '2-digit'
        });
      }
    }

    update();
    setInterval(update, 60000);
  },

  /**
   * Bind the logout button.
   */
  bindLogout: function () {
    const btn = document.getElementById('staffLogout');
    if (btn) {
      btn.addEventListener('click', function () {
        Auth.logout();
      });
    }
  }

};


/* ─────────────────────────────────────────────
   5. HOUSEKEEPING
   Room status board -- view and update room states.
   In production, room data will come from the
   Node.js/PostgreSQL backend via fetch calls.
───────────────────────────────────────────── */

const Housekeeping = {

  /**
   * Current room data.
   * In production this will be fetched from the API:
   * GET /api/rooms/status
   */
  rooms: [],

  init: function () {
    Auth.guard();
    Dashboard.startClock();
    Dashboard.bindLogout();
    Housekeeping.loadRooms();
    Housekeeping.bindFilters();
  },

  /**
   * Load room data from the backend.
   * Placeholder data is used until the API is connected.
   */
  loadRooms: function () {

    /* TODO: Replace with real API call once backend is ready
       fetch('/api/rooms/status')
         .then(function(res) { return res.json(); })
         .then(function(data) {
           Housekeeping.rooms = data;
           Housekeeping.renderRooms(data);
           Housekeeping.renderStats(data);
         })
         .catch(function(err) {
           console.error('Failed to load rooms:', err);
           Utils.toast('Could not load room data.', 'error');
         });
    */

    /* Placeholder data -- remove once API is connected */
    Housekeeping.rooms = Housekeeping._placeholderRooms();
    Housekeeping.renderRooms(Housekeeping.rooms);
    Housekeeping.renderStats(Housekeeping.rooms);
  },

  /**
   * Render the room tiles into the grid.
   * @param {Array} rooms
   */
  renderRooms: function (rooms) {
    const grid = document.getElementById('roomGrid');
    if (!grid) return;

    grid.innerHTML = '';

    rooms.forEach(function (room) {
      const tile = document.createElement('div');
      tile.className = 'room-tile room-tile--' + room.status;
      tile.setAttribute('data-id', room.id);
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('aria-label', 'Room ' + room.number + ', ' + room.status);

      tile.innerHTML =
        '<div class="room-tile__number">' + room.number + '</div>' +
        '<div class="room-tile__type">' + Utils.roomTypeLabel(room.type) + '</div>' +
        '<div class="room-tile__floor">Floor ' + room.floor + '</div>' +
        '<span class="badge badge--' + Housekeeping._statusBadge(room.status) + '">' +
          Housekeeping._statusLabel(room.status) +
        '</span>';

      tile.addEventListener('click', function () {
        Housekeeping.openRoomModal(room);
      });

      tile.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          Housekeeping.openRoomModal(room);
        }
      });

      grid.appendChild(tile);
    });
  },

  /**
   * Render the summary stat boxes.
   * @param {Array} rooms
   */
  renderStats: function (rooms) {
    var counts = { clean: 0, dirty: 0, occupied: 0, blocked: 0 };

    rooms.forEach(function (r) {
      if (counts[r.status] !== undefined) {
        counts[r.status]++;
      }
    });

    var statMap = {
      'statClean':    counts.clean,
      'statDirty':    counts.dirty,
      'statOccupied': counts.occupied,
      'statTotal':    rooms.length
    };

    Object.keys(statMap).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = statMap[id];
    });
  },

  /**
   * Bind the filter buttons to filter tiles by status.
   */
  bindFilters: function () {
    var filterBtns = document.querySelectorAll('[data-filter]');

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var filter = this.getAttribute('data-filter');

        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');

        var filtered = filter === 'all'
          ? Housekeeping.rooms
          : Housekeeping.rooms.filter(function (r) { return r.status === filter; });

        Housekeeping.renderRooms(filtered);
      });
    });
  },

  /**
   * Open a modal to update a single room's status.
   * @param {Object} room
   */
  openRoomModal: function (room) {
    var modal = document.getElementById('roomModal');
    if (!modal) return;

    document.getElementById('modalRoomNumber').textContent = 'Room ' + room.number;
    document.getElementById('modalRoomType').textContent   = Utils.roomTypeLabel(room.type);

    var statusSelect = document.getElementById('modalStatus');
    if (statusSelect) {
      statusSelect.value = room.status;
    }

    var saveBtn = document.getElementById('modalSave');
    if (saveBtn) {
      saveBtn.onclick = function () {
        var newStatus = statusSelect ? statusSelect.value : room.status;
        Housekeeping.updateRoomStatus(room.id, newStatus);
        Housekeeping.closeModal();
      };
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  },

  closeModal: function () {
    var modal = document.getElementById('roomModal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  },

  /**
   * Update a room's status.
   * @param {string|number} roomId
   * @param {string}        newStatus
   */
  updateRoomStatus: function (roomId, newStatus) {

    /* TODO: Replace with real API call
       fetch('/api/rooms/' + roomId + '/status', {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ status: newStatus })
       })
       .then(function(res) { return res.json(); })
       .then(function() {
         Utils.toast('Room updated successfully.', 'success');
         Housekeeping.loadRooms();
       })
       .catch(function(err) {
         console.error('Update failed:', err);
         Utils.toast('Could not update room status.', 'error');
       });
    */

    /* Local update for placeholder mode */
    Housekeeping.rooms = Housekeeping.rooms.map(function (r) {
      return r.id === roomId ? Object.assign({}, r, { status: newStatus }) : r;
    });

    Housekeeping.renderRooms(Housekeeping.rooms);
    Housekeeping.renderStats(Housekeeping.rooms);
    Utils.toast('Room ' + roomId + ' marked as ' + newStatus + '.', 'success');
  },

  /* Map status to badge modifier */
  _statusBadge: function (status) {
    var map = { clean: 'green', dirty: 'amber', occupied: 'blue', blocked: 'red' };
    return map[status] || 'grey';
  },

  /* Map status to display label */
  _statusLabel: function (status) {
    var map = { clean: 'Clean', dirty: 'Needs Cleaning', occupied: 'Occupied', blocked: 'Blocked' };
    return map[status] || status;
  },

  /**
   * Placeholder room data.
   * Remove once the backend API is connected.
   * @returns {Array}
   */
  _placeholderRooms: function () {
    var types    = ['SD', 'SuD', 'ST', 'SuT'];
    var statuses = ['clean', 'dirty', 'occupied', 'occupied', 'clean', 'occupied', 'dirty', 'clean'];
    var rooms    = [];

    for (var i = 1; i <= 32; i++) {
      rooms.push({
        id:     i,
        number: 100 + i,
        type:   types[(i - 1) % 4],
        floor:  Math.ceil(i / 8),
        status: statuses[(i - 1) % statuses.length]
      });
    }

    return rooms;
  }

};


/* ─────────────────────────────────────────────
   6. RECEPTION
   Booking search and modification tools.
   In production, data comes from the backend API.
───────────────────────────────────────────── */

const Reception = {

  init: function () {
    Auth.guard();
    Dashboard.startClock();
    Dashboard.bindLogout();
    Reception.bindSearch();
    Reception.loadTodayArrivals();
  },

  /**
   * Bind the booking search form.
   */
  bindSearch: function () {
    var form = document.getElementById('bookingSearchForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var query = document.getElementById('bookingSearch').value.trim();
      if (query) {
        Reception.searchBookings(query);
      }
    });
  },

  /**
   * Search for bookings by reference, name, or room.
   * @param {string} query
   */
  searchBookings: function (query) {

    /* TODO: Replace with real API call
       fetch('/api/bookings/search?q=' + encodeURIComponent(query))
         .then(function(res) { return res.json(); })
         .then(function(data) {
           Reception.renderBookingResults(data);
         })
         .catch(function(err) {
           console.error('Search failed:', err);
           Utils.toast('Search failed. Please try again.', 'error');
         });
    */

    /* Placeholder -- filter local data */
    var results = Reception._placeholderBookings().filter(function (b) {
      return (
        b.ref.toLowerCase().includes(query.toLowerCase()) ||
        b.guest.toLowerCase().includes(query.toLowerCase()) ||
        String(b.room).includes(query)
      );
    });

    Reception.renderBookingResults(results);
  },

  /**
   * Load today's arrivals automatically on page load.
   */
  loadTodayArrivals: function () {
    var today = Utils.today();

    /* TODO: Replace with real API call
       fetch('/api/bookings/arrivals?date=' + today)
         .then(function(res) { return res.json(); })
         .then(function(data) { Reception.renderArrivals(data); });
    */

    var arrivals = Reception._placeholderBookings().filter(function (b) {
      return b.checkIn === today;
    });

    Reception.renderArrivals(arrivals);
  },

  /**
   * Render booking search results into the results table.
   * @param {Array} bookings
   */
  renderBookingResults: function (bookings) {
    var tbody = document.getElementById('searchResults');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!bookings.length) {
      var row = document.createElement('tr');
      row.innerHTML = '<td colspan="7" style="text-align:center;color:var(--s-muted);padding:2rem">No bookings found.</td>';
      tbody.appendChild(row);
      return;
    }

    bookings.forEach(function (b) {
      var row = document.createElement('tr');
      row.innerHTML =
        '<td><strong>' + b.ref + '</strong></td>' +
        '<td>' + b.guest + '</td>' +
        '<td>' + b.room + '</td>' +
        '<td>' + Utils.roomTypeLabel(b.type) + '</td>' +
        '<td>' + Utils.formatDate(b.checkIn) + '</td>' +
        '<td>' + Utils.formatDate(b.checkOut) + '</td>' +
        '<td>' +
          '<div class="s-table__actions">' +
            '<button class="btn-s btn-s--outline btn-s--sm" onclick="Reception.viewBooking(\'' + b.ref + '\')">View</button>' +
            '<button class="btn-s btn-s--danger btn-s--sm" onclick="Reception.cancelBooking(\'' + b.ref + '\')">Cancel</button>' +
          '</div>' +
        '</td>';
      tbody.appendChild(row);
    });
  },

  /**
   * Render today's arrivals list.
   * @param {Array} arrivals
   */
  renderArrivals: function (arrivals) {
    var tbody = document.getElementById('arrivalsBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!arrivals.length) {
      var row = document.createElement('tr');
      row.innerHTML = '<td colspan="5" style="text-align:center;color:var(--s-muted);padding:2rem">No arrivals today.</td>';
      tbody.appendChild(row);
      return;
    }

    arrivals.forEach(function (b) {
      var row = document.createElement('tr');
      row.innerHTML =
        '<td><strong>' + b.ref + '</strong></td>' +
        '<td>' + b.guest + '</td>' +
        '<td>' + b.room + '</td>' +
        '<td>' + Utils.formatDate(b.checkOut) + '</td>' +
        '<td><span class="badge badge--blue">Arriving</span></td>';
      tbody.appendChild(row);
    });
  },

  /**
   * Open the view/edit panel for a specific booking.
   * @param {string} ref
   */
  viewBooking: function (ref) {

    /* TODO: fetch('/api/bookings/' + ref).then(...) */

    var booking = Reception._placeholderBookings().find(function (b) { return b.ref === ref; });
    if (!booking) return;

    var panel = document.getElementById('bookingDetailPanel');
    if (!panel) return;

    /* Populate detail fields */
    var fields = {
      'detailRef':      booking.ref,
      'detailGuest':    booking.guest,
      'detailRoom':     booking.room,
      'detailType':     Utils.roomTypeLabel(booking.type),
      'detailCheckIn':  Utils.formatDate(booking.checkIn),
      'detailCheckOut': Utils.formatDate(booking.checkOut),
      'detailNights':   Utils.nightsBetween(booking.checkIn, booking.checkOut),
      'detailTotal':    Utils.formatCurrency(booking.total)
    };

    Object.keys(fields).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = fields[id];
    });

    panel.classList.add('open');
  },

  /**
   * Cancel a booking after confirmation.
   * @param {string} ref
   */
  cancelBooking: function (ref) {
    if (!confirm('Cancel booking ' + ref + '? This cannot be undone.')) return;

    /* TODO: Replace with real API call
       fetch('/api/bookings/' + ref, { method: 'DELETE' })
         .then(function() { Utils.toast('Booking cancelled.', 'success'); })
         .catch(function() { Utils.toast('Cancellation failed.', 'error'); });
    */

    Utils.toast('Booking ' + ref + ' cancelled.', 'success');
  },

  /**
   * Placeholder booking data.
   * Remove once the backend API is connected.
   * @returns {Array}
   */
  _placeholderBookings: function () {
    var today = Utils.today();

    return [
      { ref: 'CRW-001', guest: 'James Hartley',   room: 101, type: 'SD',  checkIn: today,       checkOut: '2026-05-08', total: 255 },
      { ref: 'CRW-002', guest: 'Sarah Mitchell',   room: 105, type: 'SuD', checkIn: today,       checkOut: '2026-05-07', total: 230 },
      { ref: 'CRW-003', guest: 'Tom Griffiths',    room: 112, type: 'ST',  checkIn: '2026-05-06', checkOut: '2026-05-09', total: 255 },
      { ref: 'CRW-004', guest: 'Anna Pemberton',   room: 118, type: 'SuT', checkIn: '2026-05-07', checkOut: '2026-05-10', total: 345 },
      { ref: 'CRW-005', guest: 'David Okonkwo',    room: 122, type: 'SD',  checkIn: '2026-05-08', checkOut: '2026-05-11', total: 255 },
      { ref: 'CRW-006', guest: 'Claire Beaumont',  room: 130, type: 'SuD', checkIn: '2026-05-04', checkOut: '2026-05-07', total: 345 }
    ];
  }

};


/* ─────────────────────────────────────────────
   7. REPORTS
   Weekly room occupancy and income reporting.
───────────────────────────────────────────── */

const Reports = {

  init: function () {
    Auth.guard();
    Dashboard.startClock();
    Dashboard.bindLogout();
    Reports.bindWeekSelector();
    Reports.loadReport(Utils.today());
  },

  /**
   * Bind the week selector input to reload the report.
   */
  bindWeekSelector: function () {
    var input = document.getElementById('reportWeek');
    if (input) {
      input.value = Utils.today();
      input.addEventListener('change', function () {
        Reports.loadReport(this.value);
      });
    }

    var btn = document.getElementById('reportGenerate');
    if (btn) {
      btn.addEventListener('click', function () {
        var input = document.getElementById('reportWeek');
        if (input) Reports.loadReport(input.value);
      });
    }
  },

  /**
   * Load the report for the week containing the given date.
   * @param {string} dateStr ISO date string
   */
  loadReport: function (dateStr) {
    fetch('/api/reports/weekly?date=' + dateStr)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (!data.success) {
          Utils.toast('Could not load report data.', 'error');
          return;
        }
        Reports.renderOccupancy(data.occupancy);
        Reports.renderIncome(data.income);
        Reports.renderStats(data.summary);

        // Update week label
        var label = document.getElementById('weekLabel');
        if (label) {
          var start = new Date(data.weekStart + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          var end   = new Date(data.weekEnd   + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          label.textContent = 'Week of ' + start + ' \u2013 ' + end;
        }
      })
      .catch(function(err) {
        console.error('Report failed:', err);
        Utils.toast('Could not load report data.', 'error');
      });
  },

  /**
   * Render the occupancy bar chart.
   * @param {Array} occupancy Array of { day, rate } objects
   */
  renderOccupancy: function (occupancy) {
    var wrap = document.getElementById('occupancyBars');
    if (!wrap) return;

    wrap.innerHTML = '';

    occupancy.forEach(function (row) {
      var fill = Math.round(row.rate * 100);
      var isLow = fill < 40;

      var el = document.createElement('div');
      el.className = 'report-bar-row';
      el.innerHTML =
        '<span class="report-bar-label">' + row.day + '</span>' +
        '<div class="report-bar-track">' +
          '<div class="report-bar-fill' + (isLow ? ' report-bar-fill--low' : '') + '" style="width:' + fill + '%"></div>' +
        '</div>' +
        '<span class="report-bar-value">' + fill + '%</span>';

      wrap.appendChild(el);
    });
  },

  /**
   * Render the income breakdown table.
   * @param {Array} income Array of { label, amount } objects
   */
  renderIncome: function (income) {
    var wrap = document.getElementById('incomeRows');
    if (!wrap) return;

    wrap.innerHTML = '';

    income.forEach(function (row) {
      var el = document.createElement('div');
      el.className = 'report-income-row';
      el.innerHTML =
        '<span class="report-income-row__label">' + row.label + '</span>' +
        '<span class="report-income-row__value">' + Utils.formatCurrency(row.amount) + '</span>';
      wrap.appendChild(el);
    });
  },

  /**
   * Render the summary stat boxes.
   * @param {Object} summary
   */
  renderStats: function (summary) {
    var map = {
      'reportOccupancy': summary.occupancyPct + '%',
      'reportRevenue':   Utils.formatCurrency(summary.totalRevenue),
      'reportNights':    summary.totalNights,
      'reportArrivals':  summary.arrivals
    };

    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = map[id];
    });
  },

  /**
   * Generate placeholder report data for a given week.
   * @param {string} dateStr
   * @returns {Object}
   */
  _placeholderData: function (dateStr) {
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var rates = [0.72, 0.65, 0.78, 0.81, 0.94, 1.00, 0.88];

    var occupancy = days.map(function (day, i) {
      return { day: day, rate: rates[i] };
    });

    var income = [
      { label: 'Standard Double (x8)',  amount: 4080 },
      { label: 'Superior Double (x8)',  amount: 6440 },
      { label: 'Standard Twin (x8)',    amount: 3740 },
      { label: 'Superior Twin (x8)',    amount: 5520 },
      { label: 'Total Room Revenue',    amount: 19780 }
    ];

    return {
      occupancy: occupancy,
      income:    income,
      summary: {
        occupancyPct:  81,
        totalRevenue:  19780,
        totalNights:   178,
        arrivals:      24
      }
    };
  }

};


/* ─────────────────────────────────────────────
   8. INIT -- PAGE ROUTER
   Detect which staff page is loaded and run
   the correct module.
───────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  var body = document.body;

  if (body.classList.contains('page-passcode')) {
    Auth.initPasscodePage();
  } else if (body.classList.contains('page-dashboard')) {
    Dashboard.init();
  } else if (body.classList.contains('page-housekeeping')) {
    Housekeeping.init();
  } else if (body.classList.contains('page-reception')) {
    Reception.init();
    AmendBooking.init();
  } else if (body.classList.contains('page-reports')) {
    Reports.init();
  }
});


/* ─────────────────────────────────────────────
   9. AMEND BOOKING
   Handles the booking search and amend form on the reception page.
───────────────────────────────────────────── */

var AmendBooking = {

  init: function () {
    var searchBtn = document.getElementById('amendSearchBtn');
    var cancelBtn = document.getElementById('amendCancel');

    if (searchBtn) {
      searchBtn.addEventListener('click', function () {
        AmendBooking.search();
      });
    }

    /* Also trigger search on Enter key in the ref input */
    var refInput = document.getElementById('amendRef');
    if (refInput) {
      refInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          AmendBooking.search();
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        AmendBooking.reset();
      });
    }
  },

  search: function () {
    var ref = document.getElementById('amendRef').value.trim().replace('CRW-', '');
    var errorEl = document.getElementById('amendError');
    errorEl.textContent = '';

    if (!ref) {
      errorEl.textContent = 'Please enter a booking reference.';
      return;
    }

    fetch('/api/bookings/' + ref)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) {
          errorEl.textContent = data.message || 'Booking not found.';
          AmendBooking.hideForm();
          return;
        }
        AmendBooking.populateForm(data.booking);
      })
      .catch(function () {
        errorEl.textContent = 'Network error. Please try again.';
      });
  },

  populateForm: function (booking) {
    var form    = document.getElementById('amendForm');
    var summary = document.getElementById('amendSummary');

    /* Populate hidden fields */
    document.getElementById('amend-b_ref').value    = booking.b_ref;
    document.getElementById('amend-r_no').value     = booking.r_no;

    /* Populate editable fields */
    document.getElementById('amend-checkin').value  = booking.checkin  ? booking.checkin.split('T')[0]  : '';
    document.getElementById('amend-checkout').value = booking.checkout ? booking.checkout.split('T')[0] : '';
    document.getElementById('amend-notes').value    = booking.b_notes || '';

    /* Show summary */
    var classLabels = {
      'std_d': 'Standard Double', 'std_t': 'Standard Twin',
      'sup_d': 'Superior Double', 'sup_t': 'Superior Twin'
    };
    summary.innerHTML =
      '<p class="amend-summary__ref">Booking <strong>CRW-' + booking.b_ref + '</strong></p>' +
      '<p class="amend-summary__detail">' + booking.c_name + ' &middot; ' +
      (classLabels[booking.r_class] || booking.r_class) + ' &middot; Room ' + booking.r_no + '</p>';

    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  hideForm: function () {
    document.getElementById('amendForm').hidden = true;
    document.getElementById('amendSummary').innerHTML = '';
  },

  reset: function () {
    AmendBooking.hideForm();
    document.getElementById('amendRef').value = '';
    document.getElementById('amendError').textContent = '';
  }

};
