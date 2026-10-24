import {Controller} from "@hotwired/stimulus"

export default class PresenceController extends Controller {
    static values = {
        id: Number
    }

    consumer = null

    connect() {
        if (!this.consumer && this.idValue) {
            this.consumer = window.webPresenceConsumer
            this.viewTimer = setTimeout(() => this.consumer.viewLink(this.idValue), 2000)
        }
    }

    disconnect() {
        clearTimeout(this.viewTimer)
        if (this.consumer) {
            this.consumer.leaveLink()
            this.consumer = null
        }
    }
}
