#!/usr/bin/env node
const axios = require("axios");
const inquirer = require("inquirer");
const chalk = require("chalk");

const wait = ms => new Promise(r => setTimeout(r, ms));

const safeRequest = async (fn, label = "") => {
  let tries = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const r = e?.response;
      if (r?.status === 429) {
        const t = r.data?.retry_after || 1000;
        if (t > 50000) console.log(chalk.red("⛔ High rate limit. Waiting..."));
        await wait(t);
      } else {
        if (++tries >= 5) {
          console.log(chalk.red(`❌ Critical failure in ${label}.`), e.message);
          return null;
        }
        await wait(2000);
      }
    }
  }
};

(async () => {
  const { token, source, destination } = await inquirer.prompt([
    { type: "input", name: "token", message: "🔑 User token:" },
    { type: "input", name: "source", message: "📥 Source server ID:" },
    { type: "input", name: "destination", message: "📤 Destination server ID:" },
  ]);

  const headers = { Authorization: `User ${token}`, "Content-Type": "application/json" };
  const map = { roles: {}, cats: {}, chans: {} };
  const api = axios.create({ headers });

  console.log(chalk.blue("🧹 Clearing destination server..."));
  const [channels, roles, emojis] = await Promise.all([
    safeRequest(() => api.get(`/guilds/${destination}/channels`), "channels"),
    safeRequest(() => api.get(`/guilds/${destination}/roles`), "roles"),
    safeRequest(() => api.get(`/guilds/${destination}/emojis`), "emojis"),
  ]);

  for (const ch of channels.data) await safeRequest(() => api.delete(`/channels/${ch.id}`), "delete channel");
  for (const rl of roles.data) if (!rl.managed && rl.name !== "@everyone") 
    await safeRequest(() => api.delete(`/guilds/${destination}/roles/${rl.id}`), "delete role");
  for (const em of emojis.data) await safeRequest(() => api.delete(`/guilds/${destination}/emojis/${em.id}`), "delete emoji");

  console.log(chalk.blue("🎭 Cloning roles..."));
  const sourceRoles = (await safeRequest(() => api.get(`/guilds/${source}/roles`), "source roles")).data.reverse();
  for (const r of sourceRoles) {
    if (r.managed || r.name === "@everyone") continue;
    const z = await safeRequest(() => api.post(`/guilds/${destination}/roles`, {
      name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions
    }), `create role ${r.name}`);
    if (z) map.roles[r.id] = z.data.id;
  }

  console.log(chalk.blue("📁 Cloning categories..."));
  const sourceChannels = (await safeRequest(() => api.get(`/guilds/${source}/channels`), "source channels")).data;
  for (const cat of sourceChannels.filter(c => c.type === 4)) {
    const z = await safeRequest(() => api.post(`/guilds/${destination}/channels`, {
      name: cat.name, type: 4, position: cat.position,
      permission_overwrites: cat.permission_overwrites?.map(po => ({
        id: map.roles[po.id] || po.id, type: po.type, allow: po.allow, deny: po.deny
      }))
    }), `create category ${cat.name}`);
    if (z) map.cats[cat.id] = z.data.id;
  }

  console.log(chalk.blue("💬 Cloning channels..."));
  for (const c1 of sourceChannels.filter(c => c.type !== 4 && ![1, 3].includes(c.type))) {
    const d = {
      name: c1.name, type: c1.type, parent_id: map.cats[c1.parent_id] || null, position: c1.position,
      permission_overwrites: c1.permission_overwrites?.map(po => ({ id: map.roles[po.id] || po.id, type: po.type, allow: po.allow, deny: po.deny }))
    };
    if (c1.topic) d.topic = c1.topic;
    if (typeof c1.nsfw === "boolean") d.nsfw = c1.nsfw;
    if (c1.type === 2) { d.bitrate = c1.bitrate; d.user_limit = c1.user_limit; }
    if ([5, 15, 16].includes(c1.type)) d.default_auto_archive_duration = c1.default_auto_archive_duration || 60;
    if (c1.type === 13) d.rtc_region = c1.rtc_region || null;
    if (c1.type === 0) d.rate_limit_per_user = c1.rate_limit_per_user || 0;

    const z = await safeRequest(() => api.post(`/guilds/${destination}/channels`, d), `create channel ${c1.name}`);
    if (z) map.chans[c1.id] = z.data.id;
  }

  console.log(chalk.blue("😄 Cloning emojis..."));
  const emojisSrc = (await safeRequest(() => api.get(`/guilds/${source}/emojis`), "get emojis")).data;
  for (const e of emojisSrc) {
    try {
      const img = await safeRequest(() => axios.get(`https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}`, { responseType: "arraybuffer" }));
      const b64 = `data:image/${e.animated ? "gif" : "png"};base64,${Buffer.from(img.data).toString("base64")}`;
      await safeRequest(() => api.post(`/guilds/${destination}/emojis`, {
        name: e.name, image: b64, roles: e.roles.map(r => map.roles[r] || r)
      }), `create emoji ${e.name}`);
    } catch {}
  }

  console.log(chalk.blue("📜 Cloning messages..."));
  const destText = Object.entries(map.chans)
    .map(([oid, nid]) => { const orig = sourceChannels.find(c => c.id === oid); return orig?.type === 0 ? { o: oid, n: nid, name: orig.name } : null; })
    .filter(Boolean);

  for (const { o, n, name } of destText) {
    try {
      const msgs = await safeRequest(() => api.get(`/channels/${o}/messages?limit=50`), `get messages ${name}`);
      for (const m of msgs.data.reverse()) {
        const content = `**${m.author.username}#${m.author.discriminator}**: ${m.content || "[empty]"}`;
        await safeRequest(() => api.post(`/channels/${n}/messages`, { content, embeds: m.embeds?.slice(0, 10), components: m.components || [] }), `message ${name}`);
      }
    } catch {}
  }

  console.log(chalk.green.bold("\n✅ Cloning complete without fatal errors.\n"));
})();
