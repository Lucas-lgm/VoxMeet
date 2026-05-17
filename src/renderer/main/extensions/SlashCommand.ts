import { Extension, Range } from '@tiptap/core'
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion'

export interface SlashCommandItem {
  title: string
  description?: string
  icon?: string
  command: (props: { editor: any; range: Range }) => void
}

const items: SlashCommandItem[] = [
  {
    title: 'Heading 1',
    icon: 'H1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run()
    },
  },
  {
    title: 'Heading 2',
    icon: 'H2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run()
    },
  },
  {
    title: 'Bold',
    icon: 'B',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBold().run()
    },
  },
  {
    title: 'Bullet List',
    icon: '•',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Ordered List',
    icon: '1.',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Blockquote',
    icon: '❝',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: 'Divider',
    icon: '—',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
]

export const SlashCommand = Extension.create({
  name: 'slash-command',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: true,
        allowedPrefixes: null,
        items: ({ query }) => {
          return items.filter(i =>
            i.title.toLowerCase().includes(query.toLowerCase())
          )
        },
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        render: () => {
          let popup: HTMLDivElement | null = null

          function createPopup() {
            popup = document.createElement('div')
            popup.className = 'slash-menu'
            document.body.appendChild(popup)
            return popup
          }

          function updatePosition(editor: any) {
            if (!popup) return
            const { view } = editor
            const coords = view.coordsAtPos(view.state.selection.from)
            popup.style.left = `${Math.min(coords.left, window.innerWidth - 240)}px`
            popup.style.top = `${coords.bottom + 4}px`
          }

          return {
            onStart: (props: any) => {
              if (!popup) createPopup()
              popup!.innerHTML = ''
              props.items.forEach((item: SlashCommandItem, i: number) => {
                const btn = document.createElement('button')
                btn.className = `slash-menu-item${i === 0 ? ' active' : ''}`
                btn.innerHTML = `<span class="slash-menu-icon">${item.icon || ''}</span><span>${item.title}</span>`
                btn.onclick = () => props.command({ ...item, range: props.range })
                btn.onmouseenter = () => {
                  popup!.querySelectorAll('.slash-menu-item').forEach(el => el.classList.remove('active'))
                  btn.classList.add('active')
                }
                popup!.appendChild(btn)
              })
              updatePosition(props.editor)
              popup!.style.display = 'block'
            },
            onUpdate: (props: any) => {
              if (!popup) return
              popup.innerHTML = ''
              props.items.forEach((item: SlashCommandItem, i: number) => {
                const btn = document.createElement('button')
                btn.className = `slash-menu-item${i === 0 ? ' active' : ''}`
                btn.innerHTML = `<span class="slash-menu-icon">${item.icon || ''}</span><span>${item.title}</span>`
                btn.onclick = () => props.command({ ...item, range: props.range })
                btn.onmouseenter = () => {
                  popup!.querySelectorAll('.slash-menu-item').forEach(el => el.classList.remove('active'))
                  btn.classList.add('active')
                }
                popup!.appendChild(btn)
              })
              updatePosition(props.editor)
            },
            onKeyDown: (props: any) => {
              if (!popup || popup.style.display === 'none') return false
              const items = popup.querySelectorAll('.slash-menu-item')
              const active = popup.querySelector('.slash-menu-item.active') as HTMLElement
              let idx = Array.from(items).indexOf(active)

              if (props.event.key === 'ArrowDown') {
                idx = (idx + 1) % items.length
                items.forEach(el => el.classList.remove('active'))
                items[idx]?.classList.add('active')
                ;(items[idx] as HTMLElement)?.scrollIntoView({ block: 'nearest' })
                return true
              }
              if (props.event.key === 'ArrowUp') {
                idx = (idx - 1 + items.length) % items.length
                items.forEach(el => el.classList.remove('active'))
                items[idx]?.classList.add('active')
                ;(items[idx] as HTMLElement)?.scrollIntoView({ block: 'nearest' })
                return true
              }
              if (props.event.key === 'Enter' || props.event.key === 'Tab') {
                ;(active as HTMLElement)?.click()
                return true
              }
              return false
            },
            onExit: () => {
              if (popup) {
                popup.style.display = 'none'
                popup.innerHTML = ''
              }
            },
          }
        },
      }),
    ]
  },
})
