// 올팍 주차 타이밍 — data.js(window.DATA)를 읽어 화면을 그린다. 서버 없음.
(() => {
  const D = window.DATA;
  const $ = (id) => document.getElementById(id);
  const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const H0 = 5, H1 = 23; // 05시~22시 (입차가 거의 없는 심야 제외)
  const HOURS = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
  const int = Charts.fmt.int, pct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)}%`;
  const concertOn = new Map(D.concerts.map((c) => [c.date, c.title]));

  // 예상 입차 = 같은 요일 평소 시간당 평균 × (공연일이면 시간대별 공연일 증가율)
  const expected = (wd, h, concert) => D.hourly[wd][h] * (concert ? 1 + D.hourUplift[h] : 1);
  const weekday = (iso) => (new Date(iso + 'T00:00:00').getDay() + 6) % 7; // 0=월

  // ---- 조건 입력 ----
  const date = $('date'), hour = $('hour'), concert = $('concert');
  hour.innerHTML = HOURS.map((h) => `<option value="${h}">${String(h).padStart(2, '0') /* taste-skill-ignore: 시각 표기 */}시</option>`).join('');
  const today = new Date();
  date.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  hour.value = '14';

  function syncConcert() {
    const name = concertOn.get(date.value);
    concert.checked = !!name;
    showConcertName();
  }
  function showConcertName() {
    const name = concertOn.get(date.value);
    $('concert-name').textContent = name ? `이날 공연: ${name}` : '';
  }

  // ---- 메인 답 ----
  function render() {
    if (!date.value) return;
    const wd = weekday(date.value), h = +hour.value, c = concert.checked;
    const day = HOURS.map((x) => expected(wd, x, c));
    const v = expected(wd, h, c);
    const rank = [...day].sort((a, b) => b - a).indexOf(v) + 1;
    $('forecast-meta').textContent = `${DAYS[wd]}요일${c ? ' · 공연일' : ''} 기준`;
    $('kpi').innerHTML = `시간당 약 ${int(v)}<small>대</small>`;

    // 앞뒤 2시간 안에서 가장 한산한 시각
    const near = HOURS.filter((x) => Math.abs(x - h) <= 2 && x !== h);
    const best = near.reduce((a, x) => (expected(wd, x, c) < expected(wd, a, c) ? x : a), near[0]);
    const diff = expected(wd, best, c) / v - 1;
    const hh = (x) => `${String(x).padStart(2, '0') /* taste-skill-ignore: 시각 표기 */}시`;
    $('finding').textContent = diff < -0.05
      ? `${DAYS[wd]}요일 ${hh(h)}는 하루 중 ${rank}번째로 붐비는 시간입니다. ${hh(best)}에 도착하면 입차가 ${pct(diff)} 적습니다.`
      : `${DAYS[wd]}요일 ${hh(h)}는 하루 중 ${rank}번째로 붐비는 시간이고, 앞뒤 2시간 중 가장 한산한 편입니다.`;

    Charts.bars($('chart-hours'), {
      labels: HOURS.map(hh), values: day.map(Math.round), highlight: HOURS.indexOf(h), height: 300,
      xAt: HOURS.map((_, i) => i).filter((i) => i % 3 === 0),
    });
  }

  // ---- 주차구역 ----
  $('zones').tBodies[0].innerHTML = D.zones.map((z, i) => `
    <tr${i < 3 ? ' class="best"' : ''}${i >= 6 ? ' hidden' : ''}><th scope="row">${z.zone}</th>
    <td class="n num">${Math.round(z.fullRate * 100)}%</td><td class="n num">${z.free}</td><td class="n num">${z.total}</td></tr>`).join('');

  $('zones-all').addEventListener('click', (e) => {
    const open = e.currentTarget.getAttribute('aria-expanded') === 'true';
    [...$('zones').tBodies[0].rows].slice(6).forEach((r) => { r.hidden = open; });
    e.currentTarget.setAttribute('aria-expanded', String(!open));
    e.currentTarget.textContent = open ? `${D.zones.length}개 구역 모두 보기` : '6개만 보기';
  });
  $('zones-all').textContent = `${D.zones.length}개 구역 모두 보기`;

  // ---- 공연일 효과 ----
  const up = HOURS.map((h) => D.hourUplift[h]);
  const peak = HOURS.reduce((a, h) => (D.hourUplift[h] > D.hourUplift[a] && h >= 12 && h <= 19 ? h : a), 12);
  $('uplift-finding').textContent =
    `공연 날은 ${peak}시 입차가 ${pct(D.hourUplift[peak])}, 공연이 끝나는 22시는 ${pct(D.hourUplift[22])}입니다. 공연일 ${D.concertUplift.length}일(2024-07) 기준.`;
  Charts.diverging($('chart-uplift'), {
    labels: HOURS.map((h) => `${String(h).padStart(2, '0') /* taste-skill-ignore: 시각 표기 */}시`), values: up.map((v) => Math.round(v * 100)),
    above: '평소보다 많음', below: '평소보다 적음', format: (v) => `${int(v)}%`, height: 200,
    xAt: HOURS.map((_, i) => i).filter((i) => i % 3 === 0),
  });

  // ---- 월별 ----
  const parks = Object.keys(D.monthly);
  const months = Object.keys(D.monthly[parks[0]]).sort();
  const op = D.monthly['올림픽공원'];
  const top = months.reduce((a, m) => (op[m] > op[a] ? m : a), months[0]);
  $('monthly-finding').textContent = `올림픽공원은 ${top.replace('-', '년 ')}월이 ${int(op[top])}대로 가장 많았습니다.`;
  Charts.line($('chart-monthly'), {
    labels: months, series: parks.map((p) => ({ name: p, values: months.map((m) => D.monthly[p][m]) })),
    format: int, tickFormat: Charts.fmt.compact, height: 200, legend: $('monthly-legend'),
    xAt: months.map((_, i) => i).filter((i) => i % 12 === 0),
  });

  // ---- 공연 목록 ----
  const recent = D.concerts.slice(-5).reverse();
  $('concerts').innerHTML = recent.map((c) => `
    <li class="row"><button type="button" class="date-btn num" data-date="${c.date}">${c.date}</button>
    <span class="truncate-2">${c.title.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m])}</span>
    <span class="dow">${DAYS[weekday(c.date)]}</span></li>`).join('');
  $('concerts').addEventListener('click', (e) => {
    const b = e.target.closest('.date-btn'); if (!b) return;
    date.value = b.dataset.date; hour.value = '17'; syncConcert(); render();
    $('h-forecast').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  });

  date.addEventListener('change', () => { syncConcert(); render(); });
  hour.addEventListener('change', render);
  concert.addEventListener('change', () => { showConcertName(); render(); });
  $('pick').addEventListener('submit', (e) => e.preventDefault());

  // self-check: 요일 패턴 7×24, 공연일 보정이 공연 없는 날에는 0
  console.assert(D.hourly.length === 7 && D.hourly.every((r) => r.length === 24), 'hourly shape');
  console.assert(expected(0, 8, false) === D.hourly[0][8], 'no-concert = base');

  syncConcert(); render();
})();
