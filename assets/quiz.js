(function () {
  'use strict';

  function normalize(s) {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[.,'"‘’“”]/g, '')
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function expandAliases(member) {
    const set = new Set();
    for (const alias of member.aliases) {
      const norm = normalize(alias);
      if (!norm) continue;
      set.add(norm);
      // Preserve hyphenated last names by splitting BEFORE normalization swaps '-' for ' '.
      const stripped = alias.replace(/,?\s*(Jr\.?|Sr\.?|II|III|IV)\b/gi, '').trim();
      const tokens = stripped.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) {
        const firstRaw = tokens[0];
        const lastRaw = tokens[tokens.length - 1];
        const firstNorm = normalize(firstRaw);
        const lastNorm = normalize(lastRaw);
        if (lastNorm) set.add(lastNorm);
        if (firstNorm && lastNorm) set.add(firstNorm + ' ' + lastNorm);
      }
    }
    return set;
  }

  function buildAcceptIndex(members) {
    const counts = new Map();
    const perMember = members.map(expandAliases);
    perMember.forEach((tokens) => {
      for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
    });
    const accept = new Map();
    perMember.forEach((tokens, idx) => {
      for (const t of tokens) {
        if (counts.get(t) === 1) accept.set(t, idx);
      }
    });
    return accept;
  }

  function groupByState(members, stateNames) {
    const groups = new Map();
    members.forEach((m, idx) => {
      if (!groups.has(m.state)) groups.set(m.state, []);
      groups.get(m.state).push(idx);
    });
    return [...groups.entries()].sort((a, b) => {
      const an = stateNames[a[0]] || a[0];
      const bn = stateNames[b[0]] || b[0];
      return an.localeCompare(bn);
    });
  }

  function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.startsWith('data-')) node.setAttribute(k, attrs[k]);
        else node[k] = attrs[k];
      }
    }
    if (children) for (const c of children) node.appendChild(c);
    return node;
  }

  function partyClass(p) {
    if (p === 'D') return 'party-d';
    if (p === 'R') return 'party-r';
    return 'party-i';
  }

  window.initQuiz = function initQuiz(opts) {
    const data = opts.data;
    const totalSeconds = opts.minutes * 60;
    const showDistrict = !!opts.showDistrict;
    const placeholderCount = opts.placeholderCount || 18;

    const members = data.members;
    const stateNames = data.stateNames;
    const accept = buildAcceptIndex(members);
    const groups = groupByState(members, stateNames);

    const found = new Set();
    let revealed = false;
    let running = false;
    let remaining = totalSeconds;
    let timerId = null;

    const boardEl = document.getElementById('board');
    const inputEl = document.getElementById('quiz-input');
    const scoreEl = document.getElementById('score');
    const totalEl = document.getElementById('total');
    const timerEl = document.getElementById('timer');
    const startBtn = document.getElementById('btn-start');
    const giveUpBtn = document.getElementById('btn-giveup');
    const resetBtn = document.getElementById('btn-reset');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalTitle = document.getElementById('modal-title');
    const modalBig = document.getElementById('modal-big');
    const modalSub = document.getElementById('modal-sub');
    const modalClose = document.getElementById('modal-close');

    totalEl.textContent = members.length;

    const cellEls = new Array(members.length);
    const stateProgressEls = new Map();
    const stateMemberIdx = new Map();

    function buildBoard() {
      const placeholder = '·'.repeat(placeholderCount);
      const frag = document.createDocumentFragment();
      for (const [stateAbbr, idxs] of groups) {
        stateMemberIdx.set(stateAbbr, idxs);
        const section = el('section', { class: 'state', 'data-state': stateAbbr });
        const head = el('div', { class: 'state-head' });
        const h3 = el('h3', { text: stateNames[stateAbbr] || stateAbbr });
        const abbr = el('span', { class: 'abbr', text: stateAbbr });
        h3.appendChild(abbr);
        const prog = el('span', { class: 'state-progress', text: '0/' + idxs.length });
        stateProgressEls.set(stateAbbr, prog);
        head.appendChild(h3);
        head.appendChild(prog);
        section.appendChild(head);

        const cells = el('div', { class: 'cells' });
        for (const idx of idxs) {
          const m = members[idx];
          const cell = el('div', {
            class: 'cell',
            'data-idx': String(idx),
          });
          if (showDistrict && m.district != null) {
            const label = m.district === 0 ? 'AL' : String(m.district).padStart(2, '0');
            cell.appendChild(el('span', { class: 'district', text: label }));
          }
          cell.appendChild(el('span', { class: 'placeholder', text: placeholder }));
          cells.appendChild(cell);
          cellEls[idx] = cell;
        }
        section.appendChild(cells);
        frag.appendChild(section);
      }
      boardEl.innerHTML = '';
      boardEl.appendChild(frag);
    }

    function updateScore() {
      scoreEl.textContent = found.size;
    }

    function updateStateProgress(stateAbbr) {
      const idxs = stateMemberIdx.get(stateAbbr);
      const got = idxs.filter((i) => found.has(i)).length;
      const prog = stateProgressEls.get(stateAbbr);
      prog.textContent = got + '/' + idxs.length;
      prog.classList.toggle('complete', got === idxs.length);
    }

    function revealCell(idx, mode) {
      const cell = cellEls[idx];
      const m = members[idx];
      cell.querySelector('.placeholder')?.remove();
      const existingName = cell.querySelector('.name');
      if (existingName) existingName.remove();
      cell.appendChild(el('span', { class: 'name', text: m.name }));
      cell.classList.remove('party-d', 'party-r', 'party-i');
      cell.classList.add(mode === 'reveal' ? 'revealed' : 'found');
      if (mode !== 'reveal') cell.classList.add(partyClass(m.party), 'just-found');
      setTimeout(() => cell.classList.remove('just-found'), 380);
    }

    function tick() {
      remaining -= 1;
      timerEl.textContent = fmtTime(Math.max(0, remaining));
      if (remaining <= 60) timerEl.classList.add('warning');
      if (remaining <= 10) {
        timerEl.classList.remove('warning');
        timerEl.classList.add('danger');
      }
      if (remaining <= 0) {
        finish('time');
      }
    }

    function start() {
      if (running) return;
      running = true;
      timerEl.classList.remove('warning', 'danger');
      remaining = totalSeconds;
      timerEl.textContent = fmtTime(remaining);
      timerId = setInterval(tick, 1000);
      inputEl.disabled = false;
      inputEl.focus();
      startBtn.disabled = true;
      giveUpBtn.disabled = false;
    }

    function stopTimer() {
      if (timerId) clearInterval(timerId);
      timerId = null;
    }

    function finish(reason) {
      running = false;
      stopTimer();
      inputEl.disabled = true;
      giveUpBtn.disabled = true;
      revealed = true;
      members.forEach((_, idx) => {
        if (!found.has(idx)) revealCell(idx, 'reveal');
      });
      for (const [s] of groups) updateStateProgress(s);
      const got = found.size;
      const total = members.length;
      const pct = Math.round((got / total) * 100);
      modalTitle.textContent =
        reason === 'complete'
          ? 'You named them all.'
          : reason === 'time'
          ? "Time's up."
          : 'Quiz ended.';
      modalBig.textContent = got + ' / ' + total;
      modalSub.textContent =
        reason === 'complete'
          ? 'A perfect run. Care to try the other chamber?'
          : 'You scored ' + pct + '% — review the names below and try again.';
      modalBackdrop.classList.add('show');
    }

    function reset() {
      stopTimer();
      running = false;
      revealed = false;
      remaining = totalSeconds;
      found.clear();
      timerEl.classList.remove('warning', 'danger');
      timerEl.textContent = fmtTime(remaining);
      inputEl.value = '';
      inputEl.disabled = true;
      startBtn.disabled = false;
      giveUpBtn.disabled = true;
      buildBoard();
      updateScore();
      modalBackdrop.classList.remove('show');
    }

    function tryMatch(raw) {
      if (!running) return;
      const t = normalize(raw);
      if (!t) return;
      const idx = accept.get(t);
      if (idx == null) return false;
      if (found.has(idx)) return 'duplicate';
      found.add(idx);
      revealCell(idx, 'found');
      updateStateProgress(members[idx].state);
      updateScore();
      inputEl.value = '';
      inputEl.classList.add('flash-correct');
      setTimeout(() => inputEl.classList.remove('flash-correct'), 220);
      if (found.size === members.length) finish('complete');
      return true;
    }

    inputEl.addEventListener('input', (e) => {
      const v = e.target.value;
      if (!v) return;
      tryMatch(v);
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryMatch(inputEl.value);
      }
      if (e.key === 'Escape') inputEl.value = '';
    });
    startBtn.addEventListener('click', start);
    giveUpBtn.addEventListener('click', () => {
      if (!running) return;
      if (confirm('Give up and reveal remaining names?')) finish('give-up');
    });
    resetBtn.addEventListener('click', reset);
    modalClose.addEventListener('click', () => modalBackdrop.classList.remove('show'));
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) modalBackdrop.classList.remove('show');
    });

    buildBoard();
    updateScore();
    timerEl.textContent = fmtTime(totalSeconds);
    inputEl.disabled = true;
    giveUpBtn.disabled = true;
  };
})();
