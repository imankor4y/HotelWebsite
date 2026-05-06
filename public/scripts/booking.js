/* 
   CROWN HOTEL -- Customer Booking JavaScript
   booking.js

   Handles all customer-facing booking logic:
   1.  Configuration
   2.  Booking Bar -- validation and submission
   3.  Payment Page -- summary population and form validation
   4.  Utility functions
   5.  Init -- page router
    */


/* 1. CONFIGURATION */

var BOOKING = {

  /* Room prices per night -- must match the database rates table */
  PRICES: {
    'std_d':  65,
    'std_t':  62,
    'sup_d':  77,
    'sup_t':  75
  },

  /* Human-readable room type labels */
  ROOM_LABELS: {
    'std_d':  'Standard Double',
    'std_t':  'Standard Twin',
    'sup_d':  'Superior Double',
    'sup_t':  'Superior Twin'
  },

  /* Session storage key for passing booking data between pages */
  SESSION_KEY: 'crown_booking_data'

};


/*  2. BOOKING BAR
   Validates the booking bar form, stores the selection in sessionStorage, and sends the
   user to the payment page. */

var BookingBar = {

  init: function () {
    var bars = document.querySelectorAll('.booking-bar');
    bars.forEach(function (bar) {
      var btn = bar.querySelector('[data-booking-submit]');
      if (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          BookingBar.handleSubmit(bar);
        });
      }
    });

    /* Set minimum date to today on all date inputs */
    var today = BookingUtils.today();
    document.querySelectorAll('input[type="date"]').forEach(function (input) {
      input.setAttribute('min', today);
    });

    /* Set default dates if empty */
    var checkinInputs  = document.querySelectorAll('#checkin');
    var checkoutInputs = document.querySelectorAll('#checkout');

    checkinInputs.forEach(function (input) {
      if (!input.value) input.value = today;
      input.addEventListener('change', function () {
        /* Checkout must be after checkin */
        checkoutInputs.forEach(function (out) {
          if (out.value && out.value <= input.value) {
            out.value = BookingUtils.addDays(input.value, 1);
          }
          out.setAttribute('min', BookingUtils.addDays(input.value, 1));
        });
      });
    });

    checkoutInputs.forEach(function (input) {
      if (!input.value) {
        input.value = BookingUtils.addDays(today, 1);
      }
    });
  },

  /**
   * Validate and submit the booking bar.
   * @param {Element} bar
   */
  handleSubmit: function (bar) {
    var checkin   = bar.querySelector('#checkin')   ? bar.querySelector('#checkin').value   : '';
    var checkout  = bar.querySelector('#checkout')  ? bar.querySelector('#checkout').value  : '';
    var guests    = bar.querySelector('#guests')    ? bar.querySelector('#guests').value    : '2';
    var roomType  = bar.querySelector('#room-type') ? bar.querySelector('#room-type').value : '';

    /* Clear previous errors */
    bar.querySelectorAll('.booking-bar__error').forEach(function (e) { e.remove(); });

    var errors = BookingBar.validate(checkin, checkout);

    if (errors.length > 0) {
      BookingBar.showErrors(bar, errors);
      return;
    }

    /* Store booking data in sessionStorage for the payment page */
    var bookingData = {
      checkin:   checkin,
      checkout:  checkout,
      guests:    guests,
      roomType:  roomType,
      nights:    BookingUtils.nightsBetween(checkin, checkout),
      price:     BOOKING.PRICES[roomType] || null,
      total:     roomType ? BOOKING.PRICES[roomType] * BookingUtils.nightsBetween(checkin, checkout) : null
    };

    sessionStorage.setItem(BOOKING.SESSION_KEY, JSON.stringify(bookingData));

    /* Redirect to payment page */
 
  
  fetch('/api/rooms/available?checkin=' + checkin + '&checkout=' + checkout + '&type=' + roomType)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var isHomepage = window.location.pathname.endsWith('index.html') ||
                      window.location.pathname.endsWith('/');
      if (data.available) {
        if (!roomType && data.suggestedType) {
          bookingData.roomType = data.suggestedType;
          bookingData.price    = BOOKING.PRICES[data.suggestedType];
          bookingData.total    = bookingData.price * bookingData.nights;
          sessionStorage.setItem(BOOKING.SESSION_KEY, JSON.stringify(bookingData));
        }
        window.location.href = isHomepage ? 'html/payment.html' : 'payment.html';
      } else {
        window.location.href = isHomepage ? 'html/unavailable.html' : 'unavailable.html';
      }
    })
    .catch(function() {
      var isHomepage = window.location.pathname.endsWith('index.html') ||
                      window.location.pathname.endsWith('/');
      window.location.href = isHomepage ? 'html/payment.html' : 'payment.html';
    });
  },


  /**
   * Validate booking bar inputs.
   * @param {string} checkin
   * @param {string} checkout
   * @returns {Array} array of error messages
   */
  validate: function (checkin, checkout) {
    var errors = [];
    var today  = BookingUtils.today();

    if (!checkin) {
      errors.push('Please select a check-in date.');
    } else if (checkin < today) {
      errors.push('Check-in date cannot be in the past.');
    }

    if (!checkout) {
      errors.push('Please select a check-out date.');
    } else if (checkin && checkout <= checkin) {
      errors.push('Check-out must be after check-in.');
    }

    return errors;
  },

  /**
   * Show validation errors below the booking bar.
   * @param {Element} bar
   * @param {Array}   errors
   */
  showErrors: function (bar, errors) {
    var container = document.createElement('div');
    container.className = 'booking-bar__error';
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');

    errors.forEach(function (msg) {
      var p = document.createElement('p');
      p.textContent = msg;
      container.appendChild(p);
    });

    bar.appendChild(container);
  }

};


/* 
   3. PAYMENT PAGE
   Reads booking data from sessionStorage, populates the summary panel, and validates and submits the payment form.
 */

var PaymentPage = {

  init: function () {
    var data = PaymentPage.getBookingData();

    if (data) {
      PaymentPage.populateSummary(data);
      PaymentPage.populateHiddenFields(data);
    }

    PaymentPage.bindForm();
    PaymentPage.bindCardNumberFormat();
    PaymentPage.bindExpiryFormat();
  },

  /**
   * Read booking data from sessionStorage
   * @returns {Object|null}
   */
  getBookingData: function () {
    var raw = sessionStorage.getItem(BOOKING.SESSION_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  /**
   * Populate the booking summary panel
   * @param {Object} data
   */
  populateSummary: function (data) {
    var typeLabel = BOOKING.ROOM_LABELS[data.roomType] || 'Any Room';

    PaymentPage.setText('summary-type',     typeLabel);
    PaymentPage.setText('summary-checkin',  BookingUtils.formatDate(data.checkin));
    PaymentPage.setText('summary-checkout', BookingUtils.formatDate(data.checkout));
    PaymentPage.setText('summary-nights',   data.nights + (data.nights === 1 ? ' night' : ' nights'));
    PaymentPage.setText('summary-guests',   data.guests || '2 Adults');

    if (data.total) {
      PaymentPage.setText('summary-total', BookingUtils.formatCurrency(data.total));
    } else {
      PaymentPage.setText('summary-total', 'Calculated at check-in');
    }
  },

  /**
   * Populate hidden form fields with booking data
   * @param {Object} data
   */
  populateHiddenFields: function (data) {
    PaymentPage.setVal('f-checkin',   data.checkin);
    PaymentPage.setVal('f-checkout',  data.checkout);
    PaymentPage.setVal('f-room-type', data.roomType);
    PaymentPage.setVal('f-guests',    data.guests);
  },

  /**
   * Bind the payment form submission.
   */
  bindForm: function () {
    var form = document.getElementById('paymentForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      /* Clear previous errors */
      document.querySelectorAll('.payment-field__error').forEach(function (el) {
        el.textContent = '';
      });

      var errors = PaymentPage.validateForm(form);

      if (errors.length > 0) {
        PaymentPage.showErrorSummary(errors);
        /* Scroll to first error */
        var firstError = form.querySelector('.payment-field__error:not(:empty)');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      /* Hide error summary if previously shown */
      var summary = document.getElementById('errorSummary');
      if (summary) summary.hidden = true;

      fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(PaymentPage.collectFormData(form))
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.success) {
          sessionStorage.setItem('crown_confirmation', JSON.stringify(data));
          window.location.href = 'confirmation.html';
        } else {
          PaymentPage.showErrorSummary([data.message || 'Booking failed. Please try again.']);
        }
      })
      .catch(function() {
        PaymentPage.showErrorSummary(['A network error occurred. Please try again.']);
      });

    });   // closes form.addEventListener

  },      // closes bindForm


  /**
   * Validate all payment form fields.
   * @param {HTMLFormElement} form
   * @returns {Array} array of error messages
   */
  validateForm: function (form) {
    var errors = [];

    /* Full name */
    var name = form.querySelector('#full-name');
    if (!name.value.trim()) {
      PaymentPage.setFieldError('error-name', 'Please enter your full name.');
      errors.push('Full name is required.');
    }

    /* Email */
    var email = form.querySelector('#email');
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.value.trim()) {
      PaymentPage.setFieldError('error-email', 'Please enter your email address.');
      errors.push('Email address is required.');
    } else if (!emailRegex.test(email.value)) {
      PaymentPage.setFieldError('error-email', 'Please enter a valid email address.');
      errors.push('Email address is not valid.');
    }

    /* Address */
    var address = form.querySelector('#address');
    if (!address.value.trim()) {
      PaymentPage.setFieldError('error-address', 'Please enter your address.');
      errors.push('Address is required.');
    }

    /* Card type */
    var cardType = form.querySelector('#card-type');
    if (!cardType.value) {
      PaymentPage.setFieldError('error-cardtype', 'Please select your card type.');
      errors.push('Card type is required.');
    }

    /* Card number */
    var cardNo = form.querySelector('#card-number');
    var cardNoClean = cardNo.value.replace(/\s/g, '');
    if (!cardNoClean) {
      PaymentPage.setFieldError('error-cardno', 'Please enter your card number.');
      errors.push('Card number is required.');
    } else if (!/^\d{16}$/.test(cardNoClean)) {
      PaymentPage.setFieldError('error-cardno', 'Card number must be 16 digits.');
      errors.push('Card number must be 16 digits.');
    }

    /* Expiry */
    var expiry = form.querySelector('#card-expiry');
    var expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
    if (!expiry.value.trim()) {
      PaymentPage.setFieldError('error-cardexp', 'Please enter your card expiry date.');
      errors.push('Card expiry date is required.');
    } else if (!expiryRegex.test(expiry.value)) {
      PaymentPage.setFieldError('error-cardexp', 'Please use MM/YY format.');
      errors.push('Card expiry must be in MM/YY format.');
    }

    return errors;
  },

  /**
   * Collect all form data into an object for API submission.
   * @param {HTMLFormElement} form
   * @returns {Object}
   */
  collectFormData: function (form) {
    var data = PaymentPage.getBookingData() || {};

    return {
      checkin:    data.checkin,
      checkout:   data.checkout,
      room_type:  data.roomType,
      guests:     data.guests,
      c_name:     form.querySelector('#full-name').value.trim(),
      c_email:    form.querySelector('#email').value.trim(),
      c_address:  form.querySelector('#address').value.trim(),
      c_cardtype: form.querySelector('#card-type').value,
      c_cardno:   form.querySelector('#card-number').value.replace(/\s/g, ''),
      c_cardexp:  form.querySelector('#card-expiry').value.trim(),
      b_notes:    form.querySelector('#notes').value.trim()
    };
  },

  /**
   * Show the error summary box.
   * @param {Array} errors
   */
  showErrorSummary: function (errors) {
    var summary = document.getElementById('errorSummary');
    var list    = document.getElementById('errorList');
    if (!summary || !list) return;

    list.innerHTML = '';
    errors.forEach(function (msg) {
      var li = document.createElement('li');
      li.textContent = msg;
      list.appendChild(li);
    });

    summary.hidden = false;
    summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  /**
   * Auto-format card number with spaces every 4 digits.
   */
  bindCardNumberFormat: function () {
    var input = document.getElementById('card-number');
    if (!input) return;

    input.addEventListener('input', function () {
      var val = this.value.replace(/\D/g, '').substring(0, 16);
      this.value = val;
    });
  },

  /**
   * Auto-format expiry date as MM/YY.
   */
  bindExpiryFormat: function () {
    var input = document.getElementById('card-expiry');
    if (!input) return;

    input.addEventListener('input', function () {
      var val = this.value.replace(/\D/g, '').substring(0, 4);
      if (val.length >= 3) {
        val = val.substring(0, 2) + '/' + val.substring(2);
      }
      this.value = val;
    });
  },

  /* Helpers */
  setText: function (id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  },

  setVal: function (id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val || '';
  },

  setFieldError: function (id, msg) {
    var el = document.getElementById(id);
    if (el) el.textContent = msg;
  }

};


/*  4. UTILITY FUNCTIONS */

var BookingUtils = {

  today: function () {
    return new Date().toISOString().split('T')[0];
  },

  addDays: function (dateStr, days) {
    var d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  },

  nightsBetween: function (checkin, checkout) {
    var msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((new Date(checkout) - new Date(checkin)) / msPerDay);
  },

  formatDate: function (dateStr) {
    if (!dateStr) return '--';
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day:     'numeric',
      month:   'long',
      year:    'numeric'
    });
  },

  formatCurrency: function (amount) {
    return new Intl.NumberFormat('en-GB', {
      style:    'currency',
      currency: 'GBP'
    }).format(amount);
  }

};


/*  5. UNAVAILABLE PAGE
   Shows when requested room type is not available. Populates alternatives with calculated totals and allows the user to select a different room.
 */

var UnavailablePage = {

  init: function () {
    var data = UnavailablePage.getBookingData();

    if (data) {
      UnavailablePage.populateSummary(data);
      UnavailablePage.populateTotals(data);
      UnavailablePage.hideRequestedRoom(data.roomType);
      UnavailablePage.prefillRetryBar(data);
    }

    UnavailablePage.bindSelectButtons();
  },

  getBookingData: function () {
    var raw = sessionStorage.getItem(BOOKING.SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  /**
   * Populate the search summary strip
   * @param {Object} data
   */
  populateSummary: function (data) {
    UnavailablePage.setText('summary-checkin',  BookingUtils.formatDate(data.checkin));
    UnavailablePage.setText('summary-checkout', BookingUtils.formatDate(data.checkout));
    UnavailablePage.setText('summary-nights',   data.nights + (data.nights === 1 ? ' night' : ' nights'));
    UnavailablePage.setText('summary-guests',   data.guests || '2 Adults');

    /* Update the intro message with the requested room type */
    if (data.roomType) {
      var label = BOOKING.ROOM_LABELS[data.roomType];
      if (label) {
        var msg = document.getElementById('unavailable-msg');
        if (msg) {
          msg.textContent = 'The ' + label + ' you requested is not available for your selected dates. Please see the alternatives below, or adjust your dates and try again.';
        }
      }
    }
  },

  /**
   * Calculate and show estimated totals on each room card
   * @param {Object} data
   */
  populateTotals: function (data) {
    var nights = data.nights || 1;

    Object.keys(BOOKING.PRICES).forEach(function (type) {
      var total = BOOKING.PRICES[type] * nights;
      var el    = document.getElementById('total-' + type);
      if (el) {
        el.textContent = BookingUtils.formatCurrency(total) + ' total';
      }
    });
  },

  /**
   * Hide the card for the room type that was unavailable
   * @param {string} roomType
   */
  hideRequestedRoom: function (roomType) {
    if (!roomType) return;
    var card = document.getElementById('alt-' + roomType);
    if (card) {
      card.hidden = true;
    }
  },

  /**
   * Pre-fill the retry booking bar with the original search values
   * @param {Object} data
   */
  prefillRetryBar: function (data) {
    var checkin  = document.getElementById('retry-checkin');
    var checkout = document.getElementById('retry-checkout');
    var guests   = document.getElementById('retry-guests');
    var roomType = document.getElementById('retry-room-type');

    if (checkin  && data.checkin)   checkin.value  = data.checkin;
    if (checkout && data.checkout)  checkout.value = data.checkout;
    if (guests   && data.guests)    guests.value   = data.guests;
    if (roomType && data.roomType)  roomType.value = data.roomType;
  },

  /**
   * Bind the Select Room buttons on each alternative card
   * Updates sessionStorage with the new room type and
   * redirects to the payment page.
   */
  bindSelectButtons: function () {
    var buttons = document.querySelectorAll('.unavailable-room-card__btn');

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var newType = this.getAttribute('data-room');
        var raw     = sessionStorage.getItem(BOOKING.SESSION_KEY);

        if (raw) {
          try {
            var data      = JSON.parse(raw);
            data.roomType = newType;
            data.price    = BOOKING.PRICES[newType];
            data.total    = data.price * (data.nights || 1);
            sessionStorage.setItem(BOOKING.SESSION_KEY, JSON.stringify(data));
          } catch (e) {
            console.error('Could not update booking data.', e);
          }
        }

        window.location.href = 'payment.html';
      });
    });
  },

  setText: function (id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

};


/* 6. CONFIRMATION PAGE
   Reads booking data from sessionStorage and populates the confirmation details.
 */

var ConfirmationPage = {

  init: function () {
    var raw = sessionStorage.getItem('crown_confirmation');
    if (!raw) return;

    try {
      var data = JSON.parse(raw);
      ConfirmationPage.populate(data);
    } catch (e) {
      console.error('Could not read confirmation data.', e);
    }
  },

  populate: function (data) {
    var typeLabel = BOOKING.ROOM_LABELS[data.roomType] || data.roomType || 'Room';

    ConfirmationPage.setText('conf-ref',      data.ref       || 'CRW-00000');
    ConfirmationPage.setText('conf-name',     data.guestName || '--');
    ConfirmationPage.setText('conf-email',    data.email     || 'your email address');
    ConfirmationPage.setText('conf-type',     typeLabel);
    ConfirmationPage.setText('conf-checkin',  BookingUtils.formatDate(data.checkin));
    ConfirmationPage.setText('conf-checkout', BookingUtils.formatDate(data.checkout));
    ConfirmationPage.setText('conf-guests',   data.guests    || '--');

    var nights = data.nights || BookingUtils.nightsBetween(data.checkin, data.checkout);
    ConfirmationPage.setText('conf-nights', nights + (nights === 1 ? ' night' : ' nights'));

    if (data.total) {
      ConfirmationPage.setText('conf-total', BookingUtils.formatCurrency(data.total));
    } else {
      ConfirmationPage.setText('conf-total', 'Confirmed at check-in');
    }

    var emailEl = document.getElementById('conf-email');
    if (emailEl && data.email) {
      emailEl.textContent = data.email;
    }

    sessionStorage.removeItem('crown_confirmation');
  },

  setText: function (id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

};


/* 8. MANAGE BOOKING PAGE
   Allows customers to look up and amend their booking by reference + email.
*/

var ManageBooking = {

  init: function () {
    ManageBooking.bindLookup();
  },

  bindLookup: function () {
    var findBtn  = document.getElementById('manageFindBtn');
    var saveBtn  = document.getElementById('manageSaveBtn');
    var cancelBtn = document.getElementById('manageCancelBtn');

    if (findBtn) {
      findBtn.addEventListener('click', function () {
        ManageBooking.lookup();
      });
    }

    var refInput = document.getElementById('manageRef');
    if (refInput) {
      refInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); ManageBooking.lookup(); }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        ManageBooking.save();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        ManageBooking.reset();
      });
    }
  },

  lookup: function () {
    var ref   = document.getElementById('manageRef').value.trim().replace('CRW-', '');
    var email = document.getElementById('manageEmail').value.trim();
    var errorEl = document.getElementById('manageError');
    errorEl.textContent = '';

    if (!ref || !email) {
      errorEl.textContent = 'Please enter both your booking reference and email address.';
      return;
    }

    fetch('/api/bookings/' + ref + '/verify?email=' + encodeURIComponent(email))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) {
          errorEl.textContent = data.message;
          ManageBooking.hideForm();
          return;
        }
        ManageBooking.populateForm(data.booking, email);
      })
      .catch(function () {
        errorEl.textContent = 'Network error. Please try again.';
      });
  },

  populateForm: function (booking, email) {
    var form = document.getElementById('manageForm');

    document.getElementById('manage-b_ref').value    = booking.b_ref;
    document.getElementById('manage-r_no').value     = booking.r_no;
    document.getElementById('manage-email').value    = email;
    document.getElementById('manage-checkin').value  = booking.checkin  ? booking.checkin.split('T')[0]  : '';
    document.getElementById('manage-checkout').value = booking.checkout ? booking.checkout.split('T')[0] : '';
    document.getElementById('manage-notes').value    = booking.b_notes || '';

    var classLabels = {
      'std_d': 'Standard Double', 'std_t': 'Standard Twin',
      'sup_d': 'Superior Double', 'sup_t': 'Superior Twin'
    };

    var summaryEl = document.getElementById('manageSummary');
    summaryEl.innerHTML =
      '<p class="manage-summary__ref">Booking <strong>CRW-' + booking.b_ref + '</strong></p>' +
      '<p class="manage-summary__detail">' + booking.c_name + ' &middot; ' +
      (classLabels[booking.r_class] || booking.r_class) + ' &middot; Room ' + booking.r_no + '</p>';

    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  save: function () {
    var b_ref    = document.getElementById('manage-b_ref').value;
    var r_no     = document.getElementById('manage-r_no').value;
    var email    = document.getElementById('manage-email').value;
    var checkin  = document.getElementById('manage-checkin').value;
    var checkout = document.getElementById('manage-checkout').value;
    var notes    = document.getElementById('manage-notes').value;
    var errorEl  = document.getElementById('manageError');
    var successEl = document.getElementById('manageSuccess');

    errorEl.textContent = '';
    successEl.hidden = true;

    if (!checkin || !checkout) {
      errorEl.textContent = 'Please enter both check-in and check-out dates.';
      return;
    }
    if (checkout <= checkin) {
      errorEl.textContent = 'Check-out must be after check-in.';
      return;
    }

    fetch('/api/bookings/' + b_ref + '/amend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, r_no: r_no, checkin: checkin, checkout: checkout, b_notes: notes })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.success) {
        successEl.hidden = false;
        successEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        document.getElementById('manageForm').hidden = true;
        document.getElementById('manageSummary').innerHTML = '';
      } else {
        errorEl.textContent = data.message || 'Could not update booking. Please try again.';
      }
    })
    .catch(function () {
      errorEl.textContent = 'Network error. Please try again.';
    });
  },

  hideForm: function () {
    document.getElementById('manageForm').hidden = true;
    document.getElementById('manageSummary').innerHTML = '';
  },

  reset: function () {
    ManageBooking.hideForm();
    document.getElementById('manageRef').value   = '';
    document.getElementById('manageEmail').value = '';
    document.getElementById('manageError').textContent = '';
    document.getElementById('manageSuccess').hidden = true;
  }

};


/* 7. INIT -- PAGE ROUTERn */

document.addEventListener('DOMContentLoaded', function () {
  var body = document.body;

  if (document.querySelector('.booking-bar')) {
    BookingBar.init();
  }

  if (body.classList.contains('page-payment')) {
    PaymentPage.init();
  }

  if (body.classList.contains('page-unavailable')) {
    UnavailablePage.init();
  }

  if (body.classList.contains('page-confirmation')) {
    ConfirmationPage.init();
  }

  if (body.classList.contains('page-manage')) {
    ManageBooking.init();
  }
});


/* 8. Pre select when clicking 'book this room' on rooms page and hides nav bar */

document.querySelectorAll('[data-select-room]').forEach(function (btn) {
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    var roomType = this.getAttribute('data-select-room');
    var select = document.getElementById('room-type');
    if (select) select.value = roomType;

    var bookingBar = document.getElementById('booking');
    if (bookingBar) {
      var navHeight = document.querySelector('.nav') ? document.querySelector('.nav').offsetHeight : 0;
      var top = bookingBar.getBoundingClientRect().top + window.pageYOffset - navHeight;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  });
});
