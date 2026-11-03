// Linked Emoji: premium custom emoji without Premium, compatible with exteraless.
//
// Sending: a premium emoji entity becomes a text link `tg://emoji?id=<document id>` over the plain emoji, which the
// server accepts from anyone. Receiving: such a link over a single emoji is turned back into a custom emoji before
// the message is laid out. Clients without this plugin (or exteraless) just see the plain emoji.

const PREFIX = 'tg://emoji?id='
const PREFIX_LENGTH = PREFIX.length
const jvm = inu.jvm

// ------------------------------------------------------------------ state shared with routines

// routines cannot read JS state, so the toggle lives in a Java object they capture
const AtomicBoolean = jvm.cls('java.util.concurrent.atomic.AtomicBoolean')
const ENABLED: any = new AtomicBoolean(localStorage.getItem('enabled') !== 'false')

function setEnabled(value: boolean): void {
  localStorage.setItem('enabled', String(value))
  ENABLED.call('set', value)
}

// ------------------------------------------------------------------ classes

const UserConfig: any = jvm.cls('org.telegram.messenger.UserConfig')
const MessageObjectCls = jvm.cls('org.telegram.messenger.MessageObject')
const AnimatedEmojiDrawable = jvm.cls('org.telegram.ui.Components.AnimatedEmojiDrawable')
const MessagesController = jvm.cls('org.telegram.messenger.MessagesController')
const MediaDataController = jvm.cls('org.telegram.messenger.MediaDataController')

const Message: any = jvm.cls('org.telegram.tgnet.TLRPC$Message')
const TextUrl: any = jvm.cls('org.telegram.tgnet.TLRPC$TL_messageEntityTextUrl')
const CustomEmoji: any = jvm.cls('org.telegram.tgnet.TLRPC$TL_messageEntityCustomEmoji')
const Emoji: any = jvm.cls('org.telegram.messenger.Emoji')
const JLong: any = jvm.cls('java.lang.Long')

const disposers: Disposer[] = []

function hook(className: string, method: string | null, spec: inu.xposed.MethodHook): void {
  try {
    const cls = jvm.cls(className)
    disposers.push(method === null ? inu.xposed.hookAllConstructors(cls, spec) : inu.xposed.hookAllOverloads(cls, method, spec))
  } catch (e) {
    console.error(`linked-emoji: cannot hook ${className}.${method ?? '<init>'}:`, e)
  }
}

// ------------------------------------------------------------------ receiving: link -> custom emoji

hook('org.telegram.messenger.MessageObject', null, {
  before: inu.xposed.routine((ctx) => {
    if (!ENABLED.get() || ctx.args.length < 2) return
    const message = ctx.args[1]
    if (!(message instanceof Message)) return
    const text = message.message
    const list = message.entities
    if (text === null || list === null || list.isEmpty()) return
    for (let i = 0; i < list.size(); i++) {
      const entity = list.get(i)
      if (!(entity instanceof TextUrl)) continue
      const url = entity.url
      if (url === null || !url.startsWith(PREFIX)) continue
      const start = entity.offset
      const end = start + entity.length
      if (start < 0 || entity.length <= 0 || end > text.length()) continue
      const part = text.substring(start, end)
      const ranges = Emoji.parseEmojis(part)
      if (ranges === null || ranges.size() !== 1) continue
      const range = ranges.get(0)
      if (range.start !== 0 || range.end !== part.length()) continue
      let id = 0
      try {
        id = JLong.parseLong(url.substring(PREFIX_LENGTH))
      } catch (e) {
        continue
      }
      if (id === 0) continue
      const emoji = new CustomEmoji()
      emoji.offset = start
      emoji.length = entity.length
      emoji.document_id = id
      list.set(i, emoji)
    }
  }),
})

// Previews in the chat list (and anything else that turns entities into emoji spans) read the entities directly,
// sometimes of messages created before the plugin loaded or updated in place after sending: convert there too.
hook('org.telegram.messenger.MediaDataController', 'addAnimatedEmojiSpans', {
  before: inu.xposed.routine((ctx) => {
    if (!ENABLED.get()) return
    const list = ctx.args[0]
    const chars = ctx.args[1]
    if (list === null || chars === null || list.isEmpty()) return
    const text = chars.toString()
    for (let i = 0; i < list.size(); i++) {
      const entity = list.get(i)
      if (!(entity instanceof TextUrl)) continue
      const url = entity.url
      if (url === null || !url.startsWith(PREFIX)) continue
      const start = entity.offset
      const end = start + entity.length
      if (start < 0 || entity.length <= 0 || end > text.length()) continue
      const part = text.substring(start, end)
      const ranges = Emoji.parseEmojis(part)
      if (ranges === null || ranges.size() !== 1) continue
      const range = ranges.get(0)
      if (range.start !== 0 || range.end !== part.length()) continue
      let id = 0
      try {
        id = JLong.parseLong(url.substring(PREFIX_LENGTH))
      } catch (e) {
        continue
      }
      if (id === 0) continue
      const emoji = new CustomEmoji()
      emoji.offset = start
      emoji.length = entity.length
      emoji.document_id = id
      list.set(i, emoji)
    }
  }),
})

// ------------------------------------------------------------------ picker: premium emoji are selectable

const isNonPremium = (): boolean => !UserConfig.callStatic('getInstance', UserConfig.getStaticField('selectedAccount')).call('isPremium')

hook('org.telegram.ui.Components.EmojiView', 'allowEmojisForNonPremium', {
  before: inu.xposed.routine((ctx) => {
    if (ENABLED.get() && ctx.args.length === 1) ctx.args[0] = true
  }),
})

hook('org.telegram.ui.Components.EmojiView', null, {
  after: inu.xposed.routine((ctx) => {
    if (ENABLED.get()) ctx.thisObject.allowEmojisForNonPremium(true)
  }),
})

hook('org.telegram.ui.Components.EmojiTabsStrip', 'allowEmojisForNonPremium', {
  after: inu.xposed.routine((ctx) => {
    if (ENABLED.get()) ctx.setReturnValue(true)
  }),
})

// "Premium is required" check right before sending
hook('org.telegram.ui.Components.ChatActivityEnterView', 'checkPremiumAnimatedEmoji', {
  before: inu.xposed.routine((ctx) => {
    if (ENABLED.get()) ctx.setReturnValue(false)
  }),
})

// ------------------------------------------------------------------ sending: custom emoji -> link

type Entity = tl.TypeMessageEntity

/** document ids of the group's own emoji pack, which members may use without Premium */
function groupEmoji(slot: number, peer: tl.TypeInputPeer): Set<string> | null {
  let chatId: number | null = null
  if (peer._ === 'inputPeerChannel') chatId = Number(peer.channel_id)
  else if (peer._ === 'inputPeerChat') chatId = Number(peer.chat_id)
  if (chatId === null) return null
  try {
    const full = MessagesController.callStatic('getInstance', slot).call('getChatFull', chatId)
    const emojiset = full?.getField('emojiset')
    if (!emojiset) return null
    const set = MediaDataController.callStatic('getInstance', slot).call('getGroupStickerSetById', emojiset)
    const docs = set?.getField('documents')
    if (!docs) return null
    const ids = new Set<string>()
    const n: number = docs.call('size')
    for (let i = 0; i < n; i++) ids.add(String(docs.call('get', i).getField('id')))
    return ids
  } catch (e) {
    console.warn('linked-emoji: group emoji lookup failed', e)
    return null
  }
}

function isFree(slot: number, documentId: string): boolean {
  try {
    const doc = AnimatedEmojiDrawable.callStatic('findDocument', slot, BigInt(documentId))
    return MessageObjectCls.callStatic('isFreeEmoji', doc) === true
  } catch {
    return false
  }
}

function linkEntities(account: inu.Account, peer: tl.TypeInputPeer, entities: Entity[] | undefined): Entity[] | undefined {
  if (!entities || entities.length === 0) return entities
  if (!entities.some(e => e._ === 'messageEntityCustomEmoji')) return entities
  if (peer._ === 'inputPeerSelf' || (peer._ === 'inputPeerUser' && Number(peer.user_id) === account.userId)) return entities
  if (UserConfig.callStatic('getInstance', account.id).call('isPremium')) return entities
  const group = groupEmoji(account.id, peer)
  return entities.map((e) => {
    if (e._ !== 'messageEntityCustomEmoji') return e
    if (group?.has(String(e.document_id)) || isFree(account.id, String(e.document_id))) return e
    return { _: 'messageEntityTextUrl', offset: e.offset, length: e.length, url: PREFIX + e.document_id }
  })
}

disposers.push(inu.interceptRpc(
  ['messages.sendMessage', 'messages.sendMedia', 'messages.editMessage', 'messages.saveDraft'],
  (context, next) => {
    if (!ENABLED.call('get')) return next()
    const request = context.request
    request.entities = linkEntities(context.account, request.peer, request.entities)
    return next()
  },
))

disposers.push(inu.interceptRpc('messages.sendMultiMedia', (context, next) => {
  if (!ENABLED.call('get')) return next()
  const request = context.request
  for (const item of request.multi_media) {
    item.entities = linkEntities(context.account, request.peer, item.entities)
  }
  return next()
}))

// ------------------------------------------------------------------ settings

const ru = inu.info().language.startsWith('ru')
const settings = inu.ui.settingsPage({
  title: 'Linked Emoji',
  items: () => [
    inu.ui.check({
      id: 'enabled',
      text: ru ? 'Премиум-эмодзи без Premium' : 'Premium emoji without Premium',
      subtitle: ru
        ? 'Видят пользователи этого плагина и exteraless, остальные — обычный эмодзи'
        : 'Visible to users of this plugin and exteraless, others see a regular emoji',
      multiline: true,
      checked: ENABLED.call('get'),
      onChange: (checked) => {
        setEnabled(checked)
        settings.invalidate()
      },
    }),
    inu.ui.separator(isNonPremium()
      ? (ru ? 'Работает без Premium; с Premium эмодзи отправляются как обычно.' : 'Works without Premium; with Premium emoji are sent as usual.')
      : (ru ? 'У тебя есть Premium: эмодзи отправляются как обычно, плагин только показывает чужие.' : 'You have Premium: emoji are sent as usual, the plugin only shows other people\'s.')),
  ],
})
disposers.push(inu.registerSettings(settings))

inu.onUnload(() => {
  for (const dispose of disposers.splice(0)) {
    try {
      dispose()
    } catch (e) {
      console.error('linked-emoji: dispose failed', e)
    }
  }
})
