import {Controller} from '@hotwired/stimulus';

// Identity changes use full navigation so ActionCable reconnects with the new
// cookies. Keep the original confirmation when Turbo does not own the form.
export default class extends Controller {
  confirm(event) {
    if(!window.confirm(this.element.dataset.turboConfirm))event.preventDefault();
  }
}
