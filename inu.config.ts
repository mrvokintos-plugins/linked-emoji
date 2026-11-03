import { defineConfig } from '@inugram/cli'

export default defineConfig({
  plugins: {
    'linked-emoji': {
      entry: 'src/index.ts',
      manifest: {
        id: 'com.github.mrvokintos.linkedemoji',
        name: 'Linked Emoji',
        author: '@mrvokintos_plugins',
        version: process.env.PLUGIN_VERSION || '0.1.0-dev',
        description: 'Send premium emoji without Premium. Others with this plugin or exteraless see them, the rest see a regular emoji.',
        icon: 'inu://star',
        grants: [
          'unsafe.jvm',
          'unsafe.xposed',
          'interceptRpc(messages.sendMessage)',
          'interceptRpc(messages.sendMedia)',
          'interceptRpc(messages.sendMultiMedia)',
          'interceptRpc(messages.editMessage)',
          'interceptRpc(messages.saveDraft)',
        ],
      },
    },
  },
})
