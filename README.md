# linked-emoji

Плагин для [Inugram](https://github.com/teidesu/inugram): премиум-эмодзи без Premium, как в
[exteraless](https://github.com/exteraless/exteraless), и совместимо с ним.

При отправке премиум-эмодзи превращается в обычный эмодзи со ссылкой `tg://emoji?id=<id>`. Сервер принимает такое
от любого аккаунта. У тех, у кого стоит этот плагин или exteraless, ссылка снова рисуется анимированным эмодзи, у
остальных видно обычный эмодзи. Бесплатные эмодзи, эмодзи из пака группы и Избранное не трогаются; с Premium всё
отправляется как обычно.

Установка: добавь [@mrvokintos_plugins_repo](https://t.me/mrvokintos_plugins_repo) в Settings → Plugins →
Repositories и поставь плагин оттуда, или возьми `.inu.js` из [релизов](../../releases). Включается и выключается в
Settings → Plugins → Linked Emoji.

## Как это работает

- `interceptRpc` на `messages.sendMessage`, `sendMedia`, `sendMultiMedia`, `editMessage` и `saveDraft` меняет
  сущности премиум-эмодзи на ссылки.
- Xposed-хуки (routines, без входа в JS) на конструкторах `MessageObject` и на
  `MediaDataController.addAnimatedEmojiSpans` превращают такие ссылки обратно в эмодзи — в чатах, превью и
  остальных местах.
- В пикере включается стоковый флаг `allowEmojisForNonPremium`, а проверка «нужен Premium» перед отправкой
  пропускается.

## Сборка

```sh
pnpm install
pnpm exec inu build      # dist/linked-emoji.inu.js
pnpm push                # на телефон с developer mode
```

Релиз собирается на каждый пуш в `main`, если плагин изменился, и уходит на GitHub и в канал-репозиторий.

GPL-3.0.
