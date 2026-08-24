/**
 * East Bay Home Services — Main JavaScript
 * Minimal, progressive enhancement only.
 * No frameworks — this is a static site.
 */

(function () {
  'use strict';

  /* --- Mobile Menu --- */
  const menuToggle = document.querySelector('.menu-toggle');
  const mainNav = document.querySelector('.main-nav');

  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', function () {
      const isOpen = mainNav.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', isOpen);
    });

    // Close menu when clicking a link
    mainNav.querySelectorAll('.main-nav__link').forEach(function (link) {
      link.addEventListener('click', function () {
        mainNav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* --- Sticky Header Shadow --- */
  const header = document.querySelector('.site-header');
  if (header) {
    let ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          header.classList.toggle('is-scrolled', window.scrollY > 10);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* --- FAQ Accordion --- */
  document.querySelectorAll('.faq-question').forEach(function (button) {
    button.addEventListener('click', function () {
      const item = button.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const isOpen = item.classList.contains('is-open');

      // Close other items in the same list (optional: single-open behavior)
      const list = item.closest('.faq-list');
      if (list) {
        list.querySelectorAll('.faq-item.is-open').forEach(function (openItem) {
          if (openItem !== item) {
            openItem.classList.remove('is-open');
            openItem.querySelector('.faq-answer').setAttribute('aria-hidden', 'true');
            openItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
          }
        });
      }

      item.classList.toggle('is-open', !isOpen);
      answer.setAttribute('aria-hidden', isOpen);
      button.setAttribute('aria-expanded', !isOpen);
    });
  });

  /* --- Smooth scroll for anchor links --- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

})();
