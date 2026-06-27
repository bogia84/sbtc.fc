(() => {
  const BYPASS_KEY = 'sbtc_bypass';

  async function checkStatus() {
    try {
      const res = await fetch(`data/site-status.json?t=${Date.now()}`);
      if (!res.ok) return;
      const status = await res.json();
      if (status.published) return;

      if (status.bypassPassword && localStorage.getItem(BYPASS_KEY) === status.bypassPassword) return;

      showOverlay(status.bypassPassword || '');
    } catch {}
  }

  function showOverlay(bypassPw) {
    const overlay = document.createElement('div');
    overlay.id = 'site-guard-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:#120a10;display:flex;flex-direction:column;
      justify-content:center;align-items:center;gap:20px;
    `;
    overlay.innerHTML = `
      <div style="font-size:3rem;font-weight:900;color:#e82a63;letter-spacing:4px;">SBTC FC</div>
      <div style="color:#aaa;font-size:1.1rem;">Site đang bảo trì. Vui lòng quay lại sau.</div>
      ${bypassPw ? `
        <div id="guard-form" style="display:flex;gap:10px;margin-top:10px;">
          <input id="guard-pw" type="password" placeholder="Mật khẩu bypass"
            style="padding:10px 16px;border-radius:8px;border:1px solid #e82a63;
                   background:#1e0e1a;color:#fff;font-size:1rem;outline:none;">
          <button onclick="window._guardCheck()"
            style="padding:10px 20px;background:#e82a63;color:#fff;border:none;
                   border-radius:8px;cursor:pointer;font-weight:bold;">OK</button>
        </div>
        <div id="guard-err" style="color:#e82a63;font-size:0.9rem;opacity:0;transition:opacity 0.2s;">Sai mật khẩu</div>
      ` : ''}
    `;
    document.body.appendChild(overlay);

    if (bypassPw) {
      window._guardCheck = () => {
        const input = document.getElementById('guard-pw').value;
        if (input === bypassPw) {
          localStorage.setItem(BYPASS_KEY, bypassPw);
          overlay.remove();
        } else {
          const err = document.getElementById('guard-err');
          err.style.opacity = '1';
          const form = document.getElementById('guard-form');
          form.style.animation = 'none';
          setTimeout(() => { form.style.animation = 'shake 0.3s ease'; }, 10);
        }
      };
      document.getElementById('guard-pw').addEventListener('keydown', e => {
        if (e.key === 'Enter') window._guardCheck();
      });
    }
  }

  checkStatus();
  setInterval(checkStatus, 30000);
})();
