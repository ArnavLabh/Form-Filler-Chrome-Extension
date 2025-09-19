// content_script.js (injected at user request)
// Listens for message, then fills. Does not transmit data outside the browser.

const KEYWORDS = {
  name: [
    'name','full name','first name','last name','your name','applicant name','candidate name'
  ],
  email: [
    'email','e-mail','primary email','secondary email','work email','personal email','contact email','email address'
  ],
  phone: [
    'phone','mobile','mobile number','phone number','contact number','telephone','tel'
  ],
  linkedin: [
    'linkedin','linkedin url','linkedin profile','linked in'
  ],
  github: [
    'github','git hub','github url','git repo','github profile','git profile'
  ],
  company: [
    'company','organisation','organization','employer','current company','company name','organisation name'
  ],
  role: [
    'role','position','job title','designation','current role','position applying for'
  ],
  address: [
    'address','location','city','state','country','postal','pincode','zip'
  ],
  website: [
    'website','site','portfolio','personal website','url','web address'
  ],
  dob: [
    'date of birth','dob','birth date','birthday'
  ],
  college: [
    'college','university','institute','school','college name','university name'
  ],
  graduation_year: [
    'graduation year','year of graduation','passing year','graduated in'
  ]
  // Add more static keys here
};

function lower(s){ return String(s||'').toLowerCase(); }

function textOf(node){
  if(!node) return '';
  return node.textContent ? node.textContent.trim() : '';
}

function getQuestionText(el){
  // Try to find question text by climbing markup near input in Google Forms variations
  let node = el;
  for(let depth=0; depth<5 && node; depth++){
    node = node.parentElement;
    if(!node) break;
    // prefer visible text nodes
    const texts = Array.from(node.querySelectorAll('*'))
      .filter(n => n !== el && n.children.length === 0 && n.textContent && n.textContent.trim().length>0)
      .map(n => n.textContent.trim());
    const combined = texts.join(' ').trim();
    if(combined.length > 2) return combined;
  }
  // fallback to placeholder, aria-label, name
  return el.placeholder || el.getAttribute('aria-label') || el.name || '';
}

function matchKey(questionText, customFields){
  const q = lower(questionText);
  // first check explicit known keywords
  for(const key in KEYWORDS){
    if(KEYWORDS[key].some(k => q.includes(k))) return key;
  }
  // check customFields user labels (exact or substring)
  for(const item of (customFields||[])){
    const k = lower(item.key);
    if(!k) continue;
    if(q.includes(k) || k.includes(q) || q.split(/\s+/).some(tok => k.includes(tok) || tok.includes(k))) {
      // return a safe normalized key name using user label (prefix to avoid collisions)
      return 'custom:' + item.key;
    }
  }
  // heuristics
  if(/\bemail\b/.test(q)) return 'email';
  if(/\bphone\b|\bmobile\b|\bcontact\b/.test(q)) return 'phone';
  if(/\blinkedin\b/.test(q)) return 'linkedin';
  if(/\bgithub\b/.test(q)) return 'github';
  if(/\bname\b/.test(q)) return 'name';
  return null;
}

function setValue(el, value){
  if(value === undefined || value === null) return;
  try {
    if(el.tagName === 'SELECT'){
      for(const opt of el.options){
        if(lower(opt.text).includes(lower(value)) || lower(opt.value).includes(lower(value))){
          el.value = opt.value;
          el.dispatchEvent(new Event('change', {bubbles:true}));
          return;
        }
      }
      return;
    }
    const type = (el.type || '').toLowerCase();
    if(type === 'radio' || type === 'checkbox'){
      // try clicking associated label that contains value
      const labels = document.querySelectorAll('label');
      for(const lab of labels){
        if(lower(lab.textContent).includes(lower(value))){
          lab.click();
          return;
        }
      }
      el.checked = true;
      el.dispatchEvent(new Event('change', {bubbles:true}));
      return;
    }
    // input or textarea
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
  } catch(e){
    console.warn('setValue error', e);
  }
}

async function fillFormFromProfile(profile, customFields){
  if(!profile && (!customFields || customFields.length===0)) return;
  const selectors = 'input:not([type=hidden]), textarea, select';
  const inputs = Array.from(document.querySelectorAll(selectors)).filter(i => i.offsetParent !== null);

  // map each input to a matched key
  const buckets = {};
  for(const el of inputs){
    const q = getQuestionText(el) || el.placeholder || el.name || '';
    const key = matchKey(q, customFields) || 'unknown';
    if(!buckets[key]) buckets[key] = [];
    buckets[key].push({el, question: q});
  }

  // standard keys and filling strategy
  const orderedKeys = ['name','email','phone','linkedin','github','company','role','address','website','dob','college','graduation_year'];

  for(const key of orderedKeys){
    const list = buckets[key] || [];
    if(list.length === 0) continue;
    const value = profile[key] || profile[(key==='email'?'emails':key)];
    if(Array.isArray(value)){
      for(let i=0;i<Math.min(value.length,list.length);i++) setValue(list[i].el, value[i]);
    } else {
      setValue(list[0].el, value);
      for(let i=1;i<list.length;i++) setValue(list[i].el, value);
    }
  }

  // handle custom fields provided by user
  for(const cf of (customFields||[])){
    const bucketKey = 'custom:' + cf.key;
    const list = buckets[bucketKey] || [];
    for(const it of list) setValue(it.el, cf.value);
  }

  // last pass: fill unknowns heuristically
  if(buckets['unknown']){
    for(const it of buckets['unknown']){
      const q = lower(it.question);
      if(q.includes('linkedin') && profile.linkedin) setValue(it.el, profile.linkedin);
      else if(q.includes('github') && profile.github) setValue(it.el, profile.github);
      else if(q.includes('email') && profile.emails && profile.emails.length) setValue(it.el, profile.emails[0]);
      else if(q.includes('name') && profile.name) setValue(it.el, profile.name);
    }
  }
}

// receive message from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(msg.action === 'fillForm'){
    const profile = msg.profile || {};
    const customFields = msg.customFields || [];
    fillFormFromProfile(profile, customFields);
  }
});
