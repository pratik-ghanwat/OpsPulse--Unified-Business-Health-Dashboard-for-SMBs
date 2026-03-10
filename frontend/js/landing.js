// ═══════════════════════════════════════
//  OPSPULSE — LANDING PAGE JS
// ═══════════════════════════════════════

const BIZ_META = {
  retail:     { icon: '🏪', name: 'Retail Store' },
  ecommerce:  { icon: '🛒', name: 'E-commerce' },
  restaurant: { icon: '🍽️', name: 'Restaurant' }
};

let selectedBusiness = null;

function selectBusiness(type, el) {
  // Deselect previous
  document.querySelectorAll('.biz-card').forEach(c => c.classList.remove('selected'));

  // Select this one
  el.classList.add('selected');
  selectedBusiness = type;

  // Show launch section
  const launchSection = document.getElementById('launchSection');
  const launchNote    = document.getElementById('launchNote');

  launchSection.classList.add('visible');

  const meta = BIZ_META[type];
  launchNote.textContent = `Loading ${meta.icon} ${meta.name} dataset...`;
}

function launchDashboard() {
  if (!selectedBusiness) return;

  // Store selection
  sessionStorage.setItem('opspulse_biz_type', selectedBusiness);
  sessionStorage.setItem('opspulse_biz_icon', BIZ_META[selectedBusiness].icon);
  sessionStorage.setItem('opspulse_biz_name', BIZ_META[selectedBusiness].name);

  // Animate button
  const btn = document.getElementById('launchBtn');
  btn.innerHTML = '<span class="btn-text">INITIALIZING...</span><span class="btn-pulse"></span>';
  btn.style.opacity = '0.8';
  btn.style.cursor  = 'not-allowed';

  setTimeout(() => {
    window.location.href = 'dashboard.html';
  }, 600);
}