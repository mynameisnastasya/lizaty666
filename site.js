(function () {
  'use strict';

  var body = document.body;
  var menu = document.querySelector('.site-nav');
  var menuButton = document.querySelector('.menu-toggle');

  function closeMenu() {
    if (!menu || !menuButton) return;
    menu.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    body.classList.remove('menu-open');
  }

  if (menu && menuButton) {
    menuButton.addEventListener('click', function () {
      var open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      body.classList.toggle('menu-open', open);
    });
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeMenu();
      closeDiagnostic();
    }
  });

  var currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.site-nav a[data-page]').forEach(function (link) {
    if (link.getAttribute('data-page') === currentPage) link.setAttribute('aria-current', 'page');
  });

  document.querySelectorAll('.faq-q').forEach(function (button) {
    button.addEventListener('click', function () {
      var item = button.closest('.faq-item');
      var open = item.classList.contains('open');
      item.classList.toggle('open', !open);
      button.setAttribute('aria-expanded', String(!open));
    });
  });

  var revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px' });
    revealItems.forEach(function (item) { observer.observe(item); });
  } else {
    revealItems.forEach(function (item) { item.classList.add('visible'); });
  }

  document.querySelectorAll('[data-year]').forEach(function (node) {
    node.textContent = new Date().getFullYear();
  });

  var diagnostic = document.createElement('div');
  diagnostic.className = 'diagnostic';
  diagnostic.id = 'diagnostic';
  diagnostic.setAttribute('aria-hidden', 'true');
  diagnostic.innerHTML =
    '<div class="diagnostic__panel" role="dialog" aria-modal="true" aria-label="Подбор обучения">' +
      '<button class="diagnostic__close" type="button" aria-label="Закрыть диагностику">×</button>' +
      '<div class="eyebrow">Подбор обучения</div>' +
      '<div class="diagnostic__progress" aria-hidden="true"><span></span></div>' +
      '<form id="diagnosticForm">' +
        '<section class="diagnostic__step active" data-step="1">' +
          '<span class="diagnostic__count">Вопрос 01 / 03</span>' +
          '<h2 id="diagnosticTitle">Ты уже изучала астрологию?</h2>' +
          '<div class="choice-list">' +
            choice('level', 'Нет, начинаю с нуля') +
            choice('level', 'Немного знаю базу') +
            choice('level', 'Уже читаю натальные карты') +
            choice('level', 'Уже консультирую') +
          '</div>' +
          '<div class="diagnostic__actions"><span></span><button class="button button--ink" type="button" data-next>Дальше →</button></div>' +
        '</section>' +
        '<section class="diagnostic__step" data-step="2">' +
          '<span class="diagnostic__count">Вопрос 02 / 03</span>' +
          '<h2>Чего ты хочешь?</h2>' +
          '<div class="choice-list">' +
            choice('goal', 'Разобраться для себя') +
            choice('goal', 'Научиться читать карты') +
            choice('goal', 'Глубже работать с человеком') +
            choice('goal', 'Освоить прогнозирование') +
            choice('goal', 'Начать консультировать профессионально') +
          '</div>' +
          '<div class="diagnostic__actions"><button class="button button--text" type="button" data-prev>← Назад</button><button class="button button--ink" type="button" data-next>Дальше →</button></div>' +
        '</section>' +
        '<section class="diagnostic__step" data-step="3">' +
          '<span class="diagnostic__count">Вопрос 03 / 03</span>' +
          '<h2>Как с тобой связаться?</h2>' +
          '<div class="field"><label for="studentName">Имя</label><input id="studentName" name="studentName" autocomplete="name" required></div>' +
          '<div class="field"><label for="studentContact">Telegram или другой удобный контакт</label><input id="studentContact" name="studentContact" autocomplete="off" placeholder="@username" required></div>' +
          '<div class="field"><label for="studentNote">Если хочется — пара слов о своей точке</label><textarea id="studentNote" name="studentNote" placeholder="Что уже знаешь и что сейчас не получается"></textarea></div>' +
          '<p class="note">После отправки откроется Telegram с готовым сообщением. Ничего не уйдёт без твоего подтверждения.</p>' +
          '<div class="diagnostic__actions"><button class="button button--text" type="button" data-prev>← Назад</button><button class="button button--ink" type="submit">Отправить Лизе</button></div>' +
        '</section>' +
      '</form>' +
      '<div class="diagnostic__success" aria-live="polite">' +
        '<span class="diagnostic__count">Готово</span>' +
        '<span class="script">Спасибо.</span>' +
        '<h2>Лиза посмотрит твою точку входа и подскажет, какой формат действительно имеет смысл.</h2>' +
        '<p>Сообщение для Лизы готово. Открой Telegram и отправь его, когда будешь готова.</p>' +
        '<div class="actions"><a class="button button--ink" id="telegramFallback" target="_blank" rel="noopener noreferrer">Открыть Telegram ещё раз</a><button class="button button--text" type="button" data-close>Закрыть</button></div>' +
      '</div>' +
    '</div>';
  body.appendChild(diagnostic);

  function choice(name, value) {
    var id = name + '-' + value.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-');
    return '<div class="choice"><input type="radio" id="' + id + '" name="' + name + '" value="' + value + '" required><label for="' + id + '">' + value + '</label></div>';
  }

  var form = diagnostic.querySelector('#diagnosticForm');
  var progress = diagnostic.querySelector('.diagnostic__progress span');
  var panel = diagnostic.querySelector('.diagnostic__panel');
  var step = 1;
  var lastTrigger = null;

  function showStep(number) {
    step = number;
    diagnostic.querySelectorAll('.diagnostic__step').forEach(function (section) {
      section.classList.toggle('active', Number(section.getAttribute('data-step')) === number);
    });
    progress.style.width = (number * 33.333) + '%';
    panel.scrollTop = 0;
    var active = diagnostic.querySelector('.diagnostic__step.active input');
    if (active) setTimeout(function () { active.focus({ preventScroll: true }); }, 80);
  }

  function openDiagnostic(trigger) {
    lastTrigger = trigger || document.activeElement;
    form.reset();
    form.style.display = '';
    diagnostic.querySelector('.diagnostic__progress').style.display = '';
    diagnostic.querySelector('.diagnostic__success').classList.remove('active');
    diagnostic.classList.add('open');
    diagnostic.setAttribute('aria-hidden', 'false');
    body.classList.add('modal-open');
    showStep(1);
    setTimeout(function () { diagnostic.querySelector('.diagnostic__close').focus(); }, 40);
  }

  function closeDiagnostic() {
    if (!diagnostic.classList.contains('open')) return;
    diagnostic.classList.remove('open');
    diagnostic.setAttribute('aria-hidden', 'true');
    body.classList.remove('modal-open');
    if (lastTrigger) lastTrigger.focus();
  }

  document.querySelectorAll('[data-diagnostic]').forEach(function (trigger) {
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      openDiagnostic(trigger);
    });
  });

  diagnostic.querySelector('.diagnostic__close').addEventListener('click', closeDiagnostic);
  diagnostic.addEventListener('click', function (event) {
    if (event.target === diagnostic) closeDiagnostic();
  });
  diagnostic.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    var focusable = Array.from(diagnostic.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])')).filter(function (node) {
      return node.offsetParent !== null;
    });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  diagnostic.querySelector('[data-close]').addEventListener('click', closeDiagnostic);

  diagnostic.querySelectorAll('[data-next]').forEach(function (button) {
    button.addEventListener('click', function () {
      var active = diagnostic.querySelector('.diagnostic__step.active');
      var checked = active.querySelector('input[type="radio"]:checked');
      if (!checked) {
        var first = active.querySelector('input[type="radio"]');
        if (first) first.reportValidity();
        return;
      }
      showStep(Math.min(3, step + 1));
    });
  });
  diagnostic.querySelectorAll('[data-prev]').forEach(function (button) {
    button.addEventListener('click', function () { showStep(Math.max(1, step - 1)); });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    var data = new FormData(form);
    var message = [
      'Здравствуйте, Лиза! Хочу подобрать обучение.',
      '',
      'Мой уровень: ' + data.get('level'),
      'Моя цель: ' + data.get('goal'),
      'Имя: ' + data.get('studentName'),
      'Контакт: ' + data.get('studentContact')
    ];
    if (String(data.get('studentNote') || '').trim()) message.push('О моей точке: ' + data.get('studentNote'));
    var url = 'https://t.me/liz_ty666?text=' + encodeURIComponent(message.join('\n'));
    diagnostic.querySelector('#telegramFallback').href = url;
    window.open(url, '_blank', 'noopener,noreferrer');
    form.style.display = 'none';
    diagnostic.querySelector('.diagnostic__progress').style.display = 'none';
    diagnostic.querySelector('.diagnostic__success').classList.add('active');
    panel.scrollTop = 0;
  });
})();
