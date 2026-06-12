import fs from 'node:fs';
const FILE = '/Users/ag/bracket/discord-alpha-dashboard/server/data/server-insights.json';
const ins = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const d30 = [["2026-05-09",984,21.9],["2026-05-10",930,15.5],["2026-05-11",1157,17.8],["2026-05-12",1897,33.3],["2026-05-13",1205,17.5],["2026-05-14",2234,31.9],["2026-05-15",989,13.7],["2026-05-16",925,18.1],["2026-05-17",539,11.5],["2026-05-18",1288,21.1],["2026-05-19",1291,25.8],["2026-05-20",1139,19.6],["2026-05-21",909,17.5],["2026-05-22",519,11.5],["2026-05-23",833,26],["2026-05-24",722,19.5],["2026-05-25",1036,17],["2026-05-26",986,22.4],["2026-05-27",846,18.4],["2026-05-28",2074,31],["2026-05-29",1159,19.6],["2026-05-30",851,17.7],["2026-05-31",694,13.9],["2026-06-01",1509,24.3],["2026-06-02",1341,19.4],["2026-06-03",1678,36.5],["2026-06-04",1685,26.3],["2026-06-05",2178,30.3],["2026-06-06",1223,23.1],["2026-06-07",824,16.2]].map(([date,messages,mpc])=>({date,messages,mpc}));
ins.dailyEngagement = { window: 'May 9 – Jun 7, 2026', series: d30 };

const weekly = [["2026-02-15",37609],["2026-02-22",32656],["2026-03-01",12218],["2026-03-08",11161],["2026-03-15",8891],["2026-03-22",11437],["2026-03-29",9254],["2026-04-05",8933],["2026-04-12",14813],["2026-04-19",7567],["2026-04-26",5901],["2026-05-03",7039],["2026-05-10",9047],["2026-05-17",8959],["2026-05-24",6725],["2026-05-31",7681],["2026-06-07",10450]].map(([date,messages])=>({date,messages}));

const monthly = [["2026-02",83380,21],["2026-03",44702,31],["2026-04",39427,30],["2026-05",34464,31],["2026-06",10438,7]].map(([month,messages,days])=>{
  const [y,m]=month.split('-').map(Number); const dim=new Date(y,m,0).getDate();
  return { date: month, messages, partial: days < dim };
});

ins.captured = '2026-06-08';
ins.messageSeries = {
  updated: '2026-06-07',
  retentionNote: 'Discord Insights retains ~120 days, so weekly/monthly cover the full available history (Feb–Jun 2026), not 52 weeks / 24 months.',
  weekly: { window: 'Feb 15 – Jun 7, 2026 · 17 wks', bars: weekly },
  monthly: { window: 'Feb – Jun 2026', bars: monthly },
};

fs.writeFileSync(FILE, JSON.stringify(ins, null, 2) + '\n');
console.log('patched · daily', d30.length, 'last', JSON.stringify(d30[d30.length-1]), '· weekly', weekly.length, '· monthly Jun', monthly[monthly.length-1]);
