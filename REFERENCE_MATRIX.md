# Reference matrix — liz_ty666

Цель: собрать не коллаж из модных сайтов, а единый язык для образовательного личного бренда Лизы: **dark editorial × living archive**, где визуальная смелость поддерживает путь `понимание ценности → доверие → выбор уровня → доказательства → диагностика → Telegram`.

## 1. Главный арт-дирекшен / дизайн-система

### Refero Styles — Dennis Snellenberg
https://styles.refero.design/style/28e8e762-8d8c-4e88-84ed-858f9917cb58

**Берём:**
- почти монохромный тёмный холст;
- один редкий насыщенный акцент вместо нескольких декоративных цветов;
- типографику как главный носитель характера;
- большие плоские поверхности без карточочного «SaaS»-шума;
- фотографию как эмоциональный центр, а UI — как тихую рамку.

**Не берём:** фирменный фиолетовый, конкретные радиусы и композицию сайта один-в-один.

### Зафиксированная система liz_ty666
- **Canvas:** `#0C0B0C`;
- **Raised:** `#151213` / `#1D1819`;
- **Paper:** `#EDE4D7`;
- **Accent:** `#B41628` / `#7D1019`;
- **Text:** `#F5EEE5`;
- **Body:** Onest;
- **Display:** Dela Gothic One;
- **Script:** Caveat — только как редкая человеческая пометка, не декоративный паттерн;
- **Grid:** 12-col desktop / 4-col mobile; контентный max-width ~1240px;
- **Spacing:** крупные секционные интервалы 72–118px, локальная шкала 8/12/16/24/32/48/72;
- **Radii:** почти везде 0; округление не является частью языка;
- **Surfaces:** плоские, hairline borders, без теней;
- **Buttons:** прямоугольные, контрастные, uppercase microcopy;
- **Imagery:** портреты full-bleed/crop, лёгкий editorial contrast, без декоративных фоторамок;
- **Motion character:** медленный, инерционный, «галерейный»; scale 1.00→1.04, clip/opacity и небольшая типографическая параллакс-дельта; никаких постоянных плавающих частиц.

## 2. Композиционные референсы

### SiteInspire — Fiona Vilmer
https://www.siteinspire.com/website/13461-fiona-vilmer

**Берём:** сочетание editorial typography + photography + portfolio cadence. Применение: hero и большие фото-блоки должны читаться как разворот журнала, а не как «карточка с картинкой».

### HOVERSTAT.ES — Ballet National de Marseille / editorial archive
https://www.hoverstat.es/archive/?tags=editorial

**Берём:** sticky/layered choreography и крупный типографический ритм. Применение: мягкая реакция hero-фото и headline на scroll, без scroll-jacking.

### Lapa Ninja — Process Masterclass
https://www.lapa.ninja/post/process-masterclass/

**Берём:** образовательный оффер как последовательность «что изменится → как устроен путь → куда войти». Применение: не показывать программы как каталог, а удерживать narrative progression.

## 3. Motion language

### Motion — Scroll Zoom Hero
https://motion.dev/examples/react-scroll-zoom-hero

### GSAP ScrollTrigger docs
https://gsap.com/docs/v3/Plugins/ScrollTrigger/

**Берём:** связь движения с конкретным диапазоном scroll, небольшой scale/translate и чёткие точки входа. Реализация остаётся на vanilla JS + CSS, чтобы не добавлять библиотеку только ради эффекта.

**Правила:**
- transform only; no layout thrashing;
- requestAnimationFrame;
- motion отключается при `prefers-reduced-motion: reduce`;
- мобильный motion слабее desktop;
- промежуточные scroll states должны оставаться читаемыми, а не только start/end.

## 4. Mobile behavior / UX flow

### Page Flows — Busuu onboarding
https://pageflows.com/post/ios/onboarding/busuu/

**Берём:** прогресс по шагам, сначала простые ответы про опыт/цель, затем контакт. Применение: диагностика обучения остаётся короткой и не превращается в длинную форму.

### Growth.Design — HEY onboarding
https://growth.design/case-studies/hey-user-onboarding

**Берём:** маленькие понятные шаги снижают воспринимаемую сложность; пользователь сначала делает лёгкие действия, потом заполняет данные.

## 5. Conversion references

### GoodUI
https://goodui.org/

**Берём:**
- social proof рядом с моментами выбора;
- повтор CTA на длинной странице;
- минимум полей;
- mobile sticky CTA как поддержка, а не второй навбар.

### Growth.Design — Jobs-to-be-done onboarding
https://growth.design/case-studies/headspace-user-onboarding

**Берём:** вопрос «зачем ты пришла?» важнее названия курса. Применение: точки входа формулируются через ситуацию/цель ученицы.

## 6. Typography check

### Typewolf
https://www.typewolf.com/

Проверка трендов подтверждает направление «выразительный display + спокойный grotesk/body» вместо автоматического выбора Inter/Poppins/Manrope.

### Fonts In Use
https://fontsinuse.com/

Используем как контроль редакционной типографики: крупный grotesk должен работать через scale/spacing, а не через избыток эффектов.

### Onest
https://onest.md/en

Onest оставляем для текста и интерфейса: семейство поддерживает кириллицу, рассчитано на чтение с экрана и сохраняет характер в длинном тексте.

## 7. Что меняем в текущем сайте

1. Усиливаем contrast hierarchy: меньше конкурирующих рамок, больше «тёмного воздуха» и крупных editorial surfaces.
2. Добавляем scroll progress как тихую навигационную метку, а не декоративный loading bar.
3. Hero-фотография получает мягкий scroll-linked scale/translate; текст — меньшую встречную дельту.
4. На desktop вводим вертикальную editorial rail-метку раздела; на mobile её отключаем.
5. Entry/proof/program blocks получают unified hover language без «AI-card» поведения.
6. Mobile sticky CTA становится компактнее, с учётом safe-area и без конкуренции с меню.
7. Диагностика сохраняет 3 шага, но получает более явное ощущение прогресса и success state.
8. Reduced motion — полноценный режим: статичные изображения, без parallax/scale, все reveal сразу читаемы.

## 8. Не используем

- Three.js без продуктовой причины;
- постоянные звёзды/частицы/«магические» курсоры;
- стеклянные карточки, неон, glow и gradients как дефолтный декор;
- несколько эстетик одновременно;
- копирование готовых 21st.dev / Aceternity / Motion Primitives компонентов без переработки;
- motion, который мешает прочитать оффер или добраться до CTA.
