import type { ButtonOptions, SliderOptions, TextOptions, ToggleOptions, UIContext } from '@/core/types'

const formatNumber = (value: number) => (Math.abs(value) < 1 ? value.toFixed(3) : value.toFixed(2))

export class UIBridge implements UIContext {
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  clear() {
    this.container.innerHTML = ''
  }

  slider(options: SliderOptions) {
    const wrapper = document.createElement('div')
    wrapper.className = 'ui-row slider'

    const label = document.createElement('label')
    label.textContent = options.label
    label.htmlFor = options.id

    const track = document.createElement('div')
    track.className = 'slider-track'

    const input = document.createElement('input')
    input.type = 'range'
    input.id = options.id
    input.min = options.min.toString()
    input.max = options.max.toString()
    input.step = (options.step ?? 0.01).toString()
    input.value = options.value.toString()

    const value = document.createElement('span')
    value.className = 'value'
    value.textContent = formatNumber(options.value)

    input.addEventListener('input', () => {
      const v = Number(input.value)
      value.textContent = formatNumber(v)
      options.onChange(v)
    })

    track.appendChild(input)
    track.appendChild(value)
    wrapper.append(label, track)
    this.container.appendChild(wrapper)
  }

  toggle(options: ToggleOptions) {
    const wrapper = document.createElement('div')
    wrapper.className = 'ui-row toggle'

    const label = document.createElement('label')
    label.textContent = options.label
    label.htmlFor = options.id

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.id = options.id
    input.checked = options.value

    input.addEventListener('change', () => {
      options.onChange(input.checked)
    })

    wrapper.append(label, input)
    this.container.appendChild(wrapper)
  }

  button(options: ButtonOptions) {
    const wrapper = document.createElement('div')
    wrapper.className = 'ui-row button'

    const button = document.createElement('button')
    button.textContent = options.label
    button.id = options.id
    button.addEventListener('click', options.onClick)

    wrapper.appendChild(button)
    this.container.appendChild(wrapper)
  }

  text(options: TextOptions) {
    const wrapper = document.createElement('div')
    wrapper.className = 'ui-row text'

    const label = document.createElement('span')
    label.textContent = options.label

    const value = document.createElement('span')
    value.className = 'value'
    value.textContent = options.value

    wrapper.append(label, value)
    this.container.appendChild(wrapper)

    return (next: string) => {
      value.textContent = next
    }
  }
}
