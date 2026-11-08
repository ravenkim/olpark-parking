// 올팍 주차 타이밍 — data.js(window.DATA)를 읽어 화면을 그린다. 서버 없음. 그래프는 Apache ECharts(vendor/).
(() => {
  const D = window.DATA;
  const $ = (id) => document.getElementById(id);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = { accent: css('--accent'), track: css('--accent-track'), grey: css('--chart-2'), text: css('--text'), muted: css('--muted'), rule: css('--rule'), font: css('--font') };
  const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const H0 = 5, H1 = 23; // 05시~22시 (입차가 거의 없는 심야 제외)
  const HOURS = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
  const int = (v) => Math.round(v).toLocaleString('ko-KR');
  const sign = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)}%`;
  const hh = (x) => `${String(x).padStart(2, '0') /* taste-skill-ignore: 시각 표기 */}시`;
  const man = (v) => (v === 0 ? '0' : `${v / 10000}만`);
  const esc = (s) => s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
  const concertOn = new Map(D.concerts.map((c) => [c.date, c.title]));

  // 예상 입차 = 같은 요일 평소 시간당 평균 × (공연일이면 시간대별 공연일 증가율)
  const expected = (wd, h, concert) => D.hourly[wd][h] * (concert ? 1 + D.hourUplift[h] : 1);
  const weekday = (iso) => (new Date(iso + 'T00:00:00').getDay() + 6) % 7; // 0=월

  // ---- 공통 차트 설정: 축선 없음, 옅은 가로 격자 4줄, 글자는 본문 글꼴 ----
  const base = () => ({
    animationDuration: 300, animationDurationUpdate: 250,
    textStyle: { fontFamily: C.font, color: C.muted, fontSize: 12 },
    grid: { left: 4, right: 8, top: 12, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(17,26,21,0.04)' } }, // taste-skill-ignore: 막대 위 옅은 강조 띠
      backgroundColor: '#fff', borderColor: C.rule, borderWidth: 1, padding: [6, 10], extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,.08);border-radius:6px;', // taste-skill-ignore: 떠 있는 툴팁
      textStyle: { fontFamily: C.font, color: C.text, fontSize: 13 },
    },
    yAxis: { type: 'value', splitNumber: 4, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: C.rule } }, axisLabel: { color: C.muted } },
  });
  const xCat = (data, every) => ({
    type: 'category', data, axisTick: { show: false }, axisLine: { lineStyle: { color: '#d5dcd7' } },
    axisLabel: { color: C.muted, interval: every - 1, hideOverlap: true },
  });
  const charts = [];
  const make = (el) => { const c = echarts.init(el, null, { renderer: 'svg' }); charts.push(c); new ResizeObserver(() => c.resize()).observe(el); return c; };

  // ---- 조건 입력 ----
  const date = $('date'), hour = $('hour'), concert = $('concert');
  hour.innerHTML = HOURS.map((h) => `<option value="${h}">${hh(h)}</option>`).join('');
  const today = new Date();
  date.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  hour.value = '14';

  function syncConcert() { concert.checked = concertOn.has(date.value); showConcertName(); }
  function showConcertName() {
    const name = concertOn.get(date.value);
    $('concert-name').textContent = name ? `이날 공연: ${name}` : '';
  }

  // ---- 메인 답: 시간대별 예상 입차 (막대를 누르면 그 시각으로) ----
  const hoursChart = make($('chart-hours'));
  hoursChart.on('click', (p) => { hour.value = String(HOURS[p.dataIndex]); render(); });

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
    $('finding').innerHTML = diff < -0.05
      ? `${DAYS[wd]}요일 ${hh(h)}는 하루 중 ${rank}번째로 붐비는 시간입니다. <b>${hh(best)}에 도착하면 입차가 ${Math.round(-diff * 100)}% 적습니다.</b>`
      : `${DAYS[wd]}요일 ${hh(h)}는 하루 중 ${rank}번째로 붐비는 시간이고, 앞뒤 2시간 중 가장 한산한 편입니다.`;

    const narrow = $('chart-hours').clientWidth < 520;
    hoursChart.setOption({
      ...base(),
      xAxis: xCat(HOURS.map(hh), narrow ? 3 : 2),
      tooltip: { ...base().tooltip, formatter: (ps) => `${ps[0].name} · 시간당 약 <b>${int(ps[0].value)}</b>대` },
      series: [{
        type: 'bar', barCategoryGap: '28%', cursor: 'pointer',
        data: day.map((x, i) => ({ value: Math.round(x), itemStyle: { color: HOURS[i] === h ? C.accent : C.track, borderRadius: [4, 4, 0, 0] } })),
        emphasis: { itemStyle: { color: C.accent, opacity: 0.85 } },
      }],
    }, true);
  }

  // ---- 주차구역 ----
  const maxRate = Math.max(...D.zones.map((z) => z.fullRate));
  $('zones').innerHTML = D.zones.map((z, i) => `
    <li class="zone${i < 3 ? ' best' : ''}"${i >= 6 ? ' hidden' : ''} title="기록 ${z.total}건 · 만차 ${z.full} · 혼잡 ${z.busy} · 원활 ${z.free}">
      <span class="name">${z.zone}</span>
      <span class="track" aria-hidden="true"><i style="width:${(z.fullRate / maxRate) * 100}%"></i></span>
      <span class="pct">${Math.round(z.fullRate * 100)}%</span>
    </li>`).join('');
  const more = $('zones-all');
  const label = (open) => { more.textContent = open ? '6개만 보기' : `${D.zones.length}개 구역 모두 보기`; };
  more.addEventListener('click', () => {
    const open = more.getAttribute('aria-expanded') !== 'true';
    [...$('zones').children].slice(6).forEach((li) => { li.hidden = !open; });
    more.setAttribute('aria-expanded', String(open)); label(open);
  });
  label(false);

  // ---- 공연일 효과: 위는 초록(많음), 아래는 회색(적음) ----
  const up = HOURS.map((h) => Math.round(D.hourUplift[h] * 100));
  const peak = HOURS.reduce((a, h) => (D.hourUplift[h] > D.hourUplift[a] && h >= 12 && h <= 19 ? h : a), 12);
  $('uplift-finding').textContent =
    `공연 날은 ${peak}시 입차가 ${sign(D.hourUplift[peak])}, 공연이 끝나는 22시는 ${sign(D.hourUplift[22])}입니다. 공연일 ${D.concertUplift.length}일(2024-07) 기준.`;
  const upChart = make($('chart-uplift'));
  const drawUp = () => upChart.setOption({
    ...base(),
    xAxis: xCat(HOURS.map(hh), $('chart-uplift').clientWidth < 520 ? 4 : 3),
    yAxis: { ...base().yAxis, axisLabel: { color: C.muted, formatter: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%` } },
    tooltip: { ...base().tooltip, formatter: (ps) => `${ps[0].name} · 평소보다 <b>${sign(ps[0].value / 100)}</b>` },
    series: [{
      type: 'bar', barCategoryGap: '28%',
      data: up.map((v) => ({ value: v, itemStyle: { color: v >= 0 ? C.accent : C.grey, borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] } })),
      markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: '#b9c2bc', type: 'solid', width: 1 }, data: [{ yAxis: 0 }] },
    }],
  }, true);

  // ---- 월별: 올림픽공원(초록) · 미사경정공원(회색) ----
  const parks = Object.keys(D.monthly);
  const months = Object.keys(D.monthly[parks[0]]).sort();
  const op = D.monthly['올림픽공원'];
  const top = months.reduce((a, m) => (op[m] > op[a] ? m : a), months[0]);
  $('monthly-finding').textContent = `올림픽공원은 ${top.replace('-', '년 ')}월이 ${int(op[top])}대로 가장 많았습니다.`;
  const colorOf = (p) => (p === '올림픽공원' ? C.accent : C.grey);
  $('monthly-legend').innerHTML = parks.map((p) => `<span><i style="background:${colorOf(p)}"></i>${p}</span>`).join('');
  const monChart = make($('chart-monthly'));
  const drawMon = () => monChart.setOption({
    ...base(),
    xAxis: { ...xCat(months, 12), boundaryGap: false, axisLabel: { color: C.muted, interval: 11, formatter: (m) => m.replace('-01', '년') } },
    yAxis: { ...base().yAxis, axisLabel: { color: C.muted, formatter: man } },
    tooltip: { ...base().tooltip, axisPointer: { type: 'line', lineStyle: { color: '#c5cdc8' } },
      formatter: (ps) => `${ps[0].name}<br>${ps.map((p) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px"></span>${p.seriesName} <b>${int(p.value)}</b>대`).join('<br>')}` },
    series: parks.map((p) => ({
      name: p, type: 'line', data: months.map((m) => D.monthly[p][m]), showSymbol: false, symbolSize: 8,
      lineStyle: { width: 2, color: colorOf(p) }, itemStyle: { color: colorOf(p) }, z: p === '올림픽공원' ? 3 : 2,
    })),
  }, true);

  // ---- 공연 목록 ----
  const recent = D.concerts.slice(-5).reverse();
  $('concerts').innerHTML = recent.map((c) => `
    <li class="row"><button type="button" class="date-btn" data-date="${c.date}" aria-label="${c.date} 17시로 계산">${c.date}</button>
    <span class="title-2" title="${esc(c.title)}">${esc(c.title)}</span>
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

  // 글꼴이 실린 뒤 그려야 축 글자 폭이 맞는다. 폭이 바뀌면 눈금 간격도 다시 계산.
  const drawAll = () => { render(); drawUp(); drawMon(); };
  let w = innerWidth;
  addEventListener('resize', () => { if (Math.abs(innerWidth - w) > 40) { w = innerWidth; drawAll(); } });
  syncConcert();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(drawAll);
})();
