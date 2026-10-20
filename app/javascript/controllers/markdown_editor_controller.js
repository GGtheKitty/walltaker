import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input", "count", "themeColor"]

  static themeBlockPattern = /<!-- walltaker-theme-start -->[\s\S]*?<!-- walltaker-theme-end -->\n*/

  connect() {
    this.originalTheme = new Map(
      this.allowedThemeVariables.map(variable => [
        variable,
        document.documentElement.style.getPropertyValue(`--${variable}`)
      ])
    )
    this.loadTheme()
    this.applyTheme()
    this.updateCount()
  }

  disconnect() {
    for (const [variable, value] of this.originalTheme) {
      if (value) {
        document.documentElement.style.setProperty(`--${variable}`, value)
      } else {
        document.documentElement.style.removeProperty(`--${variable}`)
      }
    }
  }

  bold() {
    this.wrapSelection("**", "**", "bold text")
  }

  italic() {
    this.wrapSelection("_", "_", "italic text")
  }

  underline() {
    this.wrapSelection("++", "++", "underlined text")
  }

  strikethrough() {
    this.wrapSelection("~~", "~~", "struck text")
  }

  heading() {
    this.prefixLines("## ", "Heading")
  }

  inlineCode() {
    this.wrapSelection("`", "`", "code")
  }

  quote() {
    this.prefixLines("> ", "Quote")
  }

  bulletedList() {
    this.prefixLines("- ", "List item")
  }

  selectedTextColor(event) {
    const color = event.currentTarget.value
    if (!this.validColor(color)) return

    this.wrapSelection(`<span style="color: ${color};">`, "</span>", "colored text")
  }

  themeColor(event) {
    const variable = event.currentTarget.dataset.themeVariable
    const color = event.currentTarget.value
    if (!this.allowedThemeVariables.includes(variable) || !this.validColor(color)) return

    this.theme.set(variable, color)
    this.applyThemeVariable(variable, color)
  }

  confirmSave(event) {
    if (!window.confirm("Are you sure you want to save? This will overwrite your current profile.")) {
      event.preventDefault()
    }
  }

  prepareFormData(event) {
    const block = this.serializedThemeBlock()
    const source = this.inputTarget.value.replace(this.constructor.themeBlockPattern, "")
    const details = block.length > 0 ? `${block}\n\n${source}` : source

    event.formData.set("user[details]", details)
  }

  link() {
    const input = this.inputTarget
    const label = input.value.slice(input.selectionStart, input.selectionEnd) || "link text"
    const rawUrl = window.prompt("Enter a link beginning with https:// or http://")
    if (!rawUrl) return

    let url
    try {
      url = new URL(rawUrl)
    } catch (_error) {
      window.alert("That link is not a valid URL.")
      return
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      window.alert("Only http:// and https:// links are supported.")
      return
    }

    const markup = `[${label}](${url.href.replaceAll(")", "%29")})`
    this.replaceSelection(markup, 1, label.length)
  }

  wrapSelection(before, after, placeholder) {
    const input = this.inputTarget
    const selected = input.value.slice(input.selectionStart, input.selectionEnd) || placeholder
    this.replaceSelection(`${before}${selected}${after}`, before.length, selected.length)
  }

  prefixLines(prefix, placeholder) {
    const input = this.inputTarget
    const selected = input.value.slice(input.selectionStart, input.selectionEnd) || placeholder
    const markup = selected.split(/\r?\n/).map(line => `${prefix}${line}`).join("\n")
    this.replaceSelection(markup, prefix.length, markup.length - prefix.length)
  }

  replaceSelection(markup, selectionOffset, selectionLength) {
    const input = this.inputTarget
    const start = input.selectionStart
    const end = input.selectionEnd

    input.setRangeText(markup, start, end, "end")
    input.focus()
    input.setSelectionRange(start + selectionOffset, start + selectionOffset + selectionLength)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }

  updateCount() {
    this.countTarget.textContent = this.inputTarget.value.length.toLocaleString()
  }

  loadTheme() {
    this.theme = new Map()
    const input = this.inputTarget
    const match = input.value.match(this.constructor.themeBlockPattern)

    if (match) {
      for (const variable of this.allowedThemeVariables) {
        const value = match[0].match(new RegExp(`--${variable}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]
        if (value) this.theme.set(variable, value)
      }

      input.value = input.value.replace(this.constructor.themeBlockPattern, "")
    }

    for (const control of this.themeColorTargets) {
      const value = this.theme.get(control.dataset.themeVariable)
      if (value) control.value = value
    }
  }

  serializedThemeBlock() {
    if (this.theme.size === 0) return ""

    const declarations = this.allowedThemeVariables
      .filter(variable => this.theme.has(variable))
      .map(variable => `  --${variable}: ${this.theme.get(variable)};`)
      .join("\n")

    return `<!-- walltaker-theme-start -->\n<style>\nbody {\n${declarations}\n}\n</style>\n<!-- walltaker-theme-end -->`
  }

  validColor(value) {
    return /^#[0-9a-f]{6}$/i.test(value)
  }

  applyTheme() {
    for (const [variable, color] of this.theme) {
      this.applyThemeVariable(variable, color)
    }
  }

  applyThemeVariable(variable, color) {
    document.documentElement.style.setProperty(`--${variable}`, color)
  }

  get allowedThemeVariables() {
    return ["accent", "bg", "accent-bg", "text"]
  }
}
