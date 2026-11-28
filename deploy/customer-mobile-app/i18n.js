// OMECOnnect — English / Filipino switch for the customer app.
// Translates the app's own interface text (buttons, labels, headings, menus,
// messages). Content written by OMECO or customers (announcements, concern
// details, names) is never changed. The choice is remembered on this device.
(function () {
  const KEY = 'omeconnect.lang';

  // English (exactly as written in the app) -> Filipino
  const FIL = {
    // Sign-in & accounts
    'Sign in to your account': 'Mag-sign in sa iyong account',
    'Show password': 'Ipakita ang password',
    'View your bills, get outage alerts and report concerns.': 'Tingnan ang iyong bill, tumanggap ng abiso sa brownout, at mag-ulat ng problema.',
    'Keep me signed in on this device': 'Manatiling naka-sign in sa device na ito',
    'Sign in': 'Mag-sign in',
    'Create account': 'Gumawa ng account',
    'Forgot password?': 'Nakalimutan ang password?',
    'or': 'o',
    'Continue with Google': 'Magpatuloy gamit ang Google',
    'Secure sign-in': 'Ligtas na pag-sign in',
    'Verified accounts': 'Beripikadong account',
    'Instant alerts': 'Agarang abiso',
    'Your usage': 'Ang iyong konsumo',
    'Your first bill in the app.': 'Ang iyong unang bill sa app.',
    'Same as your previous bill': 'Pareho sa nakaraang bill',
    'Previous bill': 'Nakaraang bill',
    'Latest bill': 'Pinakabagong bill',
    'kWh per day': 'kWh bawat araw',
    'Tip': 'Payo',
    'Set your air conditioner to 25°C or higher; each degree cooler adds about 7% to its power use.': 'Itakda ang aircon sa 25°C o mas mataas; bawat degree na mas malamig ay nagdadagdag ng mga 7% sa konsumo nito.',
    'Unplug chargers and TVs when not in use. Standby power adds up every month.': 'Hugutin ang charger at TV kapag hindi ginagamit. Nadadagdag buwan-buwan ang standby na kuryente.',
    'Check your refrigerator door seal; a weak seal makes it run longer.': 'Tingnan ang goma ng pinto ng ref; kapag mahina ito, mas matagal tumatakbo ang ref.',
    'Use LED bulbs; they use up to 80% less power than ordinary bulbs.': 'Gumamit ng LED na bombilya; hanggang 80% na mas tipid ito kaysa ordinaryong bombilya.',
    'Iron clothes in one batch instead of a few pieces every day.': 'Mamalantsa nang minsanan sa halip na paunti-unti araw-araw.',
    'Run the washing machine with full loads to save power and water.': 'Gamitin ang washing machine nang punong karga para makatipid sa kuryente at tubig.',
    'Scheduled power interruptions': 'Nakatakdang brownout',
    'Happening now': 'Nangyayari ngayon',
    'Payment history': 'Kasaysayan ng bayad',
    'No payments recorded yet.': 'Wala pang naitalang bayad.',
    'Receipt': 'Resibo',
    'Contact OMECO': 'Makipag-ugnayan sa OMECO',
    'Office': 'Opisina',
    'Hotline': 'Hotline',
    'For emergencies such as fallen wires or fire, call OMECO or 911 right away.': 'Sa emergency gaya ng nahulog na kawad o sunog, tumawag agad sa OMECO o 911.',
    'What is OMECOnnect?': 'Ano ang OMECOnnect?',
    'OMECOnnect is the official customer app of Occidental Mindoro Electric Cooperative (OMECO).': 'Ang OMECOnnect ang opisyal na app para sa mga customer ng Occidental Mindoro Electric Cooperative (OMECO).',
    'Check your electric bills, stay updated on power interruptions, and get help anytime from your phone.': 'Tingnan ang iyong bill sa kuryente, maging updated sa mga brownout, at humingi ng tulong kahit kailan gamit ang iyong phone.',
    'What you can do': 'Ang puwede mong gawin',
    'View your bills': 'Tingnan ang iyong mga bill',
    'See your amount due, due date and online Statement of Account.': 'Makita ang halagang babayaran, due date at online Statement of Account.',
    'Never miss a due date': 'Huwag makalimot sa due date',
    'Get reminders before and on your due date.': 'Makatanggap ng paalala bago at sa mismong due date.',
    'Power outage alerts': 'Abiso sa brownout',
    'Receive OMECO advisories and power interruption notices for your area.': 'Makatanggap ng abiso ng OMECO at paunawa sa brownout para sa iyong lugar.',
    'Report concerns': 'Mag-ulat ng concern',
    'Submit a concern or report a power outage, then track its status.': 'Magpadala ng concern o mag-report ng brownout, at subaybayan ang status nito.',
    'Estimate your bill': 'Tantiyahin ang iyong bill',
    'Turn your meter reading or kWh into an expected amount.': 'Gawing tantiyang halaga ang iyong meter reading o kWh.',
    'Manage your accounts': 'Pamahalaan ang iyong mga account',
    'Link more than one OMECO account, such as your house and store.': 'Mag-link ng higit sa isang OMECO account, gaya ng bahay at tindahan.',
    'How to get started': 'Paano magsimula',
    'Create an account': 'Gumawa ng account',
    'Sign up with your email or your Google account.': 'Mag-sign up gamit ang iyong email o Google account.',
    'Enter the account number printed on your electric bill.': 'Ilagay ang account number na nakasulat sa iyong bill sa kuryente.',
    'Wait for verification': 'Hintayin ang beripikasyon',
    "OMECO staff check your account. You'll be notified once it is approved.": 'Susuriin ng OMECO staff ang iyong account. Aabisuhan ka kapag naaprubahan na.',
    'Your information is protected. Only you can see your bills, and OMECO verifies every account before showing any billing details.': 'Protektado ang iyong impormasyon. Ikaw lang ang makakakita ng iyong bill, at bine-beripika ng OMECO ang bawat account bago ipakita ang anumang detalye ng bill.',
    'Privacy Policy': 'Patakaran sa Privacy',
    'Terms of Service': 'Mga Tuntunin ng Serbisyo',
    'Register': 'Magparehistro',
    'Full name': 'Buong pangalan',
    'Mobile number': 'Numero ng mobile',
    'Municipality (Occidental Mindoro)': 'Bayan (Occidental Mindoro)',
    'Municipality': 'Bayan',
    'OMECO account number': 'Numero ng OMECO account',
    'Choose your municipality': 'Piliin ang iyong bayan',
    'Choose a municipality first': 'Pumili muna ng bayan',
    'Choose your barangay': 'Piliin ang iyong barangay',
    "We'll email you a confirmation link. Creating an account does not link or reveal an electricity account. OMECO staff must verify your account number first.":
      'Padadalhan ka namin ng confirmation link sa email. Ang paggawa ng account ay hindi agad nagli-link o nagpapakita ng iyong electric account. Kailangan munang beripikahin ng OMECO staff ang iyong account number.',
    'Reset password': 'I-reset ang password',
    'Enter your registered email to receive a secure reset link.': 'Ilagay ang iyong rehistradong email para makatanggap ng ligtas na reset link.',
    'Send reset link': 'Ipadala ang reset link',
    'Set a new password': 'Magtakda ng bagong password',
    'Choose a new password for your OMECOnnect account.': 'Pumili ng bagong password para sa iyong OMECOnnect account.',
    'New password': 'Bagong password',
    'Confirm new password': 'Kumpirmahin ang bagong password',
    'At least 10 characters.': 'Hindi bababa sa 10 character.',
    'Save new password': 'I-save ang bagong password',
    'Two-step check': 'Dalawang-hakbang na pagsusuri',
    'Authenticator code': 'Code mula sa authenticator',
    'Verify': 'I-verify',
    'Signing you back in…': 'Ibinabalik ka sa iyong account…',
    'Wrong email or password. Check them and try again, or use "Forgot password?".':
      'Mali ang email o password. Suriin at subukang muli, o gamitin ang "Nakalimutan ang password?".',

    // Home
    'Good morning': 'Magandang umaga',
    'Good afternoon': 'Magandang hapon',
    'Good evening': 'Magandang gabi',
    'Verified account': 'Beripikadong account',
    'Not linked yet': 'Hindi pa naka-link',
    'Account pending verification': 'Hinihintay ang beripikasyon ng account',
    'Amount due': 'Halagang babayaran',
    'No bill due': 'Walang bayarin',
    'View bills': 'Tingnan ang bill',
    'Report issue': 'Mag-ulat',
    'Total due': 'Kabuuang bayarin',
    'Usage': 'Konsumo',
    'Status': 'Katayuan',
    'No bill': 'Walang bill',
    'Unpaid': 'Hindi pa bayad',
    'Paid': 'Bayad na',
    'Due today': 'Takdang petsa ngayon',
    'Due tomorrow': 'Takdang petsa bukas',
    // Bill estimator
    'Estimate my bill': 'Tantyahin ang aking bill',
    'Estimate my next bill': 'Tantyahin ang susunod kong bill',
    'Convert your meter reading or kWh into the expected amount.': 'I-convert ang basa ng metro o kWh sa tantiyang halaga.',
    'Bill estimator': 'Pantantya ng bill',
    'OMECO rate': 'Singil ng OMECO',
    'Meter reading': 'Basa ng metro',
    'Previous reading': 'Nakaraang basa',
    'Current reading': 'Kasalukuyang basa',
    'Total used on the main meter': 'Kabuuang nagamit sa main meter',
    'Submeters': 'Mga submeter',
    '+ Add submeter': '+ Magdagdag ng submeter',
    'Add a submeter for each house or tenant connected to this meter. Their kWh is part of the main meter, so the bill is divided by the kWh each one used. Saved on this phone only.': 'Magdagdag ng submeter para sa bawat bahay o umuupa na nakakabit sa metrong ito. Kasama ang kanilang kWh sa main meter, kaya hinahati ang bill ayon sa kWh na nagamit ng bawat isa. Sa teleponong ito lang naka-save.',
    'Submeter name': 'Pangalan ng submeter',
    'Remove submeter': 'Alisin ang submeter',
    'Enter both readings': 'Ilagay ang dalawang basa',
    'Current is lower than previous': 'Mas mababa ang kasalukuyan kaysa nakaraan',
    'Bill per meter': 'Bill ng bawat metro',
    'Each submeter pays: its kWh ÷ main meter kWh × the whole bill. The owner pays the rest.': 'Bayad ng bawat submeter: kWh nito ÷ kWh ng main meter × buong bill. Ang may-ari ang magbabayad ng natitira.',
    'Main meter owner (you)': 'May-ari ng main meter (ikaw)',
    'Paid to the owner': 'Bayad na sa may-ari',
    'Not paid yet': 'Hindi pa bayad',
    'Whole bill': 'Buong bill',
    'Submeters share': 'Bahagi ng mga submeter',
    'Still to collect': 'Kokolektahin pa',
    'The main meter shows 0 kWh, so there is nothing to divide yet.': '0 kWh ang main meter, kaya wala pang hahatiin.',
    'The submeters add up to more kWh than the main meter. Please check the readings.': 'Mas malaki ang kabuuang kWh ng mga submeter kaysa main meter. Pakisuri ang mga basa.',
    'kWh used in a month': 'kWh na nagamit sa isang buwan',
    'Estimated bill': 'Tantyang bill',
    'Estimated total': 'Tantyang kabuuan',
    'Fixed monthly charge': 'Buwanang fixed charge',
    'Enter your readings to see the estimate.': 'Ilagay ang mga basa para makita ang tantya.',
    'Enter both meter readings.': 'Ilagay ang dalawang basa ng metro.',
    'Not published yet': 'Wala pang nailalathala',
    'Read the black numbers on your meter. Subtract last month\'s reading from today\'s reading to get the kWh you used.': 'Basahin ang itim na numero sa metro. Ibawas ang basa noong nakaraang buwan sa basa ngayon para makuha ang kWh na nagamit.',
    'This is an estimate only. Your official OMECO bill may differ because of rate adjustments, taxes, discounts, or the exact reading date.': 'Tantya lamang ito. Maaaring iba ang opisyal na bill ng OMECO dahil sa pagbabago ng singil, buwis, diskwento, o petsa ng pagbasa.',
    // Power status, payments, bills, meter, concerns, privacy (phase 18)
    'Power in your area': 'Kuryente sa inyong lugar',
    'Report no power': 'I-report: walang kuryente',
    'Tap again to confirm': 'Pindutin ulit para kumpirmahin',
    'This sends an outage report for your barangay.': 'Magpapadala ito ng ulat ng brownout para sa inyong barangay.',
    'No outage reports in your barangay. Power should be normal.': 'Walang ulat ng brownout sa inyong barangay. Normal dapat ang kuryente.',
    'There is an OMECO advisory for your area.': 'May abiso ang OMECO para sa inyong lugar.',
    'Set location': 'Itakda ang lokasyon',
    'Location not set': 'Hindi pa naitakda ang lokasyon',
    'Pay now': 'Magbayad ngayon',
    'Choose which OMECO account to view': 'Piliin ang OMECO account na titingnan',
    'Where your money goes': 'Saan napupunta ang bayad mo',
    'Print / Save as PDF': 'I-print / I-save bilang PDF',
    'Account': 'Account',
    'Billing month': 'Buwan ng bill',
    'Total amount': 'Kabuuang halaga',
    'Amount still due': 'Natitirang babayaran',
    'Send your meter reading': 'Ipadala ang basa ng metro',
    'Read the numbers on your electric meter (kWh) and add a clear photo. OMECO staff will check it.': 'Basahin ang numero sa inyong metro (kWh) at maglagay ng malinaw na larawan. Susuriin ito ng OMECO.',
    'Meter reading (kWh)': 'Basa ng metro (kWh)',
    'Add meter photo': 'Maglagay ng larawan ng metro',
    'Send reading': 'Ipadala ang basa',
    'Your recent readings': 'Mga huling basa mo',
    'Checking': 'Sinusuri',
    'Accepted': 'Tinanggap',
    'Add photos (up to 3)': 'Maglagay ng larawan (hanggang 3)',
    'View updates': 'Tingnan ang mga update',
    'Hide updates': 'Itago ang mga update',
    'How did we do?': 'Kumusta ang aming serbisyo?',
    'Optional comment': 'Komento (opsyonal)',
    'Send rating': 'Ipadala ang rating',
    'Your data and privacy': 'Ang iyong datos at privacy',
    'Under the Data Privacy Act (RA 10173) you can get a copy of your data or delete your OMECOnnect account at any time.': 'Ayon sa Data Privacy Act (RA 10173), maaari mong kunin ang kopya ng iyong datos o burahin ang iyong OMECOnnect account anumang oras.',
    'Download my data': 'I-download ang aking datos',
    'Delete my account': 'Burahin ang aking account',
    'Link another OMECO account': 'Mag-link ng isa pang OMECO account',
    'Privacy Notice': 'Abiso sa Privacy',
    'I agree': 'Sumasang-ayon ako',
    'No, sign me out': 'Hindi, i-sign out ako',
    'Profile photo': 'Larawan sa profile',
    // Profile photo
    'Change photo': 'Palitan ang larawan',
    'Change profile photo': 'Palitan ang larawan sa profile',
    'Remove photo': 'Alisin ang larawan',
    'Your photo': 'Iyong larawan',
    'Photo from your Google account': 'Larawan mula sa iyong Google account',
    'No photo yet': 'Wala pang larawan',
    'Uploading…': 'Ina-upload…',
    'Any photo up to 50 MB (JPG, PNG, HEIC on iPhone).': 'Kahit anong larawan hanggang 50 MB (JPG, PNG, HEIC sa iPhone).',
    'Profile photo updated.': 'Na-update ang larawan sa profile.',
    'Photo removed.': 'Naalis ang larawan.',
    'Photo removed. Showing your Google photo.': 'Naalis ang larawan. Ipinapakita ang larawan mula sa Google.',
    // Bill statuses as stored in the database (lowercase)
    'unpaid': 'hindi pa bayad',
    'paid': 'bayad na',
    'overdue': 'lampas na sa takdang petsa',
    'partial': 'bahagyang bayad',
    'pending': 'nakabinbin',
    'Available': 'Mayroon na',
    'Not available': 'Wala pa',
    'Services': 'Mga Serbisyo',
    'My Bills': 'Aking mga Bill',
    'Report': 'Mag-ulat',
    'Concerns': 'Reklamo',
    'Outage': 'Brownout',
    'Advisories': 'Mga Abiso',
    'Assistant': 'Katuwang',
    'Ask AI': 'Magtanong',
    'Pop-ups on': 'Naka-on',
    'Get the OMECOnnect app': 'Kunin ang OMECOnnect app',
    'View bill details': 'Tingnan ang detalye ng bill',
    'Open my concerns': 'Buksan ang aking mga concern',
    'See all OMECO advisories': 'Tingnan lahat ng abiso ng OMECO',
    'OMECO advisory': 'Abiso ng OMECO',
    'Concern update': 'Update sa concern',
    'Test notification': 'Test na abiso',
    'Notification': 'Abiso',
    'Urgent': 'Agaran',
    "Open your bills and alerts faster from your phone's home screen.": 'Buksan nang mas mabilis ang iyong bill at abiso mula sa home screen ng phone.',
    'Download for Android (APK)': 'I-download para sa Android (APK)',
    'Install on this phone': 'I-install sa phone na ito',
    'How to install': 'Paano i-install',
    'Pop-up alerts on this phone': 'Pop-up na abiso sa phone na ito',
    'Be notified right away about OMECO announcements, outages, new bills and replies to your concerns — even when the app is closed.':
      'Agad kang maaabisuhan tungkol sa mga anunsyo ng OMECO, brownout, bagong bill at sagot sa iyong mga reklamo — kahit nakasara ang app.',
    'Turn on notifications': 'I-on ang notifications',
    'Send me a test notification': 'Padalhan ako ng test notification',

    // Bills
    'Outstanding balance': 'Natitirang balanse',
    'Usage history': 'Kasaysayan ng konsumo',
    'kWh used per month · your latest bill is highlighted': 'kWh na nagamit bawat buwan · naka-highlight ang pinakabagong bill',
    'No bill is available for this verified account.': 'Wala pang bill para sa beripikadong account na ito.',

    // Alerts
    'Alerts': 'Abiso',
    'Notifications': 'Mga Notipikasyon',
    'Mark all as read': 'Markahang nabasa lahat',
    'OMECO advisories': 'Mga abiso ng OMECO',
    'You have no notifications.': 'Wala kang notipikasyon.',
    'No current announcements for your account.': 'Walang kasalukuyang anunsyo para sa iyong account.',
    'New': 'Bago',
    'Read': 'Nabasa',
    'All service areas': 'Lahat ng lugar ng serbisyo',

    // Concerns
    'Concern category': 'Uri ng reklamo',
    'Billing concerns': 'Problema sa bill',
    'Payment problems': 'Problema sa pagbabayad',
    'Power interruptions': 'Brownout / pagkawala ng kuryente',
    'Low voltage': 'Mahinang boltahe',
    'New connection': 'Bagong koneksyon',
    'Other': 'Iba pa',
    'Details': 'Detalye',
    'Describe the issue, service location, and how it affects you.': 'Ilarawan ang problema, lokasyon ng serbisyo, at kung paano ito nakaaapekto sa iyo.',
    'Submit concern': 'Isumite ang reklamo',
    'My concerns': 'Aking mga reklamo',
    'Your submitted concerns will appear here.': 'Dito lalabas ang iyong mga naisumiteng reklamo.',
    'You have not submitted any concerns yet.': 'Wala ka pang naisumiteng reklamo.',
    'Submitted': 'Naisumite',
    'Under review': 'Sinusuri',
    'In progress': 'Inaasikaso',
    'Resolved': 'Nalutas',
    'Closed': 'Sarado',
    'Not accepted': 'Hindi tinanggap',

    // Assistant
    'Send': 'Ipadala',

    // Profile
    'Service area': 'Lugar ng serbisyo',
    'Location': 'Lokasyon',
    'Membership': 'Pagiging miyembro',
    'Residential': 'Residensyal',
    'Pending verification': 'Hinihintay ang beripikasyon',
    'Not linked': 'Hindi naka-link',
    'Not set': 'Hindi pa nakatakda',
    'Your location': 'Iyong lokasyon',
    'Save location': 'I-save ang lokasyon',
    'Two-step verification': 'Dalawang-hakbang na beripikasyon',
    'Set up authenticator app': 'I-set up ang authenticator app',
    'Logout': 'Mag-logout',
    'Change password': 'Palitan ang password',
    'Privacy policy': 'Patakaran sa privacy',
    'Phone notifications: Off (tap to turn on)': 'Phone notifications: Naka-off (i-tap para i-on)',
    'Phone notifications: On (tap to turn off)': 'Phone notifications: Naka-on (i-tap para i-off)',
    'Send a test notification': 'Magpadala ng test notification',
    'Link your OMECO account': 'I-link ang iyong OMECO account',
    'Request verification': 'Humiling ng beripikasyon',

    // Offline notice (live.js)
    'No internet connection': 'Walang koneksyon sa internet',
    'Try again': 'Subukang muli'
  };

  // Text with changing parts (dates, amounts).
  const PATTERNS = [
    [/^(\d+)% higher than your previous bill$/, '$1% mas mataas kaysa nakaraang bill'],
    [/^(\d+)% lower than your previous bill$/, '$1% mas mababa kaysa nakaraang bill'],
    [/^Outage reports in (.+) now$/, 'Mga ulat ng brownout sa $1 ngayon'],
    [/^(\d+) reports?$/, '$1 ulat'],
    [/^For ([A-Z][a-z]+ \d{4})$/, 'Para sa $1'],
    // Due-date chip on Home (must come before the general "Due ..." rule)
    [/^Overdue · (\d+) days?$/, 'Lampas na · $1 araw'],
    [/^Due in (\d+) days$/, 'Takdang petsa sa loob ng $1 araw'],
    [/^Due date: (.+)$/, 'Takdang petsa: $1'],
    [/^Due (.+)$/, 'Takdang petsa: $1'],
    [/^Consumption: (.+)$/, 'Konsumo: $1'],
    // Submeters (estimator.js)
    [/^Paid \((\d+) of (\d+)\)$/, 'Bayad na ($1 sa $2)'],
    [/^Submeters waiting for readings: (\d+)$/, 'Mga submeter na wala pang basa: $1'],
    [/^e\.g\. Tenant (\d+)$/, 'hal. Umuupa $1']
  ];

  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const originalText = new WeakMap(); // text node -> English
  const originalAttr = new WeakMap(); // element -> { attr: English }
  let lang = 'en';

  function toFilipino(text) {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (Object.prototype.hasOwnProperty.call(FIL, trimmed)) return text.replace(trimmed, FIL[trimmed]);
    for (const [pattern, replacement] of PATTERNS) {
      if (pattern.test(trimmed)) return text.replace(trimmed, trimmed.replace(pattern, replacement));
    }
    return null;
  }

  // Concern categories are saved to the database by their English text: lock
  // each option's value before its visible text is translated.
  function lockOptionValues(root) {
    root.querySelectorAll('option:not([value])').forEach((option) => option.setAttribute('value', option.textContent.trim()));
  }

  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, textarea, [data-no-translate]')) return;
      if (lang === 'fil') {
        const english = originalText.has(node) ? originalText.get(node) : node.nodeValue;
        const filipino = toFilipino(english);
        if (filipino !== null) {
          originalText.set(node, english);
          if (node.nodeValue !== filipino) node.nodeValue = filipino;
        }
      } else if (originalText.has(node)) {
        const english = originalText.get(node);
        if (node.nodeValue !== english) node.nodeValue = english;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node;
    if (element.matches('script, style')) return;
    ATTRS.forEach((attr) => {
      if (!element.hasAttribute(attr)) return;
      const saved = originalAttr.get(element) || {};
      const english = saved[attr] !== undefined ? saved[attr] : element.getAttribute(attr);
      if (lang === 'fil') {
        const filipino = toFilipino(english);
        if (filipino !== null) {
          saved[attr] = english;
          originalAttr.set(element, saved);
          element.setAttribute(attr, filipino);
        }
      } else if (saved[attr] !== undefined) {
        element.setAttribute(attr, saved[attr]);
      }
    });
    element.childNodes.forEach(translateNode);
  }

  function translateAll() {
    lockOptionValues(document);
    observer.disconnect();
    translateNode(document.body);
    document.documentElement.lang = lang === 'fil' ? 'fil' : 'en';
    document.querySelectorAll('[data-lang-toggle]').forEach((button) => {
      button.querySelector('.lang-code').textContent = lang === 'fil' ? 'FIL' : 'EN';
      button.setAttribute('aria-label', lang === 'fil' ? 'Switch to English' : 'Lumipat sa Filipino');
      button.title = lang === 'fil' ? 'English' : 'Filipino';
    });
    observe();
  }

  // Keep newly shown text (lists, messages) in the chosen language.
  let pending = false;
  const observer = new MutationObserver((mutations) => {
    if (lang !== 'fil' || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      observer.disconnect();
      mutations.forEach((m) => {
        if (m.type === 'characterData') {
          originalText.delete(m.target); // the app wrote new English text
          translateNode(m.target);
        } else if (m.type === 'attributes') {
          const saved = originalAttr.get(m.target);
          if (saved) delete saved[m.attributeName];
          translateNode(m.target);
        } else {
          m.addedNodes.forEach((n) => { if (n.nodeType === Node.ELEMENT_NODE) lockOptionValues(n); translateNode(n); });
          if (m.target.nodeType === Node.ELEMENT_NODE) m.target.childNodes.forEach((n) => { if (n.nodeType === Node.TEXT_NODE) { originalText.delete(n); translateNode(n); } });
        }
      });
      observe();
    });
  });
  function observe() {
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function setLanguage(next) {
    lang = next === 'fil' ? 'fil' : 'en';
    try { localStorage.setItem(KEY, lang); } catch { /* remembered for this visit only */ }
    translateAll();
  }

  function start() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    const browserFilipino = /^(fil|tl)\b/i.test(navigator.language || '');
    lang = saved === 'fil' || saved === 'en' ? saved : (browserFilipino ? 'fil' : 'en');
    translateAll();
    document.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-lang-toggle]') : null;
      if (button) setLanguage(lang === 'fil' ? 'en' : 'fil');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.OMECO_I18N = { setLanguage, current: () => lang };
})();
