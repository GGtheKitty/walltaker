import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["frame", "report"]

  connect() {
    this.headerObserver = new ResizeObserver(() => this.syncReportPosition())
  }

  disconnect() {
    this.headerObserver.disconnect()
  }

  syncReportPosition() {
    if (!this.hasFrameTarget || !this.hasReportTarget) return

    const header = this.frameTarget.contentDocument?.querySelector("body > header")
    if (!header) return

    if (this.observedHeader !== header) {
      this.headerObserver.disconnect()
      this.headerObserver.observe(header)
      this.observedHeader = header
    }

    const gap = window.matchMedia("(max-width: 600px)").matches ? 8 : 12
    const top = Math.max(gap, Math.ceil(header.getBoundingClientRect().bottom) + gap)
    this.reportTarget.style.setProperty("--profile-report-top", `${top}px`)
  }
}
