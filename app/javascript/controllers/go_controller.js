import {Controller} from "@hotwired/stimulus"

function getControls () {
    const controls = document.createElement('a')
    controls.className = 'link--anchor-shade'
    controls.setAttribute('aria-label', 'Open link')

    return controls
}

export default class GoController extends Controller {
    static values = {
        to: String
    }

    connect () {
        if (this.element) {
            this.element.className = 'link--anchor-shade-container'
            const controls = this.element.querySelector(':scope > .link--anchor-shade') || getControls()
            controls.href = this.toValue
            if (!controls.parentElement) { this.element.prepend(controls) }

            if (this.element.classList) { this.element.classList.add('clickable') }
        }
    }
}
