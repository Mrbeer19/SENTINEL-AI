// Posts GitHub activity to the team Discord.
// node discord-notify.js pr   -> pull_request_target / pull_request_review events
// node discord-notify.js ci   -> summary of the "Project checks" jobs (BACKEND_RESULT, FRONTEND_RESULT)
const fs = require('fs');

const mode = process.argv[2];
const event = process.env.GITHUB_EVENT_NAME;
const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const repo = process.env.GITHUB_REPOSITORY;
const server = process.env.GITHUB_SERVER_URL || 'https://github.com';

const COLOR = { green: 0x2ea043, red: 0xd1242f, purple: 0x8957e5, orange: 0xd29922, gray: 0x6e7781, blue: 0x0969da };
const ROLE = { backend: '1568218115131711491', frontend: '1568218118600400976' };
const AVATAR = 'https://cdn.discordapp.com/avatars/1568216348083879966/5e5555704e320d2e1ed8de74f2f21c2c.png';

const cut = (s, n = 300) => {
  s = (s || '').replace(/<!--[\s\S]*?-->/g, '').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const user = (u) => (u ? { name: u.login, icon_url: u.avatar_url, url: u.html_url } : undefined);

async function send(hookVar, embed, content = '', roles = []) {
  const url = process.env[hookVar];
  if (!url) {
    console.log(`${hookVar} not set, skipping`);
    return;
  }
  const body = {
    username: 'SENTINEL GitHub',
    avatar_url: AVATAR,
    content,
    allowed_mentions: { parse: [], roles },
    embeds: [{ footer: { text: repo }, timestamp: new Date().toISOString(), ...embed }],
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  console.log(`sent to ${hookVar}: ${embed.title}`);
}

function prFields(pr) {
  return [
    { name: 'Branch', value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``, inline: true },
    { name: 'Changes', value: `+${pr.additions ?? 0} / −${pr.deletions ?? 0} · ${pr.changed_files ?? 0} files`, inline: true },
  ];
}

async function onPullRequest() {
  const pr = ev.pull_request;
  const title = `#${pr.number} ${pr.title}`;
  const base = { url: pr.html_url, author: user(ev.sender) };
  switch (ev.action) {
    case 'opened':
    case 'reopened':
    case 'ready_for_review': {
      const draft = pr.draft;
      const label = { opened: draft ? '📝 Draft PR' : '🆕 PR ใหม่', reopened: '♻️ เปิด PR อีกครั้ง', ready_for_review: '🚀 พร้อมให้ review' }[ev.action];
      return send('DISCORD_WEBHOOK_PR', {
        ...base,
        title: `${label} · ${title}`,
        description: cut(pr.body),
        color: draft ? COLOR.gray : COLOR.green,
        fields: prFields(pr),
      });
    }
    case 'review_requested': {
      const who = ev.requested_reviewer ? `@${ev.requested_reviewer.login}` : `ทีม ${ev.requested_team?.name}`;
      return send('DISCORD_WEBHOOK_PR', { ...base, title: `👀 ขอ review · ${title}`, description: `${who} ช่วยดู PR นี้หน่อย`, color: COLOR.blue });
    }
    case 'closed':
      if (pr.merged) {
        return send('DISCORD_WEBHOOK_MERGE', {
          ...base,
          author: user(pr.merged_by || ev.sender),
          title: `🟣 Merged · ${title}`,
          description: `\`${pr.head.ref}\` → **\`${pr.base.ref}\`** · ${pr.commits} commits · +${pr.additions} / −${pr.deletions}`,
          color: COLOR.purple,
        });
      }
      return send('DISCORD_WEBHOOK_PR', { ...base, title: `⛔ ปิด PR (ไม่ merge) · ${title}`, color: COLOR.gray });
    default:
      console.log(`ignored pull_request action ${ev.action}`);
  }
}

async function onReview() {
  const { review, pull_request: pr } = ev;
  const kind = {
    approved: ['✅ Approved', COLOR.green],
    changes_requested: ['🔁 ขอให้แก้', COLOR.orange],
    commented: ['💬 คอมเมนต์ review', COLOR.gray],
  }[review.state];
  if (!kind || (review.state === 'commented' && !review.body)) return console.log(`ignored review ${review.state}`);
  return send('DISCORD_WEBHOOK_PR', {
    url: review.html_url,
    author: user(review.user),
    title: `${kind[0]} · #${pr.number} ${pr.title}`,
    description: cut(review.body),
    color: kind[1],
  });
}

async function onCi() {
  const results = { backend: process.env.BACKEND_RESULT, frontend: process.env.FRONTEND_RESULT };
  const icon = { success: '✅', failure: '❌', cancelled: '⚪', skipped: '⏭️' };
  const failed = Object.keys(results).filter((k) => results[k] === 'failure');
  const cancelled = Object.values(results).includes('cancelled');
  const pr = ev.pull_request;
  const branch = pr ? pr.head.ref : process.env.GITHUB_REF_NAME;
  const commit = pr ? pr.head.sha : ev.after || process.env.GITHUB_SHA;
  const message = pr ? `#${pr.number} ${pr.title}` : (ev.head_commit?.message || '').split('\n')[0];
  const state = failed.length ? ['❌ CI ไม่ผ่าน', COLOR.red] : cancelled ? ['⚪ CI ถูกยกเลิก', COLOR.gray] : ['✅ CI ผ่าน', COLOR.green];
  const runUrl = `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;

  let content = '';
  let roles = [];
  if (failed.length && ['dev', 'main'].includes(branch) && !pr) {
    roles = failed.map((k) => ROLE[k]);
    content = `🚨 CI บน \`${branch}\` พัง ${roles.map((r) => `<@&${r}>`).join(' ')} ช่วยดูด้วย`;
  }
  return send(
    'DISCORD_WEBHOOK_CI',
    {
      url: runUrl,
      author: user(ev.sender),
      title: `${state[0]} · ${branch}`,
      description: `${cut(message, 200)}\n\`${commit.slice(0, 7)}\` · [ดู log](${runUrl})${pr ? ` · [PR](${pr.html_url})` : ''}`,
      color: state[1],
      fields: Object.entries(results).map(([k, v]) => ({ name: k, value: `${icon[v] || '❔'} ${v}`, inline: true })),
    },
    content,
    roles,
  );
}

const run = mode === 'ci' ? onCi : event === 'pull_request_review' ? onReview : onPullRequest;
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
