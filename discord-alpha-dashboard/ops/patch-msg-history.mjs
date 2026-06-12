import fs from 'node:fs';
const FILE = '/Users/ag/bracket/discord-alpha-dashboard/server/data/server-insights.json';
const ins = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const d30 = [["2026-05-08",1646,18.5],["2026-05-09",984,21.9],["2026-05-10",930,15.5],["2026-05-11",1157,17.8],["2026-05-12",1897,33.3],["2026-05-13",1205,17.5],["2026-05-14",2234,31.9],["2026-05-15",989,13.7],["2026-05-16",925,18.1],["2026-05-17",539,11.5],["2026-05-18",1288,21.1],["2026-05-19",1291,25.8],["2026-05-20",1139,19.6],["2026-05-21",909,17.5],["2026-05-22",519,11.5],["2026-05-23",833,26],["2026-05-24",722,19.5],["2026-05-25",1036,17],["2026-05-26",986,22.4],["2026-05-27",846,18.4],["2026-05-28",2074,31],["2026-05-29",1159,19.6],["2026-05-30",851,17.7],["2026-05-31",694,13.9],["2026-06-01",1509,24.3],["2026-06-02",1341,19.4],["2026-06-03",1678,36.5],["2026-06-04",1685,26.3],["2026-06-05",2178,30.3],["2026-06-06",1223,23.1]].map(([date,messages,mpc])=>({date,messages,mpc}));
ins.dailyEngagement = { window: 'May 8 – Jun 6, 2026', series: d30 };

const weekly = [["2026-02-14",36490],["2026-02-21",32399],["2026-02-28",14436],["2026-03-07",11519],["2026-03-14",9033],["2026-03-21",11285],["2026-03-28",9342],["2026-04-04",7938],["2026-04-11",15407],["2026-04-18",8143],["2026-04-25",6077],["2026-05-02",7050],["2026-05-09",8709],["2026-05-16",9345],["2026-05-23",6533],["2026-05-30",7699],["2026-06-06",10319]].map(([date,messages])=>({date,messages}));

const monthly = [["2026-02",83380,21],["2026-03",44702,31],["2026-04",39427,30],["2026-05",34464,31],["2026-06",9614,6]].map(([month,messages,days])=>{
  const [y,m]=month.split('-').map(Number);
  const dim=new Date(y,m,0).getDate();
  return { date: month, messages, partial: days < dim };
});

ins.messageSeries = {
  updated: '2026-06-06',
  retentionNote: 'Discord Insights retains ~120 days, so weekly/monthly cover the full available history (Feb 8 – Jun 6, 2026), not 52 weeks / 24 months.',
  weekly: { window: 'Feb 14 – Jun 6, 2026 · 17 wks', bars: weekly },
  monthly: { window: 'Feb – Jun 2026', bars: monthly },
};

fs.writeFileSync(FILE, JSON.stringify(ins, null, 2) + '\n');
console.log('patched · daily', d30.length, '· weekly', weekly.length, '· monthly', JSON.stringify(monthly));
