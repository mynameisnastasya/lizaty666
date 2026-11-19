from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import re,json,os
origin=os.getenv('ASTRODAY_TEST_ORIGIN','https://lizty666-stage.up.railway.app')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROME_BIN'),args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':780},locale='ru-RU',timezone_id='Asia/Krasnoyarsk',permissions=['clipboard-read','clipboard-write'])
 profile=dict(registered=True,fullName='Анна',birthDate='2001-03-14',birthTime='08:25',birthCity='Красноярск',birthPlaceId=5,chatBound=True,deliveryTimezone='Asia/Krasnoyarsk',deliveryHour=8,deliveryMinute=35,dailyConsent=True,notifyEnabled=True,subscriptionUntil='2026-12-17T17:00:00Z',accessSource='astroday_tester_trial',marketingConsent=True)
 data={'auth':True,'fail':False,'state':'ready','readyForPublicSales':True,'calls':[]}
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 text='🔮 ТВОЙ ПРОГНОЗ НА 19 НОЯБРЯ\n\nВЕЧЕР, НА КОТОРЫЙ ХВАТИТ СИЛ\n\nАнна, сегодня может захотеться собрать близких за одним столом.\n\nДОМ И БЛИЗКИЕ\nВенера в твоём доме семьи образует квадрат к Сатурну.'
 def api(r):
  k=r.request.url.split('/_api/')[-1];data['calls'].append(k);v={};s=200
  if k in ('auth/session','tg-auth/status'):v={'user':{'id':'123'},'state':'authenticated'} if data['auth'] else {};s=200 if data['auth'] else 401
  elif k=='tg-auth/start':v={'botUrl':'https://t.me/Lizty666bot?start=fixture'}
  elif k=='forecast/me':v=profile;s=503 if data['fail'] else 200
  elif k=='app-status':v={'forecastAvailable':True,'paymentsAvailable':True,'dailyDeliveryAvailable':True}
  elif k in ('forecast/today','forecast/preview'):v=dict(version='astroday-v2',source='astroday_v2_forecasts',day='2026-11-19',status=data['state'],text=text,preview=text)
  elif k=='forecast/chart':v={'natal':{'Солнце':'Весы 7.4°'}}
  elif k.startswith('forecast/places'):v={'places':[{'id':5,'name':'Красноярск','label':'Красноярск, Россия'}]}
  elif k in ('forecast/settings','forecast/register'):data['written']=r.request.post_data_json['json'];v={'ok':True}
  elif k=='payments/plans':v={'provider':'yookassa','plans':[{'code':c,'months':m,'title':c,'rub':rub} for c,m,rub in [('month',1,1666),('halfyear',6,3666),('year',12,6666)]]}
  elif k=='payments/readiness':v={'readyForPublicSales':data['readyForPublicSales']}
  elif k=='payments/checkout':v={'orderId':'aaaa0000-0000-4000-a000-000000000000','status':'canceled'}
  elif k=='payments/order-status':v={'status':'canceled','activated':False}
  elif k=='auth/logout':data['auth']=False
  elif k=='tg-auth/mini':v={'ok':True}
  else:raise Exception(k)
  r.fulfill(status=s,json=v)
 ctx.route('**/_api/**',api);ctx.route('https://telegram.org/**',lambda r:r.fulfill(body='',content_type='text/javascript'))
 def goto(path):
  page.goto('about:blank');page.goto(origin+path)
 loc=lambda css:page.locator(css)
 nav=lambda name:loc('button[data-view='+name+']').click()
 page.clock.set_fixed_time('2026-11-19T03:30:00Z');goto('/app');expect(loc('#forecast')).to_contain_text('ВЕЧЕР');assert data['calls'].count('forecast/today')==1
 loc('#copy').click();assert page.evaluate('navigator.clipboard.readText()')==text
 loc('.source-note summary').click();expect(loc('.source-note p')).to_be_visible()
 for w in [320,390,768,1280]:
  page.set_viewport_size({'width':w,'height':780});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),w
  if w==390:page.screenshot(path='day-mobile.png')
  if w==1280:page.screenshot(path='day-desktop.png')
 page.set_viewport_size({'width':390,'height':780})
 nav('chart');loc('#chart').click();expect(loc('#natal')).to_contain_text('Весы')
 nav('profile');expect(loc('#delivery')).to_contain_text('08:35');loc('#deliverySettings summary').click();loc('#scheduleTime').fill('09:47');loc('#scheduleEnabled').uncheck();loc('#saveSchedule').click();expect(loc('#scheduleStatus')).to_have_text('Настройки сохранены.');assert data['written']['deliveryMinute']==47 and not data['written']['dailyConsent']
 nav('access');expect(loc('#subscription')).to_contain_text('17 декабря');page.go_back();expect(loc('#view-profile')).to_be_visible()
 loc('#profileLink').click();expect(loc('#fullName')).to_have_value('Анна');expect(loc('#deliveryHour')).to_have_value('08:35');expect(loc('#marketingConsent')).to_be_checked()
 loc('#city').fill('Красн');loc('#results button').click();loc('#acceptTerms').check();loc('#pdConsent').check();loc('#save').click();expect(loc('#status')).to_contain_text('Анкета сохранена');assert data['written']['deliveryMinute']==35 and data['written']['birthPlaceId']==5
 loc('#profileForecast').click();expect(loc('#forecast')).to_contain_text('ВЕЧЕР')
 data['fail']=True;goto('/railway-profile');expect(loc('#retry')).to_be_visible();data['fail']=False;loc('#retry').click();expect(loc('#panel')).to_be_visible()
 profile['subscriptionUntil']=None;goto('/app');expect(loc('#preview')).to_be_visible();expect(loc('#today')).to_be_hidden();data['state']='pending';loc('#preview').click();expect(loc('#resultStatus')).to_contain_text('автоматически');data['state']='ready';loc('#preview').click();expect(loc('#forecast')).to_contain_text('ВЕЧЕР')
 profile['registered']=False;goto('/app#chart');expect(loc('#chartProfile')).to_be_visible();expect(loc('#chart')).to_be_hidden();profile['registered']=True
 data['auth']=False;goto('/app#profile');expect(loc('#guest')).to_be_visible();expect(loc('.sidebar')).to_be_hidden();loc('#guest a.button').click();expect(loc('#begin')).to_be_visible();loc('#begin').click();expect(loc('#botlink')).to_be_visible()
 data['auth']=True;page.reload();page.wait_for_url('**/app#profile');expect(loc('#view-profile')).to_be_visible()
 data['auth']=False;goto('/checkout?plan=halfyear');loc('#loginGate a').click();data['auth']=True;page.reload();page.wait_for_url('**/checkout?plan=halfyear');expect(loc('input[value=halfyear]')).to_be_checked();expect(loc('#pay')).to_be_disabled()
 loc('#receiptEmail').fill('fixture@example.org');loc('#acceptOffer').check();loc('#acceptData').check();expect(loc('#pay')).to_be_enabled();loc('#pay').click();expect(loc('#newPurchase')).to_be_visible();loc('#checkOrder').click();loc('#newPurchase').click();expect(loc('#pay')).to_be_disabled()
 goto('/checkout?plan=invalid');expect(loc('input[value=month]')).to_be_checked()
 data['readyForPublicSales']=False;page.reload();expect(loc('#unavailable')).to_be_visible();expect(loc('#pay')).to_be_disabled()
 page.add_init_script("window.Telegram={WebApp:{initData:'fixture',ready(){},expand(){},isVersionAtLeast:()=>true,BackButton:{hide(){},show(){},onClick(f){window.back=f}},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},openLink(u){window.opened=u}}}")
 goto('/app#chart');expect(loc('html')).to_have_class(re.compile('telegram-mini'));nav('access');loc('#paymentLink').click();assert page.evaluate("window.opened.endsWith('/checkout')");page.evaluate('window.back()');expect(loc('#view-day')).to_be_visible()
 goto('/checkout?plan=year');expect(loc('#miniGate')).to_be_visible();loc('#external').click();assert page.evaluate("window.opened.endsWith('/checkout?plan=year')")
 assert not errors,errors
 print('Passed: dashboard states, copy, disclosure, tabs, history, chart, profile, delivery, retry, guest sign-in return, preview, checkout, Telegram bridge, breakpoints 320–1280')
