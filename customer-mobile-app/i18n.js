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
    // Profile photo
    'Change photo': 'Palitan ang larawan',
    'Change profile photo': 'Palitan ang larawan sa profile',
    'Remove photo': 'Alisin ang larawan',
    'Your photo': 'Iyong larawan',
    'Photo from your Google account': 'Larawan mula sa iyong Google account',
    'No photo yet': 'Wala pang larawan',
    'Uploading…': 'Ina-upload…',
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
    [/^Due date: (.+)$/, 'Takdang petsa: $1'],
    [/^Due (.+)$/, 'Takdang petsa: $1'],
    [/^Consumption: (.+)$/, 'Konsumo: $1']
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
