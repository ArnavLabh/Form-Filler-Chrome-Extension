const $ = id => document.getElementById(id);

async function getStorageObj() {
  const store = $('storageSelect').value === 'local' ? chrome.storage.local : chrome.storage.sync;
  return store;
}

async function load() {
  // load preferred storage selection and profile
  const s = await chrome.storage.local.get(['preferredStorage']); // keep preference in local always
  $('storageSelect').value = s.preferredStorage || 'sync';
  const store = await getStorageObj();
  const data = await store.get(['profile', 'customFields']);
  const p = data.profile || {};
  $('name').value = p.name || '';
  $('emails').value = (p.emails||[]).join(',');
  $('phone').value = p.phone || '';
  $('linkedin').value = p.linkedin || '';
  $('github').value = p.github || '';
  renderCustomList(data.customFields || []);
}

function renderCustomList(list) {
  const wrap = $('customList');
  wrap.innerHTML = '';
  list.forEach((it, idx) => {
    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.justifyContent = 'space-between';
    el.style.marginBottom = '6px';
    el.innerHTML = `<div style="flex:1"><strong>${escapeHtml(it.key)}</strong>: ${escapeHtml(it.value)}</div>
                    <div style="margin-left:8px"><button data-idx="${idx}" class="del">Del</button></div>`;
    wrap.appendChild(el);
  });
  wrap.querySelectorAll('.del').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const idx = Number(e.target.dataset.idx);
      const store = await getStorageObj();
      const data = await store.get(['customFields']);
      const list = data.customFields || [];
      list.splice(idx,1);
      await store.set({customFields:list});
      renderCustomList(list);
    });
  });
}

function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

$('addCustom').addEventListener('click', async () => {
  const key = $('customKey').value.trim();
  const value = $('customValue').value.trim();
  if(!key) return alert('Provide a field label');
  const store = await getStorageObj();
  const data = await store.get(['customFields']);
  const list = data.customFields || [];
  list.push({key, value});
  await store.set({customFields: list});
  $('customKey').value = ''; $('customValue').value = '';
  renderCustomList(list);
});

$('storageSelect').addEventListener('change', async () => {
  // persist preference to local
  await chrome.storage.local.set({preferredStorage: $('storageSelect').value});
});

$('save').addEventListener('click', async () => {
  const profile = {
    name: $('name').value.trim(),
    emails: $('emails').value.split(',').map(s=>s.trim()).filter(Boolean),
    phone: $('phone').value.trim(),
    linkedin: $('linkedin').value.trim(),
    github: $('github').value.trim()
  };
  const store = await getStorageObj();
  await store.set({profile});
  alert('Saved');
});

$('fill').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
  if (!tab) return alert('No active tab');
  const store = await getStorageObj();
  const data = await store.get(['profile','customFields']);
  const profile = data.profile || {};
  const customFields = data.customFields || [];

  // inject content script into active tab then message it
  try {
    await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      files: ['content_script.js']
    });
    chrome.tabs.sendMessage(tab.id, {action: 'fillForm', profile, customFields});
  } catch (err) {
    alert('Failed to inject script: ' + err.message);
  }
});

$('export').addEventListener('click', async () => {
  const store = await getStorageObj();
  const data = await store.get(['profile','customFields']);
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'formfiller-profile.json'; a.click();
  URL.revokeObjectURL(url);
});

$('deleteProfile').addEventListener('click', async () => {
  if(!confirm('Delete saved profile and custom fields?')) return;
  const store = await getStorageObj();
  await store.remove(['profile','customFields']);
  renderCustomList([]);
  $('name').value=''; $('emails').value=''; $('phone').value=''; $('linkedin').value=''; $('github').value='';
  alert('Deleted');
});

$('privacyLink').addEventListener('click', () => {
  // replace with your hosted privacy policy
  window.open('https://yourdomain.com/privacy-policy.html', '_blank');
});

load();
