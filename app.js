(function(){
  var path=(location.pathname.split('/').pop()||'index.html');
  var isHome=path==='index.html' || path==='';
  var premiumVideo='https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4';

  if(!isHome){
    document.documentElement.style.background='#0c0c0c';
    if(document.body) document.body.classList.add('premium-inner');
    ['mobile-hero-short.css','site-improvements.css'].forEach(function(href){
      if(document.querySelector('link[href="'+href+'"]')) return;
      var link=document.createElement('link');
      link.rel='stylesheet';
      link.href=href;
      document.head.appendChild(link);
    });
  }

  function ensurePremiumScene(){
    if(isHome || document.getElementById('premiumScene')) return;
    document.body.classList.add('premium-inner');

    var svg=document.createElement('div');
    svg.className='premium-noise-svg';
    svg.innerHTML='<svg width="0" height="0" aria-hidden="true"><filter id="c3-noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0"/><feComposite in2="SourceGraphic" operator="in" result="noise"/><feBlend in="SourceGraphic" in2="noise" mode="multiply"/></filter></svg>';
    document.body.insertBefore(svg,document.body.firstChild);

    var scene=document.createElement('div');
    scene.id='premiumScene';
    scene.innerHTML='<div class="premium-bg-video"><video autoplay loop muted playsinline src="'+premiumVideo+'"></video></div><div class="premium-guide left"></div><div class="premium-guide right"></div>';
    document.body.insertBefore(scene,document.body.firstChild);
  }

  function injectMacBar(){
    if(isHome || document.querySelector('.premium-macbar')) return;
    var header=document.querySelector('header');
    if(!header) return;
    var bar=document.createElement('div');
    bar.className='premium-macbar reveal';
    bar.innerHTML='<div class="premium-macbar-inner"><div class="premium-macbar-left"><svg width="14" height="14" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg><strong>liz_ty666</strong><span>Разборы</span><span>Астрология</span><span>Руны</span><span>Свечи</span><span>Обучение</span></div><div class="premium-macbar-right"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><span>Wed May 6 1:09 PM</span></div></div>';
    header.insertAdjacentElement('afterend',bar);
  }

  function openMenu(btn){
    var menu=document.getElementById('mobileNav')||document.getElementById('mobNav');
    if(menu) menu.classList.add('open');
    if(btn) btn.setAttribute('aria-expanded','true');
    document.addEventListener('keydown',handleEsc);
  }

  function closeMenu(){
    var menu=document.getElementById('mobileNav')||document.getElementById('mobNav');
    if(menu) menu.classList.remove('open');
    var burger=document.querySelector('.menu-btn,.burger');
    if(burger) burger.setAttribute('aria-expanded','false');
    document.removeEventListener('keydown',handleEsc);
  }

  function handleEsc(e){
    if(e.key==='Escape') closeMenu();
  }

  function toggleFaq(btn){
    var item=btn.closest('.faq-item');
    if(!item) return;
    var isOpen=item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(function(x){
      x.classList.remove('open');
      var q=x.querySelector('.faq-q');
      if(q) q.setAttribute('aria-expanded','false');
    });
    if(!isOpen){
      item.classList.add('open');
      btn.setAttribute('aria-expanded','true');
    }
  }

  function toggleExpand(btn){
    var block=btn.nextElementSibling;
    if(!block) return;
    var isOpen=block.classList.contains('open');
    block.classList.toggle('open',!isOpen);
    btn.setAttribute('aria-expanded',String(!isOpen));
  }

  window.openMenu=openMenu;
  window.closeMenu=closeMenu;
  window.openMob=openMenu;
  window.closeMob=closeMenu;
  window.toggleFaq=toggleFaq;
  window.toggleExpand=toggleExpand;

  function revealOnScroll(){
    var elements=document.querySelectorAll('.reveal,.fi,.card,.info-card,.faq-item,.list-block li,.choice-card,.popular-list a,.trust-grid>div');
    if(!('IntersectionObserver' in window)){
      elements.forEach(function(el){el.classList.add('visible','vis')});
      return;
    }
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('visible','vis');
          observer.unobserve(entry.target);
        }
      });
    },{threshold:.08,rootMargin:'0px 0px -40px 0px'});
    elements.forEach(function(el){
      el.classList.add('reveal');
      observer.observe(el);
    });
  }

  function setActiveLinks(){
    var current=(location.pathname.split('/').pop()||'index.html');
    document.querySelectorAll('a[href]').forEach(function(a){
      var href=a.getAttribute('href');
      if(href===current || (current==='index.html' && href==='index.html')){
        a.setAttribute('aria-current','page');
      }
    });
  }

  function bindGlassPointer(){
    document.querySelectorAll('.liquid-glass,.c3-card,.request,.quote-card,.card,.info-card,.faq-item,.choice-card,.popular-list a,.trust-grid>div').forEach(function(card){
      card.addEventListener('mousemove',function(e){
        var rect=card.getBoundingClientRect();
        card.style.setProperty('--mx',((e.clientX-rect.left)/rect.width)*100+'%');
        card.style.setProperty('--my',((e.clientY-rect.top)/rect.height)*100+'%');
      });
    });
  }

  function setSeo(){
    var canonical=document.querySelector('link[rel="canonical"]');
    if(!canonical){
      canonical=document.createElement('link');
      canonical.rel='canonical';
      document.head.appendChild(canonical);
    }
    canonical.href='https://lizty666.ru'+location.pathname.replace(/index\.html$/,'');
  }

  document.addEventListener('DOMContentLoaded',function(){
    ensurePremiumScene();
    injectMacBar();
    setSeo();
    setActiveLinks();
    revealOnScroll();
    bindGlassPointer();
  });
})();
