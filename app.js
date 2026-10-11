(function () {
  'use strict';

  var page = (window.location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /**
   * @param {Element|null} element
   * @returns {HTMLElement|null}
   */
  function asHTMLElement(element) {
    return element instanceof HTMLElement ? element : null;
  }

  /**
   * @param {HTMLElement|null} button
   */
  function setExpanded(button, expanded) {
    if (button) button.setAttribute('aria-expanded', String(expanded));
  }

  function handleEscape(event) {
    if (event.key === 'Escape') closeMenu();
  }

  /**
   * @param {HTMLElement=} button
   */
  function openMenu(button) {
    var menu = asHTMLElement(document.getElementById('mobileNav')) || asHTMLElement(document.getElementById('mobNav'));
    if (!menu) return;

    menu.classList.add('open');
    document.body.classList.add('menu-open');
    setExpanded(button || null, true);
    document.addEventListener('keydown', handleEscape);

    var firstLink = asHTMLElement(menu.querySelector('a, button'));
    if (firstLink) window.setTimeout(function () { firstLink.focus(); }, 40);
  }

  function closeMenu() {
    var menu = asHTMLElement(document.getElementById('mobileNav')) || asHTMLElement(document.getElementById('mobNav'));
    if (menu) menu.classList.remove('open');
    document.body.classList.remove('menu-open');

    var trigger = asHTMLElement(document.querySelector('.menu-btn, .burger'));
    setExpanded(trigger, false);
    document.removeEventListener('keydown', handleEscape);
  }

  /**
   * @param {HTMLElement} button
   */
  function toggleFaq(button) {
    var item = asHTMLElement(button.closest('.faq-item'));
    if (!item) return;

    var shouldOpen = !item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(function (node) {
      var faq = asHTMLElement(node);
      if (!faq) return;
      faq.classList.remove('open');
      setExpanded(asHTMLElement(faq.querySelector('.faq-q')), false);
    });

    if (shouldOpen) {
      item.classList.add('open');
      setExpanded(button, true);
    }
  }

  /**
   * @param {HTMLElement} button
   */
  function toggleExpand(button) {
    var block = asHTMLElement(button.nextElementSibling);
    if (!block) return;

    var shouldOpen = !block.classList.contains('open');
    block.classList.toggle('open', shouldOpen);
    setExpanded(button, shouldOpen);
  }

  function ensurePolishStyles() {
    if (document.querySelector('link[href="editorial-polish.css"]')) return;

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'editorial-polish.css';
    document.head.appendChild(link);
  }

  function setSeo() {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://lizty666.ru' + window.location.pathname.replace(/index\.html$/, ''));
  }

  function setActiveLinks() {
    var current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('a[href]').forEach(function (anchor) {
      var href = anchor.getAttribute('href');
      if (href === current || (current === 'index.html' && href === 'index.html')) {
        anchor.setAttribute('aria-current', 'page');
      }
    });
  }

  function createOrbitScene() {
    if (document.querySelector('.editorial-orbit-scene')) return;

    var scene = document.createElement('div');
    scene.className = 'editorial-orbit-scene';
    scene.setAttribute('aria-hidden', 'true');
    scene.innerHTML = '<span></span><span></span><span></span>';
    document.body.insertBefore(scene, document.body.firstChild);
  }

  /**
   * @param {Element} element
   */
  function animateReveal(element) {
    if (reducedMotion || typeof element.animate !== 'function') return;

    element.animate([
      { opacity: 0.72, transform: 'translate3d(0, 12px, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' }
    ], {
      duration: 520,
      easing: 'cubic-bezier(.16, 1, .3, 1)',
      fill: 'none'
    });
  }

  function revealOnScroll() {
    var selector = [
      '.fi',
      '.reveal',
      '.card',
      '.service-full',
      '.when-card',
      '.vs-card',
      '.info-card',
      '.faq-item',
      '.choice-card',
      '.popular-list a',
      '.trust-grid > div',
      '.request',
      '.quote-card',
      '.list-block li'
    ].join(',');

    var elements = Array.prototype.slice.call(document.querySelectorAll(selector));
    elements.forEach(function (element) {
      element.classList.add('is-revealed', 'vis', 'visible');
    });

    if (reducedMotion || !('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || entry.target.getAttribute('data-motion-revealed') === 'true') return;
        entry.target.setAttribute('data-motion-revealed', 'true');
        animateReveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });

    elements.forEach(function (element) {
      observer.observe(element);
    });
  }

  function bindPointerDepth() {
    if (!finePointer || reducedMotion) return;

    var depthTargets = document.querySelectorAll([
      '.card',
      '.service-full',
      '.when-card',
      '.vs-card',
      '.info-card',
      '.choice-card',
      '.popular-list a',
      '.trust-grid > div',
      '.request',
      '.quote-card'
    ].join(','));

    depthTargets.forEach(function (node) {
      var target = asHTMLElement(node);
      if (!target) return;

      target.addEventListener('pointermove', function (rawEvent) {
        var event = /** @type {PointerEvent} */ (rawEvent);
        var rect = target.getBoundingClientRect();
        target.style.setProperty('--mx', String(((event.clientX - rect.left) / rect.width) * 100) + '%');
        target.style.setProperty('--my', String(((event.clientY - rect.top) / rect.height) * 100) + '%');
      });
    });

    document.querySelectorAll('.btn, .btn-primary, .btn-secondary, .header-cta, .nav-cta, .svc-cta').forEach(function (node) {
      var button = asHTMLElement(node);
      if (!button) return;

      button.addEventListener('pointermove', function (rawEvent) {
        var event = /** @type {PointerEvent} */ (rawEvent);
        var rect = button.getBoundingClientRect();
        var x = ((event.clientX - rect.left) / rect.width - 0.5) * 7;
        var y = ((event.clientY - rect.top) / rect.height - 0.5) * 7;
        button.style.setProperty('--magnetic-x', x.toFixed(2) + 'px');
        button.style.setProperty('--magnetic-y', y.toFixed(2) + 'px');
      });

      button.addEventListener('pointerleave', function () {
        button.style.setProperty('--magnetic-x', '0px');
        button.style.setProperty('--magnetic-y', '0px');
      });
    });
  }

  function bindPressFeedback() {
    document.querySelectorAll('a, button').forEach(function (node) {
      var control = asHTMLElement(node);
      if (!control) return;

      control.addEventListener('pointerdown', function () {
        control.classList.add('is-pressed');
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (eventName) {
        control.addEventListener(eventName, function () {
          control.classList.remove('is-pressed');
        });
      });
    });
  }

  function bindFormFeedback() {
    document.querySelectorAll('input, textarea, select').forEach(function (node) {
      var field = /** @type {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null} */ (node);
      if (!field) return;

      field.addEventListener('invalid', function () {
        field.setAttribute('aria-invalid', 'true');
      });
      field.addEventListener('input', function () {
        if (field.checkValidity()) field.removeAttribute('aria-invalid');
      });
    });
  }

  /**
   * @param {HTMLAnchorElement} anchor
   * @param {MouseEvent} event
   * @returns {boolean}
   */
  function shouldTransition(anchor, event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return false;
    if (!anchor.href || anchor.origin !== window.location.origin) return false;
    if (anchor.hash && anchor.pathname === window.location.pathname) return false;
    return /\.html$/.test(anchor.pathname) || anchor.pathname.endsWith('/');
  }

  function bindNavigationTransitions() {
    if (reducedMotion) return;

    var supportsNativeTransitions = typeof CSS !== 'undefined' && CSS.supports('view-transition-name: root');
    if (supportsNativeTransitions) return;

    document.addEventListener('click', function (rawEvent) {
      var event = /** @type {MouseEvent} */ (rawEvent);
      var target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || !shouldTransition(target, event)) return;

      event.preventDefault();
      document.body.classList.add('page-leaving');
      window.setTimeout(function () {
        window.location.href = target.href;
      }, 220);
    });
  }

  function initialize() {
    document.body.dataset.page = page;
    ensurePolishStyles();
    createOrbitScene();
    setSeo();
    setActiveLinks();
    revealOnScroll();
    bindPointerDepth();
    bindPressFeedback();
    bindFormFeedback();
    bindNavigationTransitions();

    window.requestAnimationFrame(function () {
      document.body.classList.add('is-ready');
    });
  }

  window.openMenu = openMenu;
  window.closeMenu = closeMenu;
  window.openMob = openMenu;
  window.closeMob = closeMenu;
  window.toggleFaq = toggleFaq;
  window.toggleExpand = toggleExpand;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
