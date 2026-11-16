// Поиск группы для уведомлений, пока ADMIN_NOTIFY_CHAT_ID не задан: только лог кандидатов, без отправки.
import { test, expect } from "bun:test";
const src = await Bun.file(new URL("../shared/admin-notify.mjs", import.meta.url).pathname).text();
const mod = new Function(src + "\nreturn { drainAdminOutbox };")();

test("без chat id: ничего не отправляет, показывает группы и учитывает перевод в супергруппу", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url).split("/").pop());
    return Response.json({ ok: true, result: [
      { update_id: 1, my_chat_member: { chat: { id: -5001, type: "group", title: "Лиза и разработчик" } } },
      { update_id: 2, message: { chat: { id: -5001, type: "group", title: "Лиза и разработчик" }, migrate_to_chat_id: -1005001 } },
      { update_id: 3, message: { chat: { id: 42, type: "private" }, text: "/start" } }
    ] });
  };
  const env = { ...Bun.env };
  try {
    Bun.env.ADMIN_NOTIFY_BOT_TOKEN = "1:x"; delete Bun.env.ADMIN_NOTIFY_CHAT_ID;
    const r = await mod.drainAdminOutbox({ unsafe: () => { throw new Error("db must not be touched"); } });
    expect(r.skipped).toBe("admin_chat_not_configured");
    expect(r.candidates).toEqual([{ id: -1005001, type: "supergroup", title: "Лиза и разработчик" }]);
    expect(calls).toEqual(["getUpdates"]);
    delete Bun.env.ADMIN_NOTIFY_BOT_TOKEN;
    expect((await mod.drainAdminOutbox({})).skipped).toBe("admin_bot_not_configured");
  } finally { globalThis.fetch = realFetch; Object.assign(Bun.env, env); }
});
