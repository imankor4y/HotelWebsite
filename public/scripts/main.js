/* =============================================
   CROWN HOTEL -- Main JavaScript
   main.js

   Handles all shared public-facing interactions:
   1. Navigation -- fade on scroll, hamburger menu
   2. Smooth scroll indicator fade
   ============================================= */


/*  1. NAVIGATION/HAMBURGER */

(function () {
  var nav       = document.querySelector('.nav');
  var hamburger = document.querySelector('.nav__hamburger');
  var navLeft   = document.querySelector('.nav__links--left');
  var navRight  = document.querySelector('.nav__links--right');

  if (!nav) return;

  /* Fade nav on scroll, only on pages where nav starts transparent */
  var ticking = false;

  function updateNav() {
    if (window.scrollY > 40) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(updateNav);
      ticking = true;
    }
  }, { passive: true });

  /* Solid nav on hover */
  nav.addEventListener('mouseenter', function () {
    nav.classList.add('nav--hover');
  });

  nav.addEventListener('mouseleave', function () {
    nav.classList.remove('nav--hover');
  });

  /* Hamburger menu toggle */
  if (hamburger) {
    hamburger.addEventListener('click', function () {
      var isOpen = hamburger.getAttribute('aria-expanded') === 'true';
      hamburger.setAttribute('aria-expanded', String(!isOpen));

      if (navLeft)  navLeft.classList.toggle('nav__links--open');
      if (navRight) navRight.classList.toggle('nav__links--open');
    });

    /* Close menu when any nav link is clicked */
    document.querySelectorAll('.nav__links a').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.setAttribute('aria-expanded', 'false');
        if (navLeft)  navLeft.classList.remove('nav__links--open');
        if (navRight) navRight.classList.remove('nav__links--open');
      });
    });
  }


/* 2. SCROLL INDICATOR */

  var indicator = document.querySelector('.scroll-indicator-wrapper');

  if (indicator) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 80) {
        indicator.style.opacity = '0';
      } else {
        indicator.style.opacity = '1';
      }
    }, { passive: true });
  }

})();





/* unused code 
===============================================================
*/ 


/* 
    (function () {
      const nav = document.querySelector('.nav');
      let ticking = false;

      function updateNav() {
        if (window.scrollY > 40) {
          nav.classList.add('nav--scrolled');
        } else {
          nav.classList.remove('nav--scrolled');
        }
        ticking = false;
      }

      window.addEventListener('scroll', function () {
        if (!ticking) {
          requestAnimationFrame(updateNav);
          ticking = true;
        }
      });

      nav.addEventListener('mouseenter', function () {
        nav.classList.add('nav--hover');
      });
      nav.addEventListener('mouseleave', function () {
        nav.classList.remove('nav--hover');
      });
    })();
*/
   